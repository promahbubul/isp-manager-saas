import multer from "multer";
import AppError from "../errors/AppError";

/** Logo: PNG/JPEG/WebP up to 1 MB (field "file"). SVG is refused — it can carry scripts. */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new AppError(400, "Upload a PNG, JPG or WebP image"));
  },
}).single("file");

/** Trust the bytes, not the browser's mimetype. */
export function imageExtension(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

/** In-memory single Excel file upload (field name "file", max 5 MB). */
export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(new AppError(400, "Upload an .xlsx file"));
  },
}).single("file");
