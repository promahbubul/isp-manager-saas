import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";

/**
 * Settings building blocks — flat sections separated by a hairline instead of a box per group.
 *
 *   <SettingsSection title="Billing" description="When connections are cut off">...fields</SettingsSection>
 *
 * Title + description sit on the left (on top on phones), the controls on the right.
 */
export function SettingsSection({ title, description, children, className, id, first = false }) {
  return (
    <section id={id} className={cn("grid gap-x-10 gap-y-5 py-8 lg:grid-cols-[16rem_minmax(0,1fr)]", first ? "pt-2" : "border-t border-line", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>}
      </div>
      <div className="min-w-0 max-w-2xl">{children}</div>
    </section>
  );
}

/** A stack of on/off rows with hairlines between them. */
export function SettingsList({ children, className }) {
  return <div className={cn("divide-y divide-line [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0", className)}>{children}</div>;
}

/** Right-aligned save row at the end of a form (used where a sticky bar would be overkill). */
export function FormFooter({ dirty, saving, onReset, label = "Save changes" }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
      {dirty && <span className="mr-auto text-sm text-muted">Unsaved changes</span>}
      {dirty && onReset && (
        <Button variant="ghost" onClick={onReset} disabled={saving}>
          Discard
        </Button>
      )}
      <Button type="submit" loading={saving} disabled={!dirty}>
        {label}
      </Button>
    </div>
  );
}

/** Sticky bar at the bottom of a long form; slides in only when something changed. */
export function SaveBar({ dirty, saving, onReset, label = "Save changes" }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-2 animate-slide-up" role="region" aria-label="Unsaved changes">
      <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-pop)]">
        <span className="size-2 shrink-0 rounded-full bg-amber-500" />
        <span className="mr-auto text-sm font-medium text-ink">You have unsaved changes</span>
        <Button variant="ghost" onClick={onReset} disabled={saving}>
          Discard
        </Button>
        <Button type="submit" loading={saving}>
          {label}
        </Button>
      </div>
    </div>
  );
}

/** Small "Not in your plan" note used in place of a locked section's controls. */
export function LockedNote({ children }) {
  return <p className="rounded-lg bg-subtle px-3 py-2.5 text-sm text-muted">🔒 {children}</p>;
}
