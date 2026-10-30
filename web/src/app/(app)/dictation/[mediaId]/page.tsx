"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { DictationScreen } from "@/components/DictationScreen";

function DictationContent() {
  const params = useParams<{ mediaId: string }>();
  const mediaId = params.mediaId;
  if (!mediaId) {
    return <p className="py-12 text-center text-sm text-red-600">ID がありません</p>;
  }
  return <DictationScreen mediaId={mediaId} />;
}

export default function DictationPage() {
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-sm text-zinc-500">読み込み中…</p>
      }
    >
      <DictationContent />
    </Suspense>
  );
}
