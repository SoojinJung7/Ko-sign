"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/ui";

/**
 * In-app browsers (KakaoTalk, Gmail, Instagram, …) often fail to rasterize the
 * embedded PDF, leaving the signer staring at blank field boxes. We can't force
 * an escape reliably on iOS — apps sandbox their WKWebView — so this offers the
 * two things that do work everywhere: on Android, an intent that hands the URL
 * to Chrome; and, as a universal fallback, copying the link to paste into a real
 * browser. Shown prominently when an in-app browser is detected, quietly (as a
 * safety net for missed detections) otherwise.
 */

function isInAppBrowser(ua: string): boolean {
  const named =
    /KAKAOTALK|NAVER|Line\/|Instagram|FBAN|FBAV|FB_IAB|DaumApps|Snapchat|Gmail|GSA/i.test(
      ua,
    );
  // Android WebView (the shell most in-app browsers embed) tags itself "wv".
  const androidWebView = /Android/i.test(ua) && /\bwv\b/i.test(ua);
  // A real iOS browser reports "Safari" (or CriOS/FxiOS/EdgiOS). A WKWebView
  // hosted inside an app reports neither.
  const iosInApp =
    /iPhone|iPad|iPod/i.test(ua) &&
    !/Safari/i.test(ua) &&
    !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return named || androidWebView || iosInApp;
}

export function OpenInBrowserNotice() {
  const { t } = useI18n();
  // Detection and window access are client-only; render nothing until mounted
  // so server and first client paint agree.
  const [mounted, setMounted] = useState(false);
  const [inApp, setInApp] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setInApp(isInAppBrowser(ua));
    setIsIos(/iPhone|iPad|iPod/i.test(ua));
    setMounted(true);
  }, []);

  if (!mounted || dismissed) return null;

  function openInBrowser() {
    const url = window.location.href;
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) {
      // Hand the URL to Chrome; if Chrome is absent, Android opens the fallback.
      const noScheme = url.replace(/^https?:\/\//, "");
      window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
        url,
      )};end`;
      return;
    }
    // iOS / unknown: no reliable programmatic escape — try, then lean on copy.
    window.open(url, "_blank");
  }

  async function copyLink() {
    const url = window.location.href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setShowUrl(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (common in webviews): reveal the URL to copy by hand.
      setShowUrl(true);
      requestAnimationFrame(() => {
        urlRef.current?.focus();
        urlRef.current?.select();
      });
    }
  }

  return (
    <div
      className={cn(
        "mb-6 rounded-xl border p-3 text-sm",
        inApp
          ? "border-tone-warning-line bg-tone-warning-soft"
          : "border-border bg-surface-2",
      )}
      role="note"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {t.signer.cantSeeDocumentTitle}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.signer.cantSeeDocumentBody}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t.chrome.closeDialog}
          className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={openInBrowser}>
          {t.signer.openInBrowser}
        </Button>
        <Button size="sm" variant="secondary" onClick={copyLink}>
          {copied ? t.signer.linkCopied : t.signer.copyLink}
        </Button>
      </div>

      {isIos && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t.signer.openInBrowserIosHint}
        </p>
      )}

      {showUrl && (
        <input
          ref={urlRef}
          readOnly
          value={typeof window !== "undefined" ? window.location.href : ""}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full select-all rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
        />
      )}
    </div>
  );
}
