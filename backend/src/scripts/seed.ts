/**
 * Idempotent seed: default plans + first super admin + starter Help/Blog articles.
 * Usage: pnpm seed
 */
import config from "../app/config";
import { connectDB, disconnectDB } from "../app/config/db";
import { Plan } from "../app/modules/plan/plan.model";
import { DEFAULT_PLANS } from "../app/modules/plan/plan.seed";
import { PlatformUser } from "../app/modules/platformUser/platformUser.model";
import { seedContent } from "./seedContent";

export async function seedPlans() {
  for (const plan of DEFAULT_PLANS) {
    // $setOnInsert: never overwrite prices/limits edited later in the super admin panel.
    await Plan.updateOne({ slug: plan.slug }, { $setOnInsert: plan }, { upsert: true });
  }
  console.log(`✅ ${DEFAULT_PLANS.length} default plans ensured (existing ones are left unchanged)`);
}

export async function seedSuperAdmin() {
  const { email, password } = config.superAdmin;
  if (!email || !password) {
    console.log("⚠️  SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping super admin");
    return;
  }
  if (await PlatformUser.exists({ email })) {
    console.log(`ℹ️  Super admin ${email} already exists`);
    return;
  }
  await PlatformUser.create({ name: "Super Admin", email, password, role: "super_admin" });
  console.log(`✅ Super admin created: ${email} (change the password after first login)`);
}

async function main() {
  await connectDB();
  await seedPlans();
  await seedSuperAdmin();
  await seedContent();
  await disconnectDB();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
}
