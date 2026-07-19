"use client";

import { useState } from "react";

import { Alert, Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Shown when a signed-in but non-admin account lands on /login. Explains that
 * the account lacks access and offers to sign out so a different (admin) email
 * can be used — without this, the account would sit in limbo (the app shell
 * redirects them here, and here we no longer bounce them onward).
 */
export function ForbiddenNotice() {
  const { t } = useI18n();
  const [loggingOut, setLoggingOut] = useState(false);

  async function switchAccount() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Reload regardless; the session cookie is cleared server-side.
    }
    window.location.href = "/login";
  }

  return (
    <Alert variant="error" title={t.auth.forbiddenTitle} className="mb-6">
      <p>{t.auth.forbiddenBody}</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        loading={loggingOut}
        onClick={switchAccount}
      >
        {t.auth.switchAccount}
      </Button>
    </Alert>
  );
}
