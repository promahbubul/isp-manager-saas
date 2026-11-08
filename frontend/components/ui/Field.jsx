import { cn } from "@/lib/cn";

/**
 * Form controls that work with react-hook-form's register():
 *   <Input label="Name" error={errors.name?.message} {...register("name")} />
 */
const control =
  "w-full rounded-lg border bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:ring-4 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted";
const tone = (error) => (error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : "border-line focus:border-primary-500 focus:ring-primary-100");

function Wrapper({ label, required, error, hint, htmlFor, className, children }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ label, required, error, hint, className, id, name, ...props }) {
  const inputId = id || name;
  return (
    <Wrapper label={label} required={required} error={error} hint={hint} htmlFor={inputId} className={className}>
      <input id={inputId} name={name} aria-invalid={Boolean(error)} className={cn(control, "h-9", tone(error))} {...props} />
    </Wrapper>
  );
}

export function Select({ label, required, error, hint, className, id, name, options = [], placeholder, ...props }) {
  const inputId = id || name;
  return (
    <Wrapper label={label} required={required} error={error} hint={hint} htmlFor={inputId} className={className}>
      <select
        id={inputId}
        name={name}
        aria-invalid={Boolean(error)}
        className={cn(
          control,
          "h-9 cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2371717a%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
          tone(error),
        )}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function Textarea({ label, required, error, hint, className, id, name, ...props }) {
  const inputId = id || name;
  return (
    <Wrapper label={label} required={required} error={error} hint={hint} htmlFor={inputId} className={className}>
      <textarea id={inputId} name={name} rows={3} className={cn(control, "py-2", tone(error))} {...props} />
    </Wrapper>
  );
}

/** On/off toggle (a styled checkbox, so register() works). Label + hint on the left, switch on the right. */
export function Switch({ label, hint, id, name, className, ...props }) {
  const inputId = id || name;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start justify-between gap-6", className)}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={inputId} name={name} type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-primary-600 peer-focus-visible:ring-4 peer-focus-visible:ring-primary-100 peer-disabled:opacity-50" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function Checkbox({ label, hint, id, name, className, ...props }) {
  const inputId = id || name;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start gap-2.5", className)}>
      <input id={inputId} name={name} type="checkbox" className="mt-0.5 size-4 cursor-pointer rounded border-line accent-primary-600" {...props} />
      <span className="min-w-0">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
