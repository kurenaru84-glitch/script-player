#!/usr/bin/env node
/**
 * 英語 SRT → 日本語 SRT（タイムコード維持）
 *
 * Usage:
 *   GEMINI_API_KEY=AIza... node web/scripts/translate-srt-file.mjs input.en.srt output.ja.srt
 *
 * Options:
 *   GEMINI_MODEL=gemini-3.5-flash  BATCH=20  SLEEP_MS=3000
 */

import fs from "node:fs";
import path from "node:path";

const MODEL = (process.env.GEMINI_MODEL ?? "gemini-3.5-flash").trim();
const BATCH = Number(process.env.BATCH ?? "20");
const SLEEP_MS = Number(process.env.SLEEP_MS ?? "3500");
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? "6");

function parseSrt(raw) {
  const normalized = raw.replace("\uFEFF", "").replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    let i = 0;
    let index = cues.length + 1;
    const maybe = Number.parseInt(lines[i] ?? "", 10);
    if (!Number.isNaN(maybe)) {
      index = maybe;
      i++;
    }
    const timing = lines[i];
    if (!timing?.includes("-->")) continue;
    i++;
    const text = lines.slice(i).join("\n");
    cues.push({ index, timing, text });
  }
  return cues;
}

function formatSrt(cues) {
  return cues
    .map((c) => `${c.index}\n${c.timing}\n${c.text}`)
    .join("\n\n")
    .trim() + "\n";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonArray(raw) {
  const trimmed = raw.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim();
  const payload = jsonBlock ?? trimmed;
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) throw new Error("JSON 配列ではありません");
  return parsed.map((item) => String(item ?? "").trim());
}

async function geminiTranslate(lines, apiKey) {
  const prompt = `あなたはアニメ語学学習者向け字幕の翻訳者です。
英語の字幕行を日本語に翻訳してください。

ルール:
- 入力と同じ件数・同じ順序で返す
- 話者タグ [Hori]→[堀] [Miyamura]→[宮村] [Yasuda]→[安田] [Ishikawa]→[石川] [Sota]→[創太] など
- [ ] 内の効果音も日本語化
- HTML の <i> タグは維持
- 出力は JSON 配列のみ（文字列の配列）

入力:
${JSON.stringify(lines)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const translated = parseJsonArray(text.trim());
  if (translated.length !== lines.length) {
    throw new Error(`行数不一致 ${lines.length} → ${translated.length}`);
  }
  return translated;
}

async function translateBatchWithRetry(lines, apiKey) {
  let attempt = 0;
  while (true) {
    try {
      return await geminiTranslate(lines, apiKey);
    } catch (e) {
      attempt += 1;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable =
        /high demand|resource exhausted|429|503|quota|rate/i.test(msg) ||
        e.status === 429 ||
        e.status === 503;
      if (!retryable || attempt >= MAX_RETRIES) throw e;
      const wait = SLEEP_MS * attempt;
      console.warn(`  リトライ ${attempt}/${MAX_RETRIES} (${wait}ms): ${msg.slice(0, 80)}`);
      await sleep(wait);
    }
  }
}

async function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error("Usage: GEMINI_API_KEY=... node translate-srt-file.mjs input.srt output.srt");
    process.exit(1);
  }
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  if (!apiKey) {
    console.error("GEMINI_API_KEY を設定してください");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(inPath), "utf8");
  const cues = parseSrt(raw);
  if (cues.length === 0) {
    console.error("字幕が空です");
    process.exit(1);
  }
  console.log(` cues: ${cues.length}, batch: ${BATCH}, model: ${MODEL}`);

  const translatedTexts = [];
  for (let i = 0; i < cues.length; i += BATCH) {
    const batch = cues.slice(i, i + BATCH);
    const lines = batch.map((c) => c.text);
    process.stdout.write(`  ${i + 1}-${i + lines.length} / ${cues.length}… `);
    const ja = await translateBatchWithRetry(lines, apiKey);
    translatedTexts.push(...ja);
    console.log("OK");
    if (i + BATCH < cues.length) await sleep(SLEEP_MS);
  }

  const outCues = cues.map((c, idx) => ({
    ...c,
    text: translatedTexts[idx] ?? "",
  }));
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), formatSrt(outCues), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
