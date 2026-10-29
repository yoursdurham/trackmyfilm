/**
 * Track My Film wordmark colors, in order. The public header paints one
 * letter at a time; the front-window Open sign uses the same stops as a blend.
 */
export const YOURS_BLEND_COLORS = ["#DDB1B1", "#C5AED7", "#A1CC93"] as const;

/** Left-to-right pink, lilac, green. Same order as the wordmark. */
export const YOURS_BLEND_GRADIENT = `linear-gradient(100deg, ${YOURS_BLEND_COLORS[0]} 0%, ${YOURS_BLEND_COLORS[1]} 50%, ${YOURS_BLEND_COLORS[2]} 100%)`;
