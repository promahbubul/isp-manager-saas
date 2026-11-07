import bcrypt from "bcryptjs";
import { HydratedDocument, Model, model, Schema, Types } from "mongoose";
import config from "../../config";
import { TENANT_ROLES, TenantRole } from "../../constants/roles";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface IUser {
  company: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  password: string;
  avatar?: string;
  role: TenantRole;
  /** explicit permission overrides (required for role "custom") */
  permissions: string[];
  zones: Types.ObjectId[];
  /** set for role "reseller": the Reseller this login belongs to */
  reseller?: Types.ObjectId;
  isActive: boolean;
  lastLogin?: Date;
  tokenVersion: number;
}

interface UserMethods {
  comparePassword(plain: string): Promise<boolean>;
}

export type UserDoc = HydratedDocument<IUser, UserMethods>;
type UserModel = Model<IUser, object, UserMethods>;

const userSchema = new Schema<IUser, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    avatar: String,
    role: { type: String, enum: TENANT_ROLES, required: true },
    permissions: { type: [String], default: [] },
    zones: [{ type: Schema.Types.ObjectId, ref: "Zone" }],
    reseller: { type: Schema.Types.ObjectId, ref: "Reseller" },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.plugin(tenantPlugin);

userSchema.index({ company: 1, phone: 1 }, { unique: true });
userSchema.index(
  { company: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
// login looks users up across companies
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });

userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, config.bcryptSaltRounds);
  }
});

userSchema.methods.comparePassword = function (plain: string) {
  return bcrypt.compare(plain, this.password);
};

export const User = model<IUser, UserModel>("User", userSchema);
