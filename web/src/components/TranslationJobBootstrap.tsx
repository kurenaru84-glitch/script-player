"use client";

import { useEffect } from "react";
import { installTranslationGlobalResume } from "@/lib/translation/translationJobRunner";

/** 全ページで未完了の翻訳ジョブを監視・再開 */
export function TranslationJobBootstrap() {
  useEffect(() => {
    installTranslationGlobalResume();
  }, []);
  return null;
}
