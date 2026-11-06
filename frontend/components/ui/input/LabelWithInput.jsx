/**
 * Works both as a controlled input and with react-hook-form:
 *   <LabelWithInput label="Phone" {...register("phone")} error={errors.phone?.message} />
 * (React 19 passes `ref` as a normal prop, so register()'s ref reaches the <input>.)
 */
const LabelWithInput = ({ label, required, error, hint, mb, type = "text", id, name, ...inputProps }) => {
  const inputId = id || name;
  return (
    <div className={`flex flex-col gap-1 ${mb ?? "mb-5"}`}>
      {label && (
        <label htmlFor={inputId} className="flex items-center gap-1 font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type={type}
        aria-invalid={Boolean(error)}
        className={`rounded-md border px-4 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
          error ? "border-red-500 focus:ring-red-200" : "border-slate-300 focus:border-purple-600 focus:ring-purple-200"
        }`}
        {...inputProps}
      />
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        hint && <p className="text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
};

export default LabelWithInput;
