import { Types } from "mongoose";
import { TenantRole } from "../../constants/roles";
import { User } from "../user/user.model";
import { Notification } from "./notification.model";

type Id = string | Types.ObjectId;
type Payload = { title: string; body?: string; link?: string };

/** In-app notification to specific users (deduplicated, never throws). */
export async function notifyUsers(company: Id, userIds: Id[], payload: Payload, exclude?: Id) {
  const ids = [...new Set(userIds.map(String))].filter((id) => id !== String(exclude ?? ""));
  if (!ids.length) return;
  await Notification.insertMany(ids.map((user) => ({ company, user, ...payload }))).catch((err) =>
    console.error("[notify] failed:", err),
  );
}

/** Notify every active user with one of the roles (e.g. managers about a new ticket). */
export async function notifyRoles(company: Id, roles: TenantRole[], payload: Payload, exclude?: Id) {
  const users = await User.find({ company, role: { $in: roles }, isActive: true }).select("_id");
  await notifyUsers(company, users.map((u) => u._id), payload, exclude);
}
