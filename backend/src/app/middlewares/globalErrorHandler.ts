import { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import config from "../config";
import AppError from "../errors/AppError";

type ErrorDetail = { path: string; message: string };

export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let message = "Something went wrong";
  let errors: ErrorDetail[] | undefined;
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    errors = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${String(err.value)}`;
  } else if (err?.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyValue ?? {}).filter((k) => k !== "company");
    message = `${fields.join(", ") || "Value"} already exists`;
    errors = fields.map((f) => ({ path: f, message: `${f} already exists` }));
  } else if (err?.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Malformed JSON body";
  }

  if (statusCode >= 500 && !config.isTest) console.error(err);

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    details,
    stack: config.isProd || statusCode < 500 ? undefined : err?.stack,
  });
};
