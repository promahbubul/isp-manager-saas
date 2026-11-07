import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { isValidObjectId, model, Schema, Types } from "mongoose";
import { z } from "zod";
import config from "../../config";
import AppError from "../../errors/AppError";
import { platformAuth } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { paginate } from "../../utils/paginate";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { platformAudit } from "../admin/platformAudit";
import { bdPhone } from "../auth/auth.validation";

/* ───────────── Blog posts and Help Center articles (written by platform staff) ───────────── */

export interface IPost {
  type: "blog" | "help";
  title: string;
  slug: string;
  excerpt?: string;
  /** Markdown-ish plain text; rendered with paragraphs, headings (#) and lists (-) */
  body: string;
  category?: string;
  published: boolean;
  publishedAt?: Date;
  author?: Types.ObjectId;
}

const postSchema = new Schema<IPost>(
  {
    type: { type: String, enum: ["blog", "help"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, maxlength: 400 },
    body: { type: String, required: true, maxlength: 100_000 },
    category: { type: String, maxlength: 60 },
    published: { type: Boolean, default: false },
    publishedAt: Date,
    author: { type: Schema.Types.ObjectId, ref: "PlatformUser" },
  },
  { timestamps: true },
);
postSchema.index({ type: 1, published: 1, publishedAt: -1 });
export const Post = model<IPost>("Post", postSchema);

/* ───────────── Demo / contact requests from the marketing site ───────────── */

export interface IDemoRequest {
  name: string;
  company: string;
  phone: string;
  email?: string;
  customers?: number;
  district?: string;
  message?: string;
  status: "new" | "contacted" | "converted" | "closed";
  note?: string;
}

const demoSchema = new Schema<IDemoRequest>(
  {
    name: { type: String, required: true, maxlength: 100 },
    company: { type: String, required: true, maxlength: 150 },
    phone: { type: String, required: true },
    email: { type: String, maxlength: 150 },
    customers: Number,
    district: { type: String, maxlength: 60 },
    message: { type: String, maxlength: 2000 },
    status: { type: String, enum: ["new", "contacted", "converted", "closed"], default: "new" },
    note: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);
demoSchema.index({ status: 1, createdAt: -1 });
export const DemoRequest = model<IDemoRequest>("DemoRequest", demoSchema);

const postFields = {
  type: z.enum(["blog", "help"]),
  title: z.string().trim().min(3).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,120}$/, "Lowercase letters, digits and -"),
  excerpt: optionalText(400),
  body: z.string().min(10).max(100_000),
  category: optionalText(60),
  published: z.boolean(),
};
const postSchemaCreate = z.object({ ...postFields, published: postFields.published.default(false) });
const postSchemaUpdate = z.object(postFields).partial();

/* public: /public/content */
export const publicContentRoutes = Router();

publicContentRoutes.get("/posts", async (req: Request, res: Response) => {
  const type = req.query.type === "help" ? "help" : "blog";
  const { data, meta } = await paginate<IPost>(Post, { type, published: true }, req.query as Record<string, unknown>, {
    searchFields: ["title", "excerpt", "body"],
    filterFields: ["category"],
    defaultSort: type === "help" ? "category" : "-publishedAt",
    select: "-body",
    maxLimit: 100,
  });
  sendResponse(res, { message: "Posts", data, meta });
});

publicContentRoutes.get("/posts/:slug", async (req: Request, res: Response) => {
  const p = await Post.findOne({ slug: String(req.params.slug).toLowerCase(), published: true });
  if (!p) throw new AppError(404, "Article not found");
  sendResponse(res, { message: "Post", data: p });
});

const demoLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, skip: () => config.isTest, message: { success: false, message: "Too many requests, please call us instead." } });

publicContentRoutes.post(
  "/demo-request",
  demoLimiter,
  validateBody(
    z.object({
      name: z.string().trim().min(2).max(100),
      company: z.string().trim().min(2).max(150),
      phone: bdPhone,
      email: z.email().trim().toLowerCase().optional().or(z.literal("").transform(() => undefined)),
      customers: z.coerce.number().int().min(0).max(1_000_000).optional(),
      district: optionalText(60),
      message: optionalText(2000),
    }),
  ),
  async (req: Request, res: Response) => {
    await DemoRequest.create(req.body);
    sendResponse(res, { statusCode: 201, message: "Thank you! We will call you within one working day." });
  },
);

/* platform admin: /admin/content (mounted inside the admin router) */
export const adminContentRoutes = Router();
const superOnly = platformAuth("super_admin");

adminContentRoutes.get("/posts", async (req: Request, res: Response) => {
  const { data, meta } = await paginate<IPost>(Post, {}, req.query as Record<string, unknown>, { searchFields: ["title"], filterFields: ["type"], select: "-body", populate: [{ path: "author", select: "name" }] });
  sendResponse(res, { message: "Posts", data, meta });
});

adminContentRoutes.get("/posts/:id", async (req: Request, res: Response) => {
  if (!isValidObjectId(String(req.params.id))) throw new AppError(400, "Invalid id");
  const p = await Post.findById(String(req.params.id));
  if (!p) throw new AppError(404, "Post not found");
  sendResponse(res, { message: "Post", data: p });
});

adminContentRoutes.post("/posts", superOnly, validateBody(postSchemaCreate), platformAudit("content.create", "post"), async (req: Request, res: Response) => {
  if (await Post.exists({ slug: req.body.slug })) throw new AppError(409, "This slug is used");
  const p = await Post.create({ ...req.body, author: req.platformUser!.id, publishedAt: req.body.published ? new Date() : undefined });
  sendResponse(res, { statusCode: 201, message: req.body.published ? "Published" : "Draft saved", data: p });
});

adminContentRoutes.patch("/posts/:id", superOnly, validateBody(postSchemaUpdate), platformAudit("content.update", "post"), async (req: Request, res: Response) => {
  const p = await Post.findById(String(req.params.id));
  if (!p) throw new AppError(404, "Post not found");
  if (req.body.slug && req.body.slug !== p.slug && (await Post.exists({ slug: req.body.slug }))) throw new AppError(409, "This slug is used");
  if (req.body.published && !p.published) p.publishedAt = new Date();
  p.set(req.body);
  await p.save();
  sendResponse(res, { message: "Saved", data: p });
});

adminContentRoutes.delete("/posts/:id", superOnly, platformAudit("content.delete", "post"), async (req: Request, res: Response) => {
  const r = await Post.deleteOne({ _id: String(req.params.id) });
  if (!r.deletedCount) throw new AppError(404, "Post not found");
  sendResponse(res, { message: "Deleted" });
});

adminContentRoutes.get("/demo-requests", async (req: Request, res: Response) => {
  const { data, meta } = await paginate<IDemoRequest>(DemoRequest, {}, req.query as Record<string, unknown>, { searchFields: ["name", "company", "phone"], filterFields: ["status"] });
  const counts = await DemoRequest.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  sendResponse(res, { message: "Demo requests", data: { requests: data, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) }, meta });
});

adminContentRoutes.patch(
  "/demo-requests/:id",
  validateBody(z.object({ status: z.enum(["new", "contacted", "converted", "closed"]).optional(), note: optionalText(1000) })),
  platformAudit("demo_request.update", "demo_request"),
  async (req: Request, res: Response) => {
    const d = await DemoRequest.findByIdAndUpdate(String(req.params.id), { $set: req.body }, { returnDocument: "after" });
    if (!d) throw new AppError(404, "Request not found");
    sendResponse(res, { message: "Updated", data: d });
  },
);
