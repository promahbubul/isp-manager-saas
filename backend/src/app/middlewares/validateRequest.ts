import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

/** Validate and replace req.body with the parsed (trimmed, coerced, stripped) value. */
export const validateBody = (schema: ZodType) => async (req: Request, _res: Response, next: NextFunction) => {
  req.body = await schema.parseAsync(req.body ?? {});
  next();
};
