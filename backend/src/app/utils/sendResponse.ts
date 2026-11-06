import { Response } from "express";

export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };

type Payload<T> = {
  statusCode?: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
};

const sendResponse = <T>(res: Response, { statusCode = 200, message, data, meta }: Payload<T>) => {
  res.status(statusCode).json({ success: true, message, meta, data });
};

export default sendResponse;
