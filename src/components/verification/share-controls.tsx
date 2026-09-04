"use client";

import { useEffect, useState } from "react";

type ShareControlsProps = {
  canonicalUrl: string;
  title: string;
  text: string;
  sharingEnabled: boolean;
};

function externalLink(url: string) {
  return { href: url, target: "_blank", rel: "noopener noreferrer" };
}

export function ShareControls({ canonicalUrl, title, text, sharingEnabled }: ShareControlsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCanNativeShare(Boolean((navigator as { share?: unknown }).share));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!sharingEnabled) {
    return <p className="sharing-disabled">Sharing is disabled for this credential.</p>;
  }

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: canonicalUrl })}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: canonicalUrl })}`;
  const xUrl = `https://x.com/intent/post?${new URLSearchParams({ text, url: canonicalUrl })}`;
  const emailUrl = `mailto:?${new URLSearchParams({ subject: title, body: `${text}\n\n${canonicalUrl}` })}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setFeedback("Verification link copied.");
    } catch {
      setFeedback("The verification link could not be copied. Select and copy the URL instead.");
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      setFeedback(
        "Native sharing is unavailable on this device. Use one of the sharing links instead.",
      );
      return;
    }
    try {
      await navigator.share({ title, text, url: canonicalUrl });
      setFeedback("Verification link shared.");
    } catch {
      setFeedback("Sharing was not completed.");
    }
  }

  return (
    <section aria-labelledby="sharing-heading" className="share-controls">
      <h2 id="sharing-heading">Share Verification</h2>
      <p className="muted">
        Share this public verification page without recipient contact details.
      </p>
      <div className="inline-actions">
        <button className="secondary-button" onClick={copyLink} type="button">
          Copy Verification Link
        </button>
        {canNativeShare ? (
          <button className="secondary-button" onClick={nativeShare} type="button">
            Share Verification Link
          </button>
        ) : null}
        <a
          aria-label="Share on LinkedIn"
          className="secondary-button export-link"
          {...externalLink(linkedInUrl)}
        >
          LinkedIn
        </a>
        <a
          aria-label="Share on Facebook"
          className="secondary-button export-link"
          {...externalLink(facebookUrl)}
        >
          Facebook
        </a>
        <a aria-label="Share on X" className="secondary-button export-link" {...externalLink(xUrl)}>
          X
        </a>
        <a
          aria-label="Share by email"
          className="secondary-button export-link"
          {...externalLink(emailUrl)}
        >
          Email
        </a>
      </div>
      <p aria-live="polite" className="share-feedback" role="status">
        {feedback}
      </p>
      {feedback?.includes("could not be copied") ? (
        <label className="field share-url-fallback" htmlFor="verification-url">
          <span>Verification URL</span>
          <input id="verification-url" readOnly value={canonicalUrl} />
        </label>
      ) : null}
    </section>
  );
}
