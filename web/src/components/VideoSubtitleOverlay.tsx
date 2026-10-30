import type { BilingualCue } from "@/lib/subtitle/types";
import { maskPrimaryLine } from "@/lib/subtitle/maskPrimaryLine";

type Props = {
  cue: BilingualCue | null;
  /** ディクテ時は英文を隠す */
  maskPrimary?: boolean;
};

export function VideoSubtitleOverlay({ cue, maskPrimary = false }: Props) {
  if (!cue) return null;
  const primary = maskPrimary ? maskPrimaryLine(cue.primary) : cue.primary;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1 pt-6 text-white">
      <p
        className={`line-clamp-2 text-xs font-medium ${maskPrimary ? "font-mono tracking-widest text-zinc-300" : ""}`}
      >
        {primary}
      </p>
      {cue.translation && (
        <p className="line-clamp-2 text-[10px] text-zinc-300">{cue.translation}</p>
      )}
    </div>
  );
}
