import type { SubtitleCue } from "./types";

/** Port of Android `SrtParser.kt` */
export function parseSrt(raw: string): SubtitleCue[] {
  const normalized = raw.replace("\uFEFF", "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  let autoIndex = 1;

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    let lineIdx = 0;
    const maybeIndex = Number.parseInt(lines[lineIdx] ?? "", 10);
    if (!Number.isNaN(maybeIndex)) {
      autoIndex = maybeIndex;
      lineIdx++;
    }

    if (lineIdx >= lines.length) continue;
    const timing = parseTiming(lines[lineIdx] ?? "");
    if (!timing) continue;
    lineIdx++;

    const text = lines.slice(lineIdx).join("\n").trim();
    if (!text) continue;

    cues.push({
      index: autoIndex,
      startMs: timing[0],
      endMs: timing[1],
      text,
    });
    autoIndex++;
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

function parseTiming(line: string): [number, number] | null {
  const parts = line.split("-->");
  if (parts.length !== 2) return null;
  const start = parseTimestamp(parts[0]?.trim() ?? "");
  const end = parseTimestamp(parts[1]?.trim() ?? "");
  if (start == null || end == null) return null;
  if (end <= start) return [start, start + 500];
  return [start, end];
}

function parseTimestamp(value: string): number | null {
  const cleaned = value.replace(",", ".");
  const chunks = cleaned.split(":");
  if (chunks.length !== 3) return null;

  try {
    const hours = Number.parseInt(chunks[0] ?? "0", 10);
    const minutes = Number.parseInt(chunks[1] ?? "0", 10);
    const secondsParts = (chunks[2] ?? "0").split(".");
    const seconds = Number.parseInt(secondsParts[0] ?? "0", 10);
    const millisRaw = secondsParts[1] ?? "";
    const millis = millisRaw
      ? Number.parseInt(millisRaw.padEnd(3, "0").slice(0, 3), 10)
      : 0;
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + millis;
  } catch {
    return null;
  }
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
