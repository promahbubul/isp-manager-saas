import bcrypt from "bcryptjs";
import { HydratedDocument, Model, model, Schema } from "mongoose";
import config from "../../config";
import { PLATFORM_ROLES, PlatformRole } from "../../constants/roles";

export interface IPlatformUser {
  name: string;
  email: string;
  password: string;
  role: PlatformRole;
  isActive: boolean;
  lastLogin?: Date;
  tokenVersion: number;
  twoFactor: {
    enabled: boolean;
    /** AES-encrypted base32 TOTP secret */
    secret?: string;
    /** secret waiting for the first valid code */
    pendingSecret?: string;
  };
}

interface Methods {
  comparePassword(plain: string): Promise<boolean>;
}

export type PlatformUserDoc = HydratedDocument<IPlatformUser, Methods>;
type PlatformUserModel = Model<IPlatformUser, object, Methods>;

const schema = new Schema<IPlatformUser, PlatformUserModel, Methods>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: PLATFORM_ROLES, default: "support" },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    tokenVersion: { type: Number, default: 0 },
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      pendingSecret: { type: String, select: false },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.tokenVersion;
        const tf = ret.twoFactor as Record<string, unknown> | undefined;
        if (tf) {
          delete tf.secret;
          delete tf.pendingSecret;
        }
        delete ret.__v;
        return ret;
      },
    },
  },
);

schema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, config.bcryptSaltRounds);
  }
});

schema.methods.comparePassword = function (plain: string) {
  return bcrypt.compare(plain, this.password);
};

export const PlatformUser = model<IPlatformUser, PlatformUserModel>("PlatformUser", schema);
