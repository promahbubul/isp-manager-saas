"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import AuthCard from "@/components/auth/AuthCard";
import { ContainerButton, LabelWithInput } from "@/components/ui";
import { applyFieldErrors, getErrorMessage } from "@/lib/api";
import { signupSchema, slugify } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "yourdomain.com";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) });

  const companyNameField = register("companyName");
  const slugField = register("slug");
  const slugEdited = useRef(false);

  const onSubmit = async ({ confirmPassword: _confirm, ...values }) => {
    try {
      await signup(values);
      toast.success("Your 14-day free trial has started!");
      router.replace("/dashboard");
    } catch (err) {
      if (!applyFieldErrors(err, setError)) {
        if (err?.response?.status === 409) setError("slug", { message: getErrorMessage(err) });
        else toast.error(getErrorMessage(err));
      }
    }
  };

  return (
    <AuthCard
      title="Create your ISP account"
      subtitle="14 days free. No card required."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <LabelWithInput
          label="Company name"
          placeholder="Speed Net BD"
          required
          error={errors.companyName?.message}
          {...companyNameField}
          onChange={(e) => {
            companyNameField.onChange(e);
            // Suggest a subdomain until the user edits it manually.
            if (!slugEdited.current) setValue("slug", slugify(e.target.value));
          }}
        />
        <LabelWithInput
          label="Subdomain"
          placeholder="speednet"
          required
          hint={`Customer portal: <subdomain>.${ROOT_DOMAIN}`}
          error={errors.slug?.message}
          {...slugField}
          onChange={(e) => {
            slugEdited.current = true;
            slugField.onChange(e);
          }}
        />
        <LabelWithInput
          label="Your name"
          placeholder="Full name"
          autoComplete="name"
          required
          error={errors.ownerName?.message}
          {...register("ownerName")}
        />
        <LabelWithInput
          label="Mobile number"
          placeholder="01XXXXXXXXX"
          autoComplete="tel"
          required
          error={errors.phone?.message}
          {...register("phone")}
        />
        <LabelWithInput
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register("email")}
        />
        <LabelWithInput
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters with a letter and a number"
          error={errors.password?.message}
          {...register("password")}
        />
        <LabelWithInput
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <ContainerButton title="Start free trial" loading={isSubmitting} />
      </form>
    </AuthCard>
  );
}
