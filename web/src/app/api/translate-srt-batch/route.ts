import { NextResponse } from "next/server";
import { translateSubtitleLines } from "@/lib/gemini/translateSubtitleLines";

export const maxDuration = 60;

const MAX_LINES = 25;
const MAX_CHARS = 12_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      lines?: string[];
      sourceLanguage?: string;
      targetLanguage?: string;
    };
    const lines = body.lines?.map((l) => l.trim()).filter(Boolean) ?? [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "翻訳する行がありません" }, { status: 400 });
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json(
        { error: `1回あたり最大 ${MAX_LINES} 行までです` },
        { status: 400 },
      );
    }
    const totalChars = lines.reduce((n, l) => n + l.length, 0);
    if (totalChars > MAX_CHARS) {
      return NextResponse.json({ error: "テキストが長すぎます" }, { status: 400 });
    }

    const translations = await translateSubtitleLines(lines, {
      sourceLanguage: body.sourceLanguage,
      targetLanguage: body.targetLanguage ?? "日本語",
    });
    return NextResponse.json({ translations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "翻訳に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
