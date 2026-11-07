import { Types } from "mongoose";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import { decrypt } from "../../utils/encryption";
import { Package } from "../package/package.model";
import { MikrotikRouter } from "../router/router.model";
import { Customer, CustomerDoc, CustomerStatus } from "./customer.model";

/** Statuses whose PPPoE secret should be enabled on the router. */
export const isConnectionEnabled = (status: CustomerStatus) => status === "active" || status === "free";

export type SyncResult = { ok: true } | { ok: false; error: string };

type Previous = { router?: Types.ObjectId; username?: string };

/**
 * Push a customer's desired state (secret, password, profile, enabled) to MikroTik.
 * Never throws: failures are stored on the customer (syncStatus=failed) and retried by a job.
 * `customer` must be loaded with `+pppoe.password`.
 */
export async function syncCustomer(customer: CustomerDoc, previous: Previous = {}): Promise<SyncResult> {
  try {
    if (customer.connectionType !== "pppoe") {
      customer.set({ syncStatus: "synced", syncError: undefined });
      await customer.save();
      return { ok: true };
    }

    const [router, pkg] = await Promise.all([
      MikrotikRouter.findById(customer.router).select("+password"),
      Package.findById(customer.package).select("mikrotikProfile"),
    ]);
    if (!router) throw new Error("Router not found");
    if (!pkg) throw new Error("Package not found");

    // Moved to another router: remove the old secret first (best effort).
    const routerChanged = previous.router && String(previous.router) !== String(customer.router);
    if (routerChanged) {
      const oldRouter = await MikrotikRouter.findById(previous.router).select("+password");
      if (oldRouter) {
        await withRouter(oldRouter, async (d) => {
          const name = previous.username ?? customer.pppoe.username;
          await d.kick(name);
          await d.removeSecret(name);
        }).catch(() => undefined);
      }
    }

    const enabled = isConnectionEnabled(customer.status);
    const username = customer.pppoe.username;

    // RADIUS routers keep no users: FreeRADIUS asks us at every login. Only a disable
    // needs action now — drop the live session so the next login is refused.
    if (router.authMode === "radius") {
      if (!enabled) await withRouter(router, (d) => d.kick(username));
      customer.set({ syncStatus: "synced", syncError: undefined });
      await customer.save();
      return { ok: true };
    }

    await withRouter(router, async (d) => {
      if (!routerChanged && previous.username && previous.username !== username) {
        await d.renameSecret(previous.username, username);
      }
      await d.upsertSecret({
        name: username,
        password: decrypt(customer.pppoe.password),
        profile: pkg.mikrotikProfile,
        disabled: !enabled,
        comment: `${customer.customerId} ${customer.name}`,
      });
      // Disabling a secret does not drop a live session — kick it so the block takes effect now.
      if (!enabled) await d.kick(username);
    });

    customer.set({ syncStatus: "synced", syncError: undefined });
    await customer.save();
    return { ok: true };
  } catch (err) {
    const error = (err as Error).message;
    customer.set({ syncStatus: "failed", syncError: error });
    await customer.save();
    return { ok: false, error };
  }
}

/** Remove the customer's secret from the router (used when a customer leaves). */
export async function removeCustomerFromRouter(customer: CustomerDoc): Promise<SyncResult> {
  try {
    const router = await MikrotikRouter.findById(customer.router).select("+password");
    if (!router) return { ok: true };
    await withRouter(router, async (d) => {
      await d.kick(customer.pppoe.username);
      await d.removeSecret(customer.pppoe.username);
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function loadCustomerWithSecret(id: Types.ObjectId | string) {
  return Customer.findById(id).select("+pppoe.password");
}
