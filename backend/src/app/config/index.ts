import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DB_URL: z.string().min(1, "DB_URL is required"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  /** where payment gateways send callbacks/IPN — must be reachable from the internet in production */
  API_PUBLIC_URL: z.string().url().default("http://localhost:5000"),
  /** frontend base URL — users are redirected here after paying */
  APP_URL: z.string().url().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES: z.string().default("30d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  TRIAL_DAYS: z.coerce.number().int().positive().default(365),
  /** run cron jobs in this process — enable in exactly one instance */
  RUN_JOBS: z.enum(["true", "false"]).default("true"),
  /** "log" prints instead of sending; "http" calls SMS_HTTP_URL */
  SMS_PROVIDER: z.enum(["log", "http"]).default("log"),
  /** placeholders: {to} {message} {apiKey} {senderId} — values are URL-encoded */
  SMS_HTTP_URL: z.string().optional(),
  SMS_HTTP_METHOD: z.enum(["GET", "POST"]).default("GET"),
  /** regex the response body must match to count as sent */
  SMS_SUCCESS_PATTERN: z.string().default("."),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  /** WireGuard VPN for routers without a public IP (see DEPLOY.md) */
  WG_ENABLED: z.enum(["true", "false"]).default("false"),
  /** public host:port routers dial, e.g. vpn.example.com:51820 */
  WG_ENDPOINT: z.string().optional(),
  /** server's WireGuard public key (wg pubkey < /etc/wireguard/server.key) */
  WG_SERVER_PUBLIC_KEY: z.string().optional(),
  /** /16 tunnel network; .0.1 is the server */
  WG_SUBNET: z.string().regex(/^\d+\.\d+\.0\.0\/16$/, "WG_SUBNET must look like 10.200.0.0/16").default("10.200.0.0/16"),
  WG_INTERFACE: z.string().default("wg0"),
  /** run `wg set` to add/remove peers on this server (needs CAP_NET_ADMIN / sudo rule) */
  WG_APPLY: z.enum(["true", "false"]).default("false"),
  /** folder for uploaded logos (served at /uploads) */
  UPLOAD_DIR: z.string().optional(),
  /** SSTP VPN (RouterOS 6 routers have no WireGuard) — needs accel-ppp or similar on the server */
  SSTP_ENABLED: z.enum(["true", "false"]).default("false"),
  /** public host routers dial (port 443) */
  SSTP_HOST: z.string().optional(),
  SSTP_SUBNET: z.string().regex(/^\d+\.\d+\.0\.0\/16$/).default("10.201.0.0/16"),
  /** chap-secrets file the SSTP server reads; rewritten when routers change (needs write access) */
  SSTP_SECRETS_FILE: z.string().optional(),
  /** shared secret FreeRADIUS (rlm_rest) sends as X-Radius-Secret; empty = RADIUS API off */
  RADIUS_API_SECRET: z.string().min(24).optional(),
  /** address routers send RADIUS packets to (this server's public or VPN IP) */
  RADIUS_HOST: z.string().optional(),
  /** FreeRADIUS clients file we rewrite with every RADIUS router (needs write access) */
  RADIUS_CLIENTS_FILE: z.string().optional(),
  SUPER_ADMIN_EMAIL: z.email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}
const env = parsed.data;

/** Refuse to boot production with unsafe or development-only settings. */
if (env.NODE_ENV === "production") {
  const problems: string[] = [];
  const weak = (v: string) => /change-me|^0+$/.test(v);
  if (weak(env.JWT_ACCESS_SECRET) || weak(env.JWT_REFRESH_SECRET)) problems.push("JWT secrets are still the example values");
  if (/^0+$/.test(env.ENCRYPTION_KEY)) problems.push("ENCRYPTION_KEY is still the example value");
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  if (!env.API_PUBLIC_URL.startsWith("https://")) problems.push("API_PUBLIC_URL must be https (payment gateways call it)");
  if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL must be https");
  if (env.CORS_ORIGINS.includes("localhost")) problems.push("CORS_ORIGINS still contains localhost");
  if (env.SUPER_ADMIN_PASSWORD === "ChangeMe@123") problems.push("SUPER_ADMIN_PASSWORD is the example value");
  if (problems.length) {
    console.error("❌ Unsafe production config:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  if (env.SMS_PROVIDER === "log") console.warn("⚠️  SMS_PROVIDER=log — SMS (including password-reset codes) will NOT be sent");
}

const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  dbUrl: env.DB_URL,
  corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  cookieDomain: env.COOKIE_DOMAIN || undefined,
  apiPublicUrl: env.API_PUBLIC_URL.replace(/\/$/, ""),
  appUrl: env.APP_URL.replace(/\/$/, ""),
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpires: env.JWT_ACCESS_EXPIRES,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpires: env.JWT_REFRESH_EXPIRES,
  },
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
  encryptionKey: env.ENCRYPTION_KEY,
  trialDays: env.TRIAL_DAYS,
  runJobs: env.RUN_JOBS === "true",
  sms: {
    provider: env.SMS_PROVIDER,
    httpUrl: env.SMS_HTTP_URL,
    httpMethod: env.SMS_HTTP_METHOD,
    successPattern: env.SMS_SUCCESS_PATTERN,
    apiKey: env.SMS_API_KEY,
    senderId: env.SMS_SENDER_ID,
  },
  superAdmin: { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD },
  sstp: {
    enabled: env.SSTP_ENABLED === "true",
    host: env.SSTP_HOST,
    subnet: env.SSTP_SUBNET,
    secretsFile: env.SSTP_SECRETS_FILE,
  },
  radius: { apiSecret: env.RADIUS_API_SECRET, host: env.RADIUS_HOST, clientsFile: env.RADIUS_CLIENTS_FILE },
  uploadDir: path.resolve(env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads")),
  wireguard: {
    enabled: env.WG_ENABLED === "true",
    endpoint: env.WG_ENDPOINT,
    serverPublicKey: env.WG_SERVER_PUBLIC_KEY,
    subnet: env.WG_SUBNET,
    iface: env.WG_INTERFACE,
    apply: env.WG_APPLY === "true",
  },
};

export default config;
