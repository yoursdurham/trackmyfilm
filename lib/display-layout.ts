import type { DisplayOrientation } from "@/lib/display";

/** Portrait airport board page size. The studio screen keeps this. */
export const PORTRAIT_DEPARTURE_ROWS = 8;
/** Shorter landscape height. Fewer rows so each name stays sidewalk-sized. */
export const LANDSCAPE_DEPARTURE_ROWS = 5;

export const STUDIO_PREVIEW_WIDTH = 1080;
export const STUDIO_PREVIEW_HEIGHT = 3840;
export const STUDIO_PREVIEW_FRAME_HEIGHT = 640;

const LANDSCAPE_PREVIEW_MAX = { width: 720, height: 405 };

export function departuresLayout(orientation: DisplayOrientation): "stacked" | "side-by-side" {
  return orientation === "landscape" ? "side-by-side" : "stacked";
}

export function departureRowsPerPage(orientation: DisplayOrientation): number {
  return orientation === "landscape" ? LANDSCAPE_DEPARTURE_ROWS : PORTRAIT_DEPARTURE_ROWS;
}

export function isLandscapeOrientation(orientation: string | null | undefined): boolean {
  return orientation === "landscape";
}

function parseResolution(value: string | null | undefined): { width: number; height: number } | null {
  const match = value?.trim().match(/^(\d{3,5})x(\d{3,5})$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 640 || height < 360 || width > 8000 || height > 8000) return null;
  return { width, height };
}

export interface PreviewFrame {
  width: number;
  height: number;
  label: string;
  scale: number;
  frameWidth: number;
  frameHeight: number;
}

/**
 * Staff preview box. Portrait stays the studio 1080×3840 frame.
 * Landscape uses the stored resolution when it is wider than it is tall,
 * otherwise 1920×1080, and the iframe is scaled down to fit the page.
 */
export function adminPreviewFrame(display: {
  orientation: string;
  resolution?: string | null;
}): PreviewFrame {
  if (!isLandscapeOrientation(display.orientation)) {
    const scale = STUDIO_PREVIEW_FRAME_HEIGHT / STUDIO_PREVIEW_HEIGHT;
    return {
      width: STUDIO_PREVIEW_WIDTH,
      height: STUDIO_PREVIEW_HEIGHT,
      label: `${STUDIO_PREVIEW_WIDTH} × ${STUDIO_PREVIEW_HEIGHT} preview`,
      scale,
      frameWidth: STUDIO_PREVIEW_WIDTH * scale,
      frameHeight: STUDIO_PREVIEW_FRAME_HEIGHT,
    };
  }

  const parsed = parseResolution(display.resolution);
  const canvas = parsed && parsed.width > parsed.height ? parsed : { width: 1920, height: 1080 };
  const scale = Math.min(
    LANDSCAPE_PREVIEW_MAX.width / canvas.width,
    LANDSCAPE_PREVIEW_MAX.height / canvas.height,
  );
  return {
    width: canvas.width,
    height: canvas.height,
    label: `${canvas.width} × ${canvas.height} preview`,
    scale,
    frameWidth: canvas.width * scale,
    frameHeight: canvas.height * scale,
  };
}
