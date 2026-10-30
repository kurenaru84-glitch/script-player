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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-3 pb-2 pt-8">
      <p
        className={`line-clamp-3 text-sm font-bold leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
          maskPrimary ? "font-mono tracking-widest text-zinc-200" : ""
        }`}
      >
        {primary}
      </p>
      {cue.translation && (
        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-zinc-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          {cue.translation}
        </p>
      )}
    </div>
  );
}
