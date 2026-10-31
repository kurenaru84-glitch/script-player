import { NextResponse } from "next/server";
import { explainOneGrammarLine } from "@/lib/gemini/explainGrammarLines";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      primary?: string;
      translation?: string;
      sourceLanguage?: string;
    };
    const primary = body.primary?.trim();
    if (!primary) {
      return NextResponse.json({ error: "セリフがありません" }, { status: 400 });
    }
    if (primary.length > 2000) {
      return NextResponse.json({ error: "セリフが長すぎます" }, { status: 400 });
    }

    const explanation = await explainOneGrammarLine(
      { primary, translation: body.translation?.trim() },
      { sourceLanguage: body.sourceLanguage },
    );
    return NextResponse.json({ explanation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "文法解説の生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
