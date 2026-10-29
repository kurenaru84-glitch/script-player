import { useEffect, useRef } from "react";

type Handlers = {
  title: string;
  onPlay: () => void;
  onPause: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

/** ロック画面・バックグラウンドでの基本操作（ブラウザ / PWA 依存） */
export function useMediaSession(video: HTMLVideoElement | null, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!video || !("mediaSession" in navigator)) return;

    const h = () => handlersRef.current;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: handlers.title,
      artist: "Script Player",
    });

    navigator.mediaSession.setActionHandler("play", () => h().onPlay());
    navigator.mediaSession.setActionHandler("pause", () => h().onPause());
    navigator.mediaSession.setActionHandler("previoustrack", () => h().onPrevious?.());
    navigator.mediaSession.setActionHandler("nexttrack", () => h().onNext?.());

    const syncState = () => {
      navigator.mediaSession.playbackState = video.paused ? "paused" : "playing";
    };
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    syncState();

    return () => {
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [video, handlers.title]);
}
