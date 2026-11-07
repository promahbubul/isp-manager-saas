import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Response } from "express";
import multer from "multer";
import config from "../config";
import AppError from "../errors/AppError";
import { imageExtension } from "../middlewares/upload";

/**
 * Files that must not be public (NID scans, ticket attachments): stored under
 * <UPLOAD_DIR>/private/<folder> and streamed only by authenticated routes.
 */
export const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.mimetype) ? cb(null, true) : cb(new AppError(400, "Attach a photo (PNG/JPG/WebP) or a PDF, max 3 MB"))),
}).single("file");

export function fileExtension(buf: Buffer): "png" | "jpg" | "webp" | "pdf" | null {
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  return imageExtension(buf);
}

const dir = (folder: string) => path.join(config.uploadDir, "private", folder);

export async function savePrivateFile(folder: string, prefix: string, buf: Buffer) {
  const ext = fileExtension(buf);
  if (!ext) throw new AppError(400, "The file is not a valid image or PDF");
  await fs.mkdir(dir(folder), { recursive: true });
  const name = `${prefix}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir(folder), name), buf);
  return name;
}

export function sendPrivateFile(res: Response, folder: string, name: string, downloadName?: string) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (downloadName) res.setHeader("Content-Disposition", `inline; filename="${downloadName.replace(/[^\w.-]/g, "_")}"`);
  res.sendFile(path.join(dir(folder), path.basename(name)));
}
