"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLastMediaId } from "@/lib/lastMediaId";

export default function DictationEntryPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const id = getLastMediaId();
    if (id) {
      router.replace(`/dictation/${id}`);
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) {
    return <p className="py-12 text-center text-sm text-zinc-500">読み込み中…</p>;
  }

  return (
    <div className="space-y-4 py-16 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        まず My List から作品を開いて再生してください。
        <br />
        最後に開いた作品でディクテが始まります。
      </p>
      <Link href="/my-list" className="text-sky-600 underline">
        My List へ
      </Link>
    </div>
  );
}
