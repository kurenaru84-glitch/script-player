"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { RepeatPlayer } from "@/components/RepeatPlayer";

function PlayerContent() {
  const params = useParams<{ mediaId: string }>();
  const mediaId = params.mediaId;

  if (!mediaId) {
    return (
      <p className="py-12 text-center text-sm text-red-600">
        メディア ID がありません
      </p>
    );
  }

  return <RepeatPlayer mediaId={mediaId} />;
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-sm text-zinc-500">読み込み中…</p>
      }
    >
      <PlayerContent />
    </Suspense>
  );
}
