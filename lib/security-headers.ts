export const SITE_HEADER_SOURCE = "/((?!embed(?:/|$)).*)";
export const EMBED_HEADER_SOURCE = "/embed/:path*";

export const EMBED_FRAME_ANCESTORS =
  "frame-ancestors 'self' https://www.yoursdurham.com https://yoursdurham.com";

type SecurityHeader = { key: string; value: string };

const sharedSecurityHeaders: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Powered-By", value: "" },
];

export function siteSecurityHeaders(): SecurityHeader[] {
  return [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, ...sharedSecurityHeaders];
}

export function embedSecurityHeaders(): SecurityHeader[] {
  return [
    ...sharedSecurityHeaders,
    { key: "Content-Security-Policy", value: EMBED_FRAME_ANCESTORS },
  ];
}

export function securityHeaderRules() {
  return [
    { source: SITE_HEADER_SOURCE, headers: siteSecurityHeaders() },
    { source: EMBED_HEADER_SOURCE, headers: embedSecurityHeaders() },
  ];
}
