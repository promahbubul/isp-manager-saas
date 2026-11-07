import { Response } from "express";

/** page = 0 in cursor mode; pass nextCursor back as ?cursor= for the next page */
export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number; count?: number; hasMore?: boolean; nextCursor?: string | null };

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
