import { useEffect, useRef } from "react";

/**
 * 画面オフ・バックグラウンドでも再生を続けやすくする（OS / ブラウザ依存）。
 * 意図しない pause を短時間後に再開する。
 */
export function useBackgroundPlayback(video: HTMLVideoElement | null) {
  const wantPlayRef = useRef(false);
  const userPausedRef = useRef(false);

  useEffect(() => {
    if (!video) return;

    const onPlay = () => {
      wantPlayRef.current = true;
      userPausedRef.current = false;
    };

    const onPause = () => {
      if (userPausedRef.current || !wantPlayRef.current) return;
      if (!document.hidden) return;
      window.setTimeout(() => {
        if (!wantPlayRef.current || userPausedRef.current) return;
        if (!document.hidden) return;
        if (video.paused) {
          void video.play().catch(() => undefined);
        }
      }, 250);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [video]);

  const markUserPaused = () => {
    userPausedRef.current = true;
    wantPlayRef.current = false;
  };

  const markUserPlay = () => {
    userPausedRef.current = false;
    wantPlayRef.current = true;
  };

  return { markUserPaused, markUserPlay };
}
