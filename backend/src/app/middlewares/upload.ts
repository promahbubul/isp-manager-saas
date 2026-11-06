import multer from "multer";
import AppError from "../errors/AppError";

/** In-memory single Excel file upload (field name "file", max 5 MB). */
export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(new AppError(400, "Upload an .xlsx file"));
  },
}).single("file");
