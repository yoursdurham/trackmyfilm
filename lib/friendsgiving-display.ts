/**
 * Temporary full-screen video. The mode string is stored in displays.mode,
 * which is plain text, so no migration is required.
 * The front window and the inside studio screen can both select it.
 * Each slug has its own file.
 */
export const FRIENDSGIVING_MODE = "friendsgiving";

/** Public path for each screen that can play the loop. */
export const FRIENDSGIVING_VIDEO_SRC = {
  "front-window": "/display/friendsgiving-front-window.mp4",
  "studio-vertical": "/display/friendsgiving-studio-vertical.mp4",
} as const;

export function isFriendsgivingSlug(slug: string | null | undefined): slug is keyof typeof FRIENDSGIVING_VIDEO_SRC {
  return typeof slug === "string" && Object.prototype.hasOwnProperty.call(FRIENDSGIVING_VIDEO_SRC, slug);
}

export function friendsgivingVideoSrc(slug: string | null | undefined): string | null {
  return isFriendsgivingSlug(slug) ? FRIENDSGIVING_VIDEO_SRC[slug] : null;
}

/**
 * The studio file already includes the 222px black strip, so it stretches
 * edge to edge. The front window keeps its landscape file letterboxed.
 */
export function friendsgivingObjectFit(slug: string | null | undefined): "contain" | "fill" {
  return slug === "studio-vertical" ? "fill" : "contain";
}

/** How often a kiosk checks that the loop is still moving. */
export const FRIENDSGIVING_WATCH_MS = 2_000;

export interface FriendsgivingPlayback {
  paused: boolean;
  ended: boolean;
  currentTime: number;
  /** currentTime from the previous watchdog tick. Null on the first tick. */
  previousTime: number | null;
}

export type FriendsgivingPlaybackAction = "restart" | "play" | "none";

/**
 * Decide how to recover a stalled loop.
 * `ended` goes back to the first frame. A clock that stopped mid-file does
 * too, because play() alone will not unstick a decoder. A pause just resumes.
 */
export function friendsgivingPlaybackAction(
  video: FriendsgivingPlayback,
): FriendsgivingPlaybackAction {
  if (video.ended) return "restart";
  if (
    video.previousTime !== null
    && video.currentTime > 0
    && video.currentTime === video.previousTime
  ) {
    return "restart";
  }
  if (video.paused) return "play";
  return "none";
}
