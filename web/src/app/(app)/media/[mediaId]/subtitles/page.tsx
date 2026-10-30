"use client";

import { useParams } from "next/navigation";
import { SubtitleTranscriptEditor } from "@/components/SubtitleTranscriptEditor";

export default function SubtitleEditorPage() {
  const params = useParams<{ mediaId: string }>();
  const mediaId = params.mediaId;
  if (!mediaId) return <p className="p-4 text-red-600">ID がありません</p>;
  return (
    <div className="px-2 pt-2">
      <SubtitleTranscriptEditor mediaId={mediaId} />
    </div>
  );
}
