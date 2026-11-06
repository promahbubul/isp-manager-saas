"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ContentArea, Sidebar } from "@/components/dashboard";
import { useAuth } from "@/providers/AuthProvider";

const DashboardLayout = ({ children }) => {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">Loading...</div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-row print:block print:h-auto">
      <Sidebar />
      <ContentArea>{children}</ContentArea>
    </div>
  );
};

export default DashboardLayout;
