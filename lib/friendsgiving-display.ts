/**
 * Temporary front-window mode. The mode string is stored in displays.mode,
 * which is plain text, so no migration is required.
 */
export const FRIENDSGIVING_MODE = "friendsgiving";

export const FRIENDSGIVING_VIDEO_SRC = "/display/friendsgiving-front-window.mp4";

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
