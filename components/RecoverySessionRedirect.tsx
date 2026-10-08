"use client";

import { useEffect } from "react";
import { PASSWORD_UPDATE_PATH } from "@/lib/auth-redirect";

/**
 * Implicit recovery links put the session in the URL hash, which the server
 * never sees. If one lands on the site root, the proxy has already sent the
 * browser to /tracking and the hash comes along. Read it here and continue
 * to the password form once the cookie is stored.
 */
export default function RecoverySessionRedirect() {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const type = params.get("type");
    const hasAccessToken = params.has("access_token");
    const hasError = params.has("error") || params.has("error_code");

    if (hasError && !hasAccessToken) {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?error=reset");
      }
      return;
    }
    if (type !== "recovery" || !hasAccessToken) return;
    if (window.location.pathname === PASSWORD_UPDATE_PATH) return;

    let cancelled = false;
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) window.location.replace(PASSWORD_UPDATE_PATH);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
