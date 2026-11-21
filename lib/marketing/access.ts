export const MARKETING_PREVIEW_PATHS = [
  "/marketing",
  "/marketing/segments",
  "/marketing/segments/new",
  "/marketing/templates/new",
  "/marketing/campaigns/new",
  "/marketing/automations/new",
  "/marketing/customers",
  "/marketing/settings",
] as const;

/** Dev-only layout preview. Production never treats preview=1 as access. */
export function isMarketingPreview(
  pathname: string,
  preview: string | null,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (nodeEnv === "production" || preview !== "1") return false;
  return MARKETING_PREVIEW_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
