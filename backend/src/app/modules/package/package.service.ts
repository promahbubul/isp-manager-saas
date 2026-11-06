import { isValidObjectId } from "mongoose";
import AppError from "../../errors/AppError";
import { Customer } from "../customer/customer.model";
import { MikrotikRouter } from "../router/router.model";
import { Package } from "./package.model";
import { CreatePackageInput, UpdatePackageInput } from "./package.validation";

export async function findPackageOrThrow(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid package id");
  const pkg = await Package.findById(id);
  if (!pkg) throw new AppError(404, "Package not found");
  return pkg;
}

async function assertRouter(routerId: string) {
  if (!(await MikrotikRouter.exists({ _id: routerId }))) throw new AppError(400, "Router not found");
}

async function list(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (typeof query.router === "string" && isValidObjectId(query.router)) filter.router = query.router;
  if (query.active === "true") filter.isActive = true;

  const [packages, counts] = await Promise.all([
    Package.find(filter).populate("router", "name").sort("price"),
    Customer.aggregate<{ _id: unknown; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: "$package", count: { $sum: 1 } } },
    ]),
  ]);
  const byPkg = new Map(counts.map((c) => [String(c._id), c.count]));
  return packages.map((p) => ({ ...p.toJSON(), customerCount: byPkg.get(p.id) ?? 0 }));
}

async function create(input: CreatePackageInput) {
  await assertRouter(input.router);
  return Package.create(input);
}

/**
 * Note: changing price/profile here does not touch existing customers —
 * their monthlyFee is copied at assignment, and profiles are pushed on their next sync.
 */
async function update(id: string, input: UpdatePackageInput) {
  const pkg = await findPackageOrThrow(id);
  if (input.router && input.router !== String(pkg.router)) {
    await assertRouter(input.router);
    if (await Customer.exists({ package: id, deletedAt: null })) {
      throw new AppError(400, "Customers use this package, so its router cannot be changed");
    }
  }
  pkg.set(input);
  return pkg.save();
}

async function remove(id: string) {
  const pkg = await findPackageOrThrow(id);
  if (await Customer.exists({ package: id, deletedAt: null })) {
    throw new AppError(400, "Customers use this package. Deactivate it instead.");
  }
  await pkg.deleteOne();
}

export const PackageService = { list, create, update, remove };
