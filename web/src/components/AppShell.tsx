"use client";

import { Suspense } from "react";
import { BottomNav } from "@/components/BottomNav";
import { BottomNavFallback } from "@/components/BottomNavFallback";
import { SplashScreen } from "@/components/SplashScreen";
import { TranslationJobBootstrap } from "@/components/TranslationJobBootstrap";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TranslationJobBootstrap />
      <SplashScreen />
      <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        <main className="mx-auto min-h-dvh w-full max-w-lg flex-1 overflow-x-clip px-4 pt-4">
          {children}
        </main>
      </div>
      <Suspense fallback={<BottomNavFallback />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
