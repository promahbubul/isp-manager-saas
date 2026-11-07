"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One icon button: click to switch between light and dark.
 * Until the user clicks, the theme follows the operating system (next-themes defaultTheme="system").
 */
export default function ThemeToggle({ className }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the theme is only known in the browser
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("relative grid size-9 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-ink", className)}
      aria-label={label}
      title={label}
    >
      <Sun className={cn("absolute size-[18px] transition-all duration-300", dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
      <Moon className={cn("absolute size-[18px] transition-all duration-300", dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
    </button>
  );
}
