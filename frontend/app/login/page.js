"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import AuthCard from "@/components/auth/AuthCard";
import { ContainerButton, LabelWithInput } from "@/components/ui";
import { adminApi, setAdminToken } from "@/lib/adminApi";
import { getErrorMessage } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";

const safeNext = (next, prefix) => (next?.startsWith(prefix) && !next.startsWith("//") ? next : null);

/**
 * One login page for everyone with a role:
 *  - ISP staff (owner, admin, manager, accountant, collector, technician, reseller) → /dashboard
 *  - platform staff (super admin, support, finance) → /admin, with the 2FA code step when enabled
 * The ISP login is tried first; an email that is not an ISP account is then tried as platform staff.
 * Customers keep their own ISP portal (/portal/<isp>).
 */
function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  // Same phone/email registered with several ISPs → user picks one.
  const [companies, setCompanies] = useState(null);
  // Platform account with 2FA → ask for the authenticator code.
  const [needs2fa, setNeeds2fa] = useState(false);
  const [totp, setTotp] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const platformLogin = async ({ identifier, password }) => {
    const res = await adminApi.post("/auth/admin/login", { email: identifier.toLowerCase(), password, ...(needs2fa ? { totp } : {}) });
    setAdminToken(res.data.data.accessToken);
    router.replace(safeNext(next, "/admin") ?? "/admin");
  };

  const onSubmit = async (values) => {
    if (needs2fa) {
      try {
        await platformLogin(values);
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
      return;
    }

    try {
      await login(values);
      router.replace(safeNext(next, "/dashboard") ?? "/dashboard");
      return;
    } catch (err) {
      const choices = err?.response?.status === 409 && err.response.data?.details?.companies;
      if (choices) {
        setCompanies(choices);
        toast("Select your company to continue");
        return;
      }
      // Not an ISP account — try platform staff (email only).
      if (err?.response?.status !== 401 || !values.identifier.includes("@")) {
        toast.error(getErrorMessage(err));
        return;
      }
      try {
        await platformLogin(values);
      } catch (adminErr) {
        if (adminErr?.response?.data?.details?.needs2fa) {
          setNeeds2fa(true);
          toast("Enter the 6-digit code from your authenticator app");
        } else toast.error(getErrorMessage(err));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={needs2fa ? "hidden" : undefined}>
        <LabelWithInput
          label="Phone or email"
          placeholder="01XXXXXXXXX or you@example.com"
          autoComplete="username"
          required
          error={errors.identifier?.message}
          {...register("identifier")}
        />
        <LabelWithInput
          label="Password"
          type="password"
          placeholder="Your password"
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...register("password")}
        />
      </div>

      {needs2fa && (
        <LabelWithInput
          label="Authenticator code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={totp}
          onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
        />
      )}

      {companies && !needs2fa && (
        <div className="mb-5 flex flex-col gap-1">
          <label htmlFor="companySlug" className="font-semibold text-zinc-700">
            Company <span className="text-rose-500">*</span>
          </label>
          <select id="companySlug" className="rounded-md border border-line bg-surface px-4 py-2.5 text-ink" {...register("companySlug")}>
            {companies.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <ContainerButton title={needs2fa ? "Verify" : "Login"} loading={isSubmitting} />
      <p className="mt-3 text-center text-sm">
        {needs2fa ? (
          <button type="button" onClick={() => (setNeeds2fa(false), setTotp(""))} className="cursor-pointer text-primary-700 hover:underline">
            ← Back
          </button>
        ) : (
          <Link href="/forgot-password" className="text-primary-700 hover:underline">
            Forgot password?
          </Link>
        )}
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in with your phone or email"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-primary-700 hover:underline">
            Start your free trial
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
