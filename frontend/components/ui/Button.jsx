const VARIANTS = {
  primary: "bg-purple-600 text-white hover:bg-purple-500",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-500",
  success: "bg-emerald-600 text-white hover:bg-emerald-500",
  ghost: "text-slate-600 hover:bg-slate-100",
};

const SIZES = { sm: "px-2.5 py-1 text-sm", md: "px-4 py-2", lg: "px-5 py-2.5 text-lg" };

export default function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled,
  className = "",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}
