/**
 * Form controls that work with react-hook-form's register():
 *   <Input label="Name" error={errors.name?.message} {...register("name")} />
 */
const control =
  "w-full rounded-md border px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-100";
const tone = (error) =>
  error ? "border-red-500 focus:ring-red-200" : "border-slate-300 focus:border-purple-600 focus:ring-purple-200";

function Wrapper({ label, required, error, hint, htmlFor, className = "", children }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Input({ label, required, error, hint, className, id, name, ...props }) {
  const inputId = id || name;
  return (
    <Wrapper label={label} required={required} error={error} hint={hint} htmlFor={inputId} className={className}>
      <input id={inputId} name={name} aria-invalid={Boolean(error)} className={`${control} ${tone(error)}`} {...props} />
    </Wrapper>
  );
}

export function Select({ label, required, error, hint, className, id, name, options = [], placeholder, ...props }) {
  const inputId = id || name;
  return (
    <Wrapper label={label} required={required} error={error} hint={hint} htmlFor={inputId} className={className}>
      <select id={inputId} name={name} aria-invalid={Boolean(error)} className={`${control} ${tone(error)}`} {...props}>
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
      <textarea id={inputId} name={name} rows={3} className={`${control} ${tone(error)}`} {...props} />
    </Wrapper>
  );
}

export function Checkbox({ label, hint, id, name, ...props }) {
  const inputId = id || name;
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2">
      <input id={inputId} name={name} type="checkbox" className="mt-1 h-4 w-4 accent-purple-600" {...props} />
      <span>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
