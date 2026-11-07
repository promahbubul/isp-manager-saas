import { isValidObjectId } from "mongoose";
import { writeRadiusClients } from "../../services/radius/radius.service";
import AppError from "../../errors/AppError";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import { encrypt } from "../../utils/encryption";
import { Customer } from "../customer/customer.model";
import { Package } from "../package/package.model";
import { assertPlanLimit, changeUsage } from "../subscription/planLimit";
import { MikrotikRouter, RouterDoc } from "./router.model";
import { CreateRouterInput, UpdateRouterInput } from "./router.validation";

/** Loads a router including its (encrypted) password, scoped to the current tenant. */
export async function findRouterWithSecret(id: string): Promise<RouterDoc> {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid router id");
  const router = await MikrotikRouter.findById(id).select("+password");
  if (!router) throw new AppError(404, "Router not found");
  return router;
}

async function list() {
  return MikrotikRouter.find().sort("name");
}

async function getById(id: string) {
  return findRouterWithSecret(id);
}

async function create(companyId: string, input: CreateRouterInput) {
  await assertPlanLimit(companyId, "routers");
  const router = await MikrotikRouter.create({ ...input, password: encrypt(input.password) });
  await changeUsage(companyId, "routers", 1);
  return router;
}

async function update(id: string, input: UpdateRouterInput) {
  const router = await findRouterWithSecret(id);
  const { password, radius, ...rest } = input;
  router.set(rest);
  // field by field: replacing the whole "radius" object would drop the (unloaded) shared secret
  if (radius) for (const [k, v] of Object.entries(radius)) router.set(`radius.${k}`, v || undefined);
  if (password) router.password = encrypt(password);
  if (password || rest.host || rest.port || rest.username || rest.useSSL !== undefined) router.status = "unknown";
  const saved = await router.save();
  if (radius || rest.authMode || rest.host || rest.isActive !== undefined) await writeRadiusClients().catch(() => undefined);
  return saved;
}

async function remove(companyId: string, id: string) {
  const router = await findRouterWithSecret(id);
  if (await Package.exists({ router: id })) throw new AppError(400, "Packages use this router. Move or delete them first.");
  if (await Customer.exists({ router: id, deletedAt: null })) {
    throw new AppError(400, "Customers are connected through this router. Move them first.");
  }
  await router.deleteOne();
  await changeUsage(companyId, "routers", -1);
}

/** Connect, read system info, and record online/offline status. */
async function testConnection(id: string) {
  const router = await findRouterWithSecret(id);
  try {
    const info = await withRouter(router, (d) => d.info());
    router.set({
      status: "online",
      lastCheckedAt: new Date(),
      lastError: undefined,
      info: { identity: info.identity, version: info.version, board: info.board },
    });
    await router.save();
    return { status: "online" as const, info };
  } catch (err) {
    router.set({ status: "offline", lastCheckedAt: new Date(), lastError: (err as Error).message });
    await router.save();
    throw err;
  }
}

async function profiles(id: string) {
  const router = await findRouterWithSecret(id);
  return withRouter(router, (d) => d.listProfiles());
}

async function activeSessions(id: string) {
  const router = await findRouterWithSecret(id);
  return withRouter(router, (d) => d.listActive());
}

export const RouterService = { list, getById, create, update, remove, testConnection, profiles, activeSessions };
