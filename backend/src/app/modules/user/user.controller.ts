import { Request, Response } from "express";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../../constants/permissions";
import sendResponse from "../../utils/sendResponse";
import { UserService } from "./user.service";

const actor = (req: Request) => ({ id: req.user!.id, role: req.user!.role, company: req.user!.company });
const idParam = (req: Request) => String(req.params.id);

const list = async (req: Request, res: Response) => {
  const { data, meta } = await UserService.list(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Staff list", data, meta });
};

const getById = async (req: Request, res: Response) => {
  const data = await UserService.getById(idParam(req));
  sendResponse(res, { message: "Staff details", data });
};

const create = async (req: Request, res: Response) => {
  const data = await UserService.create(actor(req), req.body);
  sendResponse(res, { statusCode: 201, message: "Staff created", data });
};

const update = async (req: Request, res: Response) => {
  const data = await UserService.update(actor(req), idParam(req), req.body);
  sendResponse(res, { message: "Staff updated", data });
};

const deactivate = async (req: Request, res: Response) => {
  const data = await UserService.deactivate(actor(req), idParam(req));
  sendResponse(res, { message: "Staff deactivated", data });
};

const permissions = async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Permissions", data: { permissions: PERMISSIONS, roles: ROLE_PERMISSIONS } });
};

export const UserController = { list, getById, create, update, deactivate, permissions };
