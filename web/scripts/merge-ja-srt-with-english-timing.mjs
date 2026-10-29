#!/usr/bin/env node
/** 英語 SRT のタイムコード + 日本語 SRT の本文（番号一致） */
import fs from "node:fs";

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
    const text = lines.slice(i).join("\n").trim();
    cues.push({ index, timing, text });
  }
  return cues;
}

const [, , enPath, jaPath, outPath, mode] = process.argv;
if (!enPath || !jaPath || !outPath) {
  console.error(
    "Usage: node merge-ja-srt-with-english-timing.mjs english.srt japanese.srt out.srt [by-index|sequential]",
  );
  process.exit(1);
}

const en = parseSrt(fs.readFileSync(enPath, "utf8"));
let ja = parseSrt(fs.readFileSync(jaPath, "utf8"));

ja = ja.map((c) => ({
  ...c,
  timing: c.timing
    .replace(/00:08:122/, "00:04:08,122")
    .replace(/00:048,087/, "00:09:48,087")
    .replace(/^00:17,950/, "00:10:17,950")
    .replace(/^00:23,914/, "00:10:23,914")
    .replace(/^00:27,269/, "00:11:27,269")
    .replace(/^00:29,855/, "00:11:29,855")
    .replace(/^00:21:31,357/, "00:11:31,357")
    .replace(/00:20:21,861$/, "00:14:21,861")
    .replace(/^00:21:480/, "00:16:21,480")
    .replace(/^00:26:026/, "00:16:26,026")
    .replace(/^00:16:864/, "00:19:16,864")
    .replace(/^00:12:161/, "00:19:22,161")
    .replace(/^00:35:883/, "00:19:35,883")
    .replace(/^00:37,176/, "00:19:37,176")
    .replace(/^00:38,886/, "00:19:38,886")
    .replace(/^00:22:387/, "00:20:22,387")
    .replace(/^00:26:850/, "00:20:26,850")
    .replace(/^00:39,905/, "00:20:39,905")
    .replace(/^00:21:041/, "00:21:01,041")
    .replace(/^00:00:07,484 --> 00:01:08,735/, "00:01:07,484 --> 00:01:08,735"),
}));

const parts = [];
if (mode === "sequential") {
  const n = Math.min(ja.length, en.length);
  for (let i = 0; i < n; i++) {
    parts.push(`${en[i].index}\n${en[i].timing}\n${ja[i].text}`);
  }
  console.warn(`Sequential merge: ${n} cues (EN has ${en.length}, JA has ${ja.length})`);
} else {
  const jaByIndex = new Map(ja.map((c) => [c.index, c.text]));
  const enByIndex = new Map(en.map((c) => [c.index, c.timing]));
  const indices = [...jaByIndex.keys()].sort((a, b) => a - b);
  for (const index of indices) {
    const text = jaByIndex.get(index);
    const timing = enByIndex.get(index);
    if (!text || !timing) {
      console.warn(`skip #${index}: missing ${!timing ? "EN timing" : "JA text"}`);
      continue;
    }
    parts.push(`${index}\n${timing}\n${text}`);
  }
}

fs.writeFileSync(outPath, parts.join("\n\n").trim() + "\n", "utf8");
console.log(`Wrote ${parts.length} cues → ${outPath}`);
