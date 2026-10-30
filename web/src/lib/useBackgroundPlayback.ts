import { useEffect, useRef } from "react";

/**
 * 画面オフ・バックグラウンドでも再生を続けやすくする（OS / ブラウザ依存）。
 * Pixel 等では完全保証はできないため PiP も併用推奨。
 */
export function useBackgroundPlayback(video: HTMLVideoElement | null) {
  const wantPlayRef = useRef(false);
  const userPausedRef = useRef(false);

  useEffect(() => {
    if (!video) return;

    const tryResume = () => {
      if (userPausedRef.current || !wantPlayRef.current) return;
      if (!video.paused) return;
      void video.play().catch(() => undefined);
    };

    const onPlay = () => {
      wantPlayRef.current = true;
      userPausedRef.current = false;
    };

    const onPause = () => {
      if (userPausedRef.current || !wantPlayRef.current) return;
      tryResume();
      window.setTimeout(tryResume, 120);
      window.setTimeout(tryResume, 400);
      window.setTimeout(tryResume, 900);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tryResume();
      }
    };

    const onPageHide = () => tryResume();

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    const keepAlive = window.setInterval(() => {
      if (!document.hidden) return;
      tryResume();
    }, 600);

    return () => {
      window.clearInterval(keepAlive);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
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

export async function enterVideoPictureInPicture(
  video: HTMLVideoElement | null,
): Promise<boolean> {
  if (!video || !document.pictureInPictureEnabled) return false;
  try {
    if (document.pictureInPictureElement === video) return true;
    await video.requestPictureInPicture();
    return true;
  } catch {
    return false;
  }
}
