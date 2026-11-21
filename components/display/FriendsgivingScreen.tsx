"use client";

import { useEffect, useRef } from "react";
import {
  FRIENDSGIVING_VIDEO_SRC,
  FRIENDSGIVING_WATCH_MS,
  friendsgivingPlaybackAction,
  type FriendsgivingPlaybackAction,
} from "@/lib/friendsgiving-display";

function recover(video: HTMLVideoElement, action: FriendsgivingPlaybackAction) {
  if (action === "none") return;
  if (action === "restart") {
    try {
      video.currentTime = 0;
    } catch {
      // A decoder that is still starting ignores the seek. The next check retries.
    }
  }
  video.muted = true;
  void video.play().catch(() => {
    // Autoplay can fail until the element is ready. The watchdog tries again.
  });
}

export default function FriendsgivingScreen() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    let previousTime: number | null = null;

    const tick = () => {
      const action = friendsgivingPlaybackAction({
        paused: video.paused,
        ended: video.ended,
        currentTime: video.currentTime,
        previousTime,
      });
      previousTime = video.ended ? 0 : video.currentTime;
      recover(video, action);
    };

    const onEnded = () => {
      previousTime = 0;
      recover(video, "restart");
    };
    const onStalled = () => {
      recover(video, video.ended ? "restart" : "play");
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("stalled", onStalled);
    const timer = window.setInterval(tick, FRIENDSGIVING_WATCH_MS);
    recover(video, "play");

    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("stalled", onStalled);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div data-display-mode="friendsgiving" className="h-full w-full bg-black">
      <video
        ref={ref}
        className="pointer-events-none h-full w-full bg-black object-contain"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        src={FRIENDSGIVING_VIDEO_SRC}
      />
    </div>
  );
}
