import { setRouterDriverFactory } from "../app/services/mikrotik/mikrotik.service";
import { ActiveSession, PppSecret, RouterDriver, SecretInput } from "../app/services/mikrotik/router.driver";

/** In-memory MikroTik keyed by host, so tests can inspect what the app pushed. */
export class FakeRouterState {
  secrets = new Map<string, PppSecret>();
  active = new Map<string, ActiveSession>();
  profiles = ["5M", "10M", "20M"];
  reachable = true;
  password = "routerpass";
}

const routers = new Map<string, FakeRouterState>();

export function fakeRouter(host: string): FakeRouterState {
  let r = routers.get(host);
  if (!r) {
    r = new FakeRouterState();
    routers.set(host, r);
  }
  return r;
}

export function resetFakeRouters() {
  routers.clear();
}

class FakeDriver implements RouterDriver {
  constructor(private r: FakeRouterState) {}
  async info() {
    return { identity: "Fake", version: "7.15", board: "CHR", uptime: "1d", cpuLoad: 3, freeMemory: 1, totalMemory: 2 };
  }
  async listProfiles() {
    return this.r.profiles;
  }
  async listSecrets() {
    return [...this.r.secrets.values()];
  }
  async findSecret(name: string) {
    return this.r.secrets.get(name) ?? null;
  }
  async upsertSecret(s: SecretInput) {
    this.r.secrets.set(s.name, {
      name: s.name,
      password: s.password,
      profile: s.profile,
      service: "pppoe",
      disabled: Boolean(s.disabled),
      comment: s.comment,
    });
  }
  async renameSecret(oldName: string, newName: string) {
    const s = this.r.secrets.get(oldName);
    if (!s) return;
    this.r.secrets.delete(oldName);
    this.r.secrets.set(newName, { ...s, name: newName });
  }
  async setSecretDisabled(name: string, disabled: boolean) {
    const s = this.r.secrets.get(name);
    if (!s) throw new Error(`PPP secret "${name}" not found on router`);
    s.disabled = disabled;
  }
  async removeSecret(name: string) {
    this.r.secrets.delete(name);
  }
  async listActive() {
    return [...this.r.active.values()];
  }
  async findActive(name: string) {
    return this.r.active.get(name) ?? null;
  }
  async kick(name: string) {
    return this.r.active.delete(name);
  }
  close() {}
}

export function installFakeRouterDriver() {
  setRouterDriverFactory(async (opts) => {
    const r = fakeRouter(opts.host);
    if (!r.reachable) throw new Error("connect ETIMEDOUT");
    if (opts.password !== r.password) throw new Error("invalid user name or password");
    return new FakeDriver(r);
  });
}
