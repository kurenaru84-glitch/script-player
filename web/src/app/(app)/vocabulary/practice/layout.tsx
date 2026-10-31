import { Suspense } from "react";

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="text-sm text-zinc-500">読み込み中…</p>}>{children}</Suspense>;
}
