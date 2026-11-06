import { isValidObjectId } from "mongoose";
import AppError from "../../errors/AppError";
import { Customer } from "../customer/customer.model";
import { Zone } from "./zone.model";
import { CreateZoneInput, UpdateZoneInput } from "./zone.validation";

async function findOrThrow(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid zone id");
  const zone = await Zone.findById(id);
  if (!zone) throw new AppError(404, "Zone not found");
  return zone;
}

async function assertParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new AppError(400, "A zone cannot be its own parent");
  const parent = await Zone.findById(parentId).select("parent");
  if (!parent) throw new AppError(400, "Parent zone not found");
  // Only two levels: zone → sub-zone.
  if (parent.parent) throw new AppError(400, "Sub-zones cannot have their own sub-zones");
}

/** Flat list with customer counts; the UI builds the zone → sub-zone tree. */
async function list() {
  const [zones, counts] = await Promise.all([
    Zone.find().sort("name").lean(),
    Customer.aggregate<{ _id: unknown; count: number }>([
      { $match: { deletedAt: { $exists: false } } },
      { $group: { _id: "$zone", count: { $sum: 1 } } },
    ]),
  ]);
  const byZone = new Map(counts.map((c) => [String(c._id), c.count]));
  return zones.map((z) => ({ ...z, customerCount: byZone.get(String(z._id)) ?? 0 }));
}

async function create(input: CreateZoneInput) {
  await assertParent(input.parent);
  return Zone.create({ ...input, parent: input.parent ?? null });
}

async function update(id: string, input: UpdateZoneInput) {
  const zone = await findOrThrow(id);
  if (input.parent !== undefined) {
    await assertParent(input.parent, id);
    if (input.parent && (await Zone.exists({ parent: id }))) {
      throw new AppError(400, "This zone has sub-zones, so it cannot become a sub-zone");
    }
  }
  zone.set({ ...input, parent: input.parent === undefined ? zone.parent : (input.parent ?? null) });
  return zone.save();
}

async function remove(id: string) {
  const zone = await findOrThrow(id);
  if (await Zone.exists({ parent: id })) throw new AppError(400, "Delete or move its sub-zones first");
  if (await Customer.exists({ zone: id, deletedAt: { $exists: false } })) {
    throw new AppError(400, "Customers are assigned to this zone. Move them first.");
  }
  await zone.deleteOne();
}

export const ZoneService = { list, create, update, remove };
