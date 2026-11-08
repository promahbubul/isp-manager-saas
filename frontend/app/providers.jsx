"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import { useState } from "react";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/ui/Confirm";
import { SkeletonProvider } from "@/components/ui/Skeleton";
import { TipProvider } from "@/components/ui/Tip";
import { AuthProvider } from "@/providers/AuthProvider";

/** Toasts follow the app theme. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-right" richColors closeButton duration={4000} theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

export default function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* thin progress bar at the top while moving between pages */}
      <NextTopLoader color="#6366f1" height={3} showSpinner={false} shadow="0 0 10px #6366f1,0 0 5px #6366f1" />
      <QueryClientProvider client={queryClient}>
        <SkeletonProvider>
          <TipProvider>
            <AuthProvider>{children}</AuthProvider>
          </TipProvider>
        </SkeletonProvider>
        <ThemedToaster />
        <ConfirmHost />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
