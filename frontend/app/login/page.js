"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import AuthCard from "@/components/auth/AuthCard";
import { ContainerButton, LabelWithInput } from "@/components/ui";
import { getErrorMessage } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Same phone/email registered with several ISPs → user picks one.
  const [companies, setCompanies] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values) => {
    try {
      await login(values);
      const next = params.get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      const choices = err?.response?.status === 409 && err.response.data?.details?.companies;
      if (choices) {
        setCompanies(choices);
        toast("Select your company to continue");
        return;
      }
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
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

      {companies && (
        <div className="mb-5 flex flex-col gap-1">
          <label htmlFor="companySlug" className="font-semibold text-zinc-700">
            Company <span className="text-rose-500">*</span>
          </label>
          <select
            id="companySlug"
            className="rounded-md border border-zinc-300 px-4 py-2.5 text-zinc-900"
            {...register("companySlug")}
          >
            {companies.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <ContainerButton title="Login" loading={isSubmitting} />
      <p className="mt-3 text-center text-sm">
        <Link href="/forgot-password" className="text-primary-700 hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to manage your ISP"
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
