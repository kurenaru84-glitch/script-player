import { NextResponse } from "next/server";
import { explainGrammarLines } from "@/lib/gemini/explainGrammarLines";

export const maxDuration = 60;

const MAX_LINES = 8;
const MAX_CHARS = 10_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      lines?: { primary: string; translation?: string }[];
      sourceLanguage?: string;
    };
    const lines =
      body.lines?.filter((l) => l.primary?.trim()).map((l) => ({
        primary: l.primary.trim(),
        translation: l.translation?.trim(),
      })) ?? [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "解説する行がありません" }, { status: 400 });
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json(
        { error: `1回あたり最大 ${MAX_LINES} 行までです` },
        { status: 400 },
      );
    }
    const totalChars = lines.reduce(
      (n, l) => n + l.primary.length + (l.translation?.length ?? 0),
      0,
    );
    if (totalChars > MAX_CHARS) {
      return NextResponse.json({ error: "テキストが長すぎます" }, { status: 400 });
    }

    const explanations = await explainGrammarLines(lines, {
      sourceLanguage: body.sourceLanguage,
    });
    return NextResponse.json({ explanations });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "文法解説の生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
