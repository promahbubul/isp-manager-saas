"use client";

import { useEffect } from "react";

/** Registers the portal's service worker so the portal can be installed on a phone. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/portal/" }).catch(() => undefined);
    }
  }, []);
  return null;
}
