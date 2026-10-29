export type SubtitleCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type BilingualCue = {
  index: number;
  startMs: number;
  endMs: number;
  primary: string;
  translation: string;
};
