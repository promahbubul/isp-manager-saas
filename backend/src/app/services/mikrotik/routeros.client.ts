import crypto from "crypto";
import net from "net";
import tls from "tls";

/**
 * Minimal MikroTik RouterOS API client (TCP 8728, TLS 8729).
 * Protocol: https://help.mikrotik.com/docs/display/ROS/API
 *
 * Commands run one at a time per connection (no tags), which is all the
 * billing workflows need and keeps the parser simple.
 */

export type RosRecord = Record<string, string>;

export type RosOptions = {
  host: string;
  port?: number;
  user: string;
  password: string;
  tls?: boolean;
  /** ms, applies to connect and to each command */
  timeout?: number;
};

export class RosError extends Error {
  constructor(
    message: string,
    public category?: string,
  ) {
    super(message);
    this.name = "RosError";
  }
}

/* ───────────── word / sentence encoding ───────────── */

export function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) {
    return Buffer.from([(len >>> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.from([0xf0, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

export function encodeSentence(words: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const w of words) {
    const b = Buffer.from(w, "utf8");
    parts.push(encodeLength(b.length), b);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/** Returns [length, bytesUsed] or null if the buffer is too short. */
export function decodeLength(buf: Buffer, offset: number): [number, number] | null {
  if (offset >= buf.length) return null;
  const b = buf[offset];
  const need = (n: number) => offset + n <= buf.length;
  if ((b & 0x80) === 0x00) return [b, 1];
  if ((b & 0xc0) === 0x80) return need(2) ? [((b & 0x3f) << 8) | buf[offset + 1], 2] : null;
  if ((b & 0xe0) === 0xc0) {
    return need(3) ? [((b & 0x1f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2], 3] : null;
  }
  if ((b & 0xf0) === 0xe0) {
    return need(4)
      ? [((b & 0x0f) * 0x1000000) + (buf[offset + 1] << 16) + (buf[offset + 2] << 8) + buf[offset + 3], 4]
      : null;
  }
  if (b === 0xf0) return need(5) ? [buf.readUInt32BE(offset + 1), 5] : null;
  throw new RosError(`Invalid length byte 0x${b.toString(16)}`);
}

/** Incremental parser: feed bytes, get complete sentences. */
export class SentenceParser {
  private buf: Buffer = Buffer.alloc(0);
  private words: string[] = [];

  push(chunk: Buffer): string[][] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const sentences: string[][] = [];
    let offset = 0;
    for (;;) {
      const len = decodeLength(this.buf, offset);
      if (!len) break;
      const [size, used] = len;
      if (offset + used + size > this.buf.length) break;
      offset += used;
      if (size === 0) {
        sentences.push(this.words);
        this.words = [];
      } else {
        this.words.push(this.buf.toString("utf8", offset, offset + size));
        offset += size;
      }
    }
    this.buf = this.buf.subarray(offset);
    return sentences;
  }
}

/* ───────────── client ───────────── */

type Pending = {
  resolve: (rows: RosRecord[]) => void;
  reject: (err: Error) => void;
  rows: RosRecord[];
  trap?: RosError;
  timer: NodeJS.Timeout;
};

function parseAttributes(words: string[]): RosRecord {
  const rec: RosRecord = {};
  for (const w of words) {
    if (!w.startsWith("=")) continue;
    const eq = w.indexOf("=", 1);
    if (eq === -1) rec[w.slice(1)] = "";
    else rec[w.slice(1, eq)] = w.slice(eq + 1);
  }
  return rec;
}

export class RouterOsClient {
  private socket?: net.Socket;
  private parser = new SentenceParser();
  private pending?: Pending;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly timeout: number;

  constructor(private readonly opts: RosOptions) {
    this.timeout = opts.timeout ?? 10_000;
  }

  async connect(): Promise<void> {
    const port = this.opts.port ?? (this.opts.tls ? 8729 : 8728);
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(new RosError(`Cannot connect to ${this.opts.host}:${port} — ${err.message}`));
      const socket = this.opts.tls
        ? // RouterOS ships self-signed certificates; the link should run over the platform VPN.
          tls.connect({ host: this.opts.host, port, rejectUnauthorized: false }, () => resolve())
        : net.connect({ host: this.opts.host, port }, () => resolve());
      socket.setTimeout(this.timeout, () => socket.destroy(new Error("connection timed out")));
      socket.once("error", onError);
      socket.on("data", (chunk) => this.onData(chunk));
      socket.on("close", () => this.onClose());
      this.socket = socket;
    });
    this.socket!.removeAllListeners("error");
    this.socket!.on("error", (err) => this.failPending(new RosError(err.message)));
    this.socket!.setTimeout(0);
    await this.login();
  }

  private async login() {
    const res = await this.write("/login", { name: this.opts.user, password: this.opts.password });
    // RouterOS < 6.43 answers with an MD5 challenge.
    const challenge = res[0]?.ret;
    if (challenge) {
      const md5 = crypto
        .createHash("md5")
        .update(Buffer.concat([Buffer.from([0]), Buffer.from(this.opts.password), Buffer.from(challenge, "hex")]))
        .digest("hex");
      await this.write("/login", { name: this.opts.user, response: `00${md5}` });
    }
  }

  /**
   * Run a command. `attrs` become `=key=value`, `queries` become `?key=value`.
   * Resolves with the `!re` rows (plus the `!done` attributes as the last row if any).
   */
  write(command: string, attrs: Record<string, string | undefined> = {}, queries: Record<string, string> = {}) {
    const words = [
      command,
      ...Object.entries(attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `=${k}=${v}`),
      ...Object.entries(queries).map(([k, v]) => `?${k}=${v}`),
    ];
    const run = () =>
      new Promise<RosRecord[]>((resolve, reject) => {
        if (this.closed || !this.socket) return reject(new RosError("Connection is closed"));
        const timer = setTimeout(() => {
          this.failPending(new RosError(`Command timed out: ${command}`));
          this.socket?.destroy();
        }, this.timeout);
        this.pending = { resolve, reject, rows: [], timer };
        this.socket.write(encodeSentence(words));
      });
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private onData(chunk: Buffer) {
    for (const sentence of this.parser.push(chunk)) {
      const [type, ...rest] = sentence;
      const p = this.pending;
      if (!p) continue;
      if (type === "!re") p.rows.push(parseAttributes(rest));
      else if (type === "!trap") {
        const a = parseAttributes(rest);
        p.trap = new RosError(a.message || "RouterOS error", a.category);
      } else if (type === "!fatal") {
        this.failPending(new RosError(rest.join(" ") || "RouterOS fatal error"));
        this.socket?.destroy();
      } else if (type === "!done") {
        clearTimeout(p.timer);
        this.pending = undefined;
        if (p.trap) p.reject(p.trap);
        else {
          const done = parseAttributes(rest);
          p.resolve(Object.keys(done).length ? [...p.rows, done] : p.rows);
        }
      }
    }
  }

  private failPending(err: Error) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = undefined;
    p.reject(err);
  }

  private onClose() {
    this.closed = true;
    this.failPending(new RosError("Connection closed by router"));
  }

  close() {
    this.closed = true;
    this.socket?.end();
    this.socket?.destroy();
  }
}
