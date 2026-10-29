import { parseSrt } from "@/lib/subtitle/parseSrt";

export function fingerprintPrimarySrt(primarySrt: string): string {
  const cues = parseSrt(primarySrt);
  if (cues.length === 0) return "empty";
  const first = cues[0]!;
  const last = cues[cues.length - 1]!;
  return `${cues.length}:${first.startMs}:${last.endMs}:${first.text.length}:${last.text.length}`;
}
