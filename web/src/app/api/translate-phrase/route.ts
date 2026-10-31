import { NextResponse } from "next/server";
import { translatePhrase } from "@/lib/gemini/translatePhrase";

export const maxDuration = 25;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      phrase?: string;
      sourceLanguage?: string;
      context?: string;
    };
    const phrase = body.phrase?.trim();
    if (!phrase) {
      return NextResponse.json({ error: "語句がありません" }, { status: 400 });
    }
    if (phrase.length > 200) {
      return NextResponse.json({ error: "語句が長すぎます" }, { status: 400 });
    }
    const translation = await translatePhrase(phrase, {
      sourceLanguage: body.sourceLanguage,
      context: body.context,
    });
    return NextResponse.json({ translation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "翻訳に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
