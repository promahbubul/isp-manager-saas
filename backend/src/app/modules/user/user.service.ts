import { isValidObjectId } from "mongoose";
import { TenantRole } from "../../constants/roles";
import AppError from "../../errors/AppError";
import { paginate } from "../../utils/paginate";
import { assertPlanLimit, changeUsage } from "../subscription/planLimit";
import { IUser, User, UserDoc } from "./user.model";
import { CreateUserInput, UpdateUserInput } from "./user.validation";

type Actor = { id: string; role: TenantRole; company: string };

/** Only the owner may create or manage admins; nobody manages the owner through this API. */
function assertCanManage(actor: Actor, target: { role: TenantRole }, nextRole?: TenantRole) {
  if (target.role === "owner") throw new AppError(403, "The owner account cannot be modified here");
  const touchesAdmin = target.role === "admin" || nextRole === "admin";
  if (touchesAdmin && actor.role !== "owner") throw new AppError(403, "Only the owner can manage admins");
}

async function findOrThrow(id: string): Promise<UserDoc> {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid user id");
  const user = await User.findById(id); // tenant plugin scopes this to the actor's company
  if (!user) throw new AppError(404, "User not found");
  return user;
}

async function list(query: Record<string, unknown>) {
  return paginate<IUser>(User, {}, query, {
    searchFields: ["name", "phone", "email"],
    filterFields: ["role"],
  });
}

async function getById(id: string) {
  return findOrThrow(id);
}

async function create(actor: Actor, input: CreateUserInput) {
  assertCanManage(actor, { role: input.role }, input.role);
  await assertPlanLimit(actor.company, "staff");
  const user = await User.create({ ...input, company: actor.company });
  await changeUsage(actor.company, "staff", 1);
  return user;
}

async function update(actor: Actor, id: string, input: UpdateUserInput) {
  const user = await findOrThrow(id);
  assertCanManage(actor, user, input.role);
  if (user.id === actor.id && (input.isActive === false || input.role)) {
    throw new AppError(400, "You cannot change your own role or deactivate yourself");
  }

  const wasActive = user.isActive;
  if (!wasActive && input.isActive === true) await assertPlanLimit(actor.company, "staff");
  user.set(input);
  // Changing password, role or deactivating ends the user's existing sessions.
  if (input.password || input.role || (wasActive && input.isActive === false)) user.tokenVersion += 1;
  await user.save();

  if (wasActive !== user.isActive) await changeUsage(actor.company, "staff", user.isActive ? 1 : -1);
  return user;
}

/** Soft delete: deactivate so payment/collection history keeps its references. */
async function deactivate(actor: Actor, id: string) {
  return update(actor, id, { isActive: false });
}

export const UserService = { list, getById, create, update, deactivate };
