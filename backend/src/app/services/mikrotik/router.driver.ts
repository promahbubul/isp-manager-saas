import { RouterOsClient, RosOptions, RosRecord } from "./routeros.client";

export type RouterInfo = {
  identity: string;
  version: string;
  board: string;
  uptime: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
};

export type PppSecret = {
  name: string;
  password?: string;
  profile: string;
  service: string;
  disabled: boolean;
  comment?: string;
};

export type ActiveSession = {
  name: string;
  address?: string;
  callerId?: string;
  uptime?: string;
};

/** download = router → customer (tx on the interface), upload = customer → router (rx) */
export type SessionTraffic = { downloadBytes: number; uploadBytes: number };

export type SecretInput = {
  name: string;
  password: string;
  profile: string;
  disabled?: boolean;
  comment?: string;
};

/** Everything the app needs from a router. Real = RouterOS API; tests use a fake. */
export interface RouterDriver {
  info(): Promise<RouterInfo>;
  listProfiles(): Promise<string[]>;
  listSecrets(): Promise<PppSecret[]>;
  findSecret(name: string): Promise<PppSecret | null>;
  /** create, or update if a secret with that name already exists */
  upsertSecret(input: SecretInput): Promise<void>;
  renameSecret(oldName: string, newName: string): Promise<void>;
  setSecretDisabled(name: string, disabled: boolean): Promise<void>;
  removeSecret(name: string): Promise<void>;
  listActive(): Promise<ActiveSession[]>;
  findActive(name: string): Promise<ActiveSession | null>;
  /** disconnect the active PPP session (if any); returns true if one was removed */
  kick(name: string): Promise<boolean>;
  /** bytes on the customer's dynamic PPPoE interface since they connected (null if offline) */
  sessionTraffic(name: string): Promise<SessionTraffic | null>;
  close(): void;
}

const toSecret = (r: RosRecord): PppSecret => ({
  name: r.name,
  password: r.password,
  profile: r.profile,
  service: r.service,
  disabled: r.disabled === "true" || r.disabled === "yes",
  comment: r.comment,
});

export class RouterOsDriver implements RouterDriver {
  private constructor(private readonly client: RouterOsClient) {}

  static async connect(opts: RosOptions): Promise<RouterOsDriver> {
    const client = new RouterOsClient(opts);
    await client.connect();
    return new RouterOsDriver(client);
  }

  async info(): Promise<RouterInfo> {
    const [[res], [id]] = await Promise.all([
      this.client.write("/system/resource/print"),
      this.client.write("/system/identity/print"),
    ]);
    return {
      identity: id?.name ?? "",
      version: res?.version ?? "",
      board: res?.["board-name"] ?? "",
      uptime: res?.uptime ?? "",
      cpuLoad: Number(res?.["cpu-load"] ?? 0),
      freeMemory: Number(res?.["free-memory"] ?? 0),
      totalMemory: Number(res?.["total-memory"] ?? 0),
    };
  }

  async listProfiles() {
    const rows = await this.client.write("/ppp/profile/print");
    return rows.map((r) => r.name).filter(Boolean);
  }

  async listSecrets() {
    const rows = await this.client.write("/ppp/secret/print");
    return rows.filter((r) => r.name).map(toSecret);
  }

  private async secretId(name: string): Promise<string | null> {
    const rows = await this.client.write("/ppp/secret/print", {}, { name });
    return rows[0]?.[".id"] ?? null;
  }

  async findSecret(name: string) {
    const rows = await this.client.write("/ppp/secret/print", {}, { name });
    return rows[0]?.name ? toSecret(rows[0]) : null;
  }

  async upsertSecret({ name, password, profile, disabled = false, comment }: SecretInput) {
    const id = await this.secretId(name);
    const attrs = { password, profile, disabled: disabled ? "yes" : "no", comment };
    if (id) await this.client.write("/ppp/secret/set", { ".id": id, ...attrs });
    else await this.client.write("/ppp/secret/add", { name, service: "pppoe", ...attrs });
  }

  async renameSecret(oldName: string, newName: string) {
    const id = await this.secretId(oldName);
    if (id) await this.client.write("/ppp/secret/set", { ".id": id, name: newName });
  }

  async setSecretDisabled(name: string, disabled: boolean) {
    const id = await this.secretId(name);
    if (!id) throw new Error(`PPP secret "${name}" not found on router`);
    await this.client.write("/ppp/secret/set", { ".id": id, disabled: disabled ? "yes" : "no" });
  }

  async removeSecret(name: string) {
    const id = await this.secretId(name);
    if (id) await this.client.write("/ppp/secret/remove", { ".id": id });
  }

  async listActive() {
    const rows = await this.client.write("/ppp/active/print");
    return rows
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, address: r.address, callerId: r["caller-id"], uptime: r.uptime }));
  }

  async findActive(name: string) {
    const [r] = await this.client.write("/ppp/active/print", {}, { name });
    return r?.name ? { name: r.name, address: r.address, callerId: r["caller-id"], uptime: r.uptime } : null;
  }

  async kick(name: string) {
    const rows = await this.client.write("/ppp/active/print", {}, { name });
    const ids = rows.map((r) => r[".id"]).filter(Boolean);
    for (const id of ids) await this.client.write("/ppp/active/remove", { ".id": id });
    return ids.length > 0;
  }

  async sessionTraffic(name: string) {
    // RouterOS names the dynamic PPPoE server interface <pppoe-USERNAME>
    const [r] = await this.client.write("/interface/print", {}, { name: `<pppoe-${name}>` });
    if (!r?.name) return null;
    return { downloadBytes: Number(r["tx-byte"] ?? 0), uploadBytes: Number(r["rx-byte"] ?? 0) };
  }

  close() {
    this.client.close();
  }
}
