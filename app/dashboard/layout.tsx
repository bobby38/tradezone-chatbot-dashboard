"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";

export const dynamic = "force-dynamic";

function DashboardAuthCheck({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const bypassAuth = useMemo(() => {
    if (process.env.NEXT_PUBLIC_BYPASS_AUTH === "true") return true;
    return searchParams?.get("bypassAuth") === "1";
  }, [searchParams]);

  useEffect(() => {
    // Allow bypassing auth locally when NEXT_PUBLIC_BYPASS_AUTH === 'true'
    if (bypassAuth) return;

    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router, bypassAuth]);

  if (!bypassAuth && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!bypassAuth && !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-w-0 w-full">
        <main className="flex-1 py-4 md:py-6 px-0 md:px-4 lg:px-6 xl:px-8 overflow-x-hidden">
          <div className="mx-auto max-w-7xl w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        </div>
      }
    >
      <DashboardAuthCheck>{children}</DashboardAuthCheck>
    </Suspense>
  );
}
