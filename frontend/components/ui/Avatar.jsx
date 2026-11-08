import { cn } from "@/lib/cn";

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-20 text-2xl" };

/** Profile photo, or the person's initials when there is none. */
export default function Avatar({ name, src, size = "sm", className }) {
  const box = cn("shrink-0 rounded-full", SIZES[size] ?? SIZES.sm, className);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded file on the API host
    return <img src={src} alt={name ?? ""} className={cn(box, "bg-subtle object-cover ring-1 ring-line")} />;
  }
  return (
    <span aria-hidden className={cn(box, "flex items-center justify-center bg-primary-600 font-semibold text-white")}>
      {initials(name)}
    </span>
  );
}
