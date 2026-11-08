"use client";

import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";

/**
 * "Start free trial" for visitors; for someone already logged in it becomes a link to
 * their dashboard (or wherever `signedInHref` points), so the button never silently
 * bounces them through /signup.
 */
/** Renders its children only for visitors who are not logged in (e.g. "No card required"). */
export function GuestOnly({ children }) {
  const { status } = useAuth();
  return status === "authenticated" ? null : children;
}

export default function TrialLink({ className, children, signedInLabel = "Go to dashboard", signedInHref = "/dashboard", icon = null }) {
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  return (
    <Link href={signedIn ? signedInHref : "/signup"} className={className}>
      {signedIn ? signedInLabel : children}
      {icon}
    </Link>
  );
}
