export type MediaMeta = {
  id: string;
  title: string;
  primarySrt: string;
  translationSrt: string;
  createdAt: number;
};

export type VocabNote = {
  id: string;
  mediaId: string;
  cueIndex: number;
  primaryLine: string;
  translationLine: string;
  body: string;
  updatedAt: number;
};

export type FavoriteRecord = {
  id: string;
  mediaId: string;
  cueIndex: number;
};
