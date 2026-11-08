"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormFooter, SettingsSection } from "@/components/settings/SettingsSection";
import { Button, Input, PageHeader, confirmDialog } from "@/components/ui";
import Avatar from "@/components/ui/Avatar";
import { api, applyFieldErrors, getErrorMessage, setAccessToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";

function PhotoSection() {
  const { user, reload } = useAuth();
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) return toast.error("The photo must be 1 MB or smaller");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/auth/me/avatar", fd);
      await reload();
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog("Remove your profile photo?"))) return;
    setBusy(true);
    try {
      await api.delete("/auth/me/avatar");
      await reload();
      toast.success("Profile photo removed");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection first title="Profile photo" description="Shown in the top bar and on the website header when you are logged in.">
      <div className="flex items-center gap-5">
        <Avatar name={user?.name} src={user?.avatar} size="lg" />
        <div>
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-subtle",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <ImageUp className="size-4" />
              {busy ? "Uploading…" : user?.avatar ? "Change photo" : "Upload photo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {user?.avatar && (
              <Button variant="ghost" disabled={busy} onClick={remove}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">PNG, JPG or WebP, up to 1 MB. A square photo looks best.</p>
        </div>
      </div>
    </SettingsSection>
  );
}

function AccountSection() {
  const { user, company } = useAuth();
  const rows = [
    ["Name", user?.name],
    ["Mobile", user?.phone],
    ["Email", user?.email],
    ["Role", user?.role],
    ["Company", company?.name],
  ];
  return (
    <SettingsSection title="Account" description="Your login details. Ask the company owner to change your name, mobile or role.">
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="truncate text-sm font-medium text-ink">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </SettingsSection>
  );
}

function PasswordSection() {
  const { register, handleSubmit, reset, setError, formState } = useForm({ defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });
  const e = formState.errors;
  const onSubmit = async (v) => {
    if (v.newPassword !== v.confirm) return setError("confirm", { message: "Passwords do not match" });
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword: v.currentPassword, newPassword: v.newPassword });
      setAccessToken(data.data.accessToken);
      reset();
      toast.success("Password changed. Other devices have been logged out.");
    } catch (err) {
      applyFieldErrors(err, setError);
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SettingsSection title="Password" description="Changing it logs you out on every other device.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Current password" type="password" autoComplete="current-password" required className="sm:col-span-2" error={e.currentPassword?.message} {...register("currentPassword", { required: true })} />
          <Input label="New password" type="password" autoComplete="new-password" required hint="At least 8 characters with a letter and a number" error={e.newPassword?.message} {...register("newPassword", { required: true })} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" required error={e.confirm?.message} {...register("confirm", { required: true })} />
        </div>
        <div className="mt-6">
          <FormFooter dirty={formState.isDirty} saving={formState.isSubmitting} onReset={() => reset()} label="Change password" />
        </div>
      </SettingsSection>
    </form>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-6xl pb-6">
      <PageHeader title="My profile" subtitle="Your photo, login details and password." className="mb-6 border-b border-line pb-5" />
      <PhotoSection />
      <AccountSection />
      <PasswordSection />
    </div>
  );
}
