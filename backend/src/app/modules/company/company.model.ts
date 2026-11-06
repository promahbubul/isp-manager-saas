import { HydratedDocument, model, Schema, Types } from "mongoose";
import { COMPANY_STATUSES, CompanyStatus } from "../../constants/roles";

export interface ICompany {
  name: string;
  slug: string;
  email: string;
  phone: string;
  address?: string;
  district?: string;
  logo?: string;
  btrcLicenseNo?: string;
  licenseType?: "nationwide" | "divisional" | "district" | "upazila";
  owner?: Types.ObjectId;
  status: CompanyStatus;
  trialEndsAt?: Date;
  customDomain?: string;
  portalTheme: { primaryColor: string };
  locale: "bn" | "en";
  timezone: string;
  smsBalance: number;
  usage: { customers: number; routers: number; staff: number };
  deletedAt?: Date;
}

export type CompanyDoc = HydratedDocument<ICompany>;

const companySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: String,
    district: String,
    logo: String,
    btrcLicenseNo: String,
    licenseType: { type: String, enum: ["nationwide", "divisional", "district", "upazila"] },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: COMPANY_STATUSES, default: "trial", index: true },
    trialEndsAt: Date,
    customDomain: { type: String, lowercase: true, trim: true },
    portalTheme: { primaryColor: { type: String, default: "#2563eb" } },
    locale: { type: String, enum: ["bn", "en"], default: "bn" },
    timezone: { type: String, default: "Asia/Dhaka" },
    smsBalance: { type: Number, default: 0, min: 0 },
    usage: {
      customers: { type: Number, default: 0 },
      routers: { type: Number, default: 0 },
      staff: { type: Number, default: 0 },
    },
    deletedAt: Date,
  },
  { timestamps: true },
);

companySchema.index(
  { customDomain: 1 },
  { unique: true, partialFilterExpression: { customDomain: { $type: "string" } } },
);

export const Company = model<ICompany>("Company", companySchema);

/** The panel becomes read-only when the subscription has lapsed. */
export function isCompanyWritable(company: Pick<ICompany, "status" | "trialEndsAt">): boolean {
  if (company.status === "suspended" || company.status === "archived") return false;
  if (company.status === "trial" && company.trialEndsAt && company.trialEndsAt < new Date()) return false;
  return true;
}
