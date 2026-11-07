import { cn } from "@/lib/cn";

/**
 * Works both as a controlled input and with react-hook-form:
 *   <LabelWithInput label="Phone" {...register("phone")} error={errors.phone?.message} />
 * (React 19 passes `ref` as a normal prop, so register()'s ref reaches the <input>.)
 */
const LabelWithInput = ({ label, required, error, hint, mb, type = "text", id, name, ...inputProps }) => {
  const inputId = id || name;
  return (
    <div className={cn("flex flex-col gap-1.5", mb ?? "mb-4")}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type={type}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-10 rounded-lg border bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:ring-4",
          error ? "border-rose-400 focus:ring-rose-100" : "border-line focus:border-primary-500 focus:ring-primary-100",
        )}
        {...inputProps}
      />
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
};

export default LabelWithInput;
