/* eslint-disable @next/next/no-img-element -- public snapshot image origins are deployment-configured. */

import { ShareControls } from "./share-controls";
import { CryptographicVerification } from "./cryptographic-verification";
import type { PublicCredential } from "@/modules/verification/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function statusLabel(status: PublicCredential["status"]) {
  return `${status[0]}${status.slice(1).toLowerCase()} credential`;
}

function contactLink(contact: string) {
  return contact.includes(":") ? contact : `mailto:${contact}`;
}

export function PublicCredentialCard({ credential }: { credential: PublicCredential }) {
  const canonicalUrl = credential.credential.id;
  const title = `Verify ${credential.achievement.name}`;
  const text = `Verify ${credential.achievement.name} from ${credential.issuer.name}.`;

  return (
    <main className="public-credential-page">
      <section aria-labelledby="credential-title" className="public-credential-hero">
        <img
          alt={`${credential.achievement.name} badge artwork`}
          className="public-badge-art"
          height={240}
          src={credential.achievement.image.id}
          width={240}
        />
        <div className="public-credential-intro">
          <p className={`public-status ${credential.status.toLowerCase()}`} role="status">
            {statusLabel(credential.status)}
          </p>
          <p className="eyebrow">HAU SOC Credential Verification</p>
          <h1 id="credential-title">{credential.achievement.name}</h1>
          <p className="public-recipient">Awarded to {credential.recipientDisplayName}</p>
          <p className="muted">{credential.achievement.description}</p>
        </div>
      </section>

      {credential.status === "REVOKED" ? (
        <section aria-labelledby="revocation-heading" className="public-status-panel revoked">
          <h2 id="revocation-heading">This Credential Has Been Revoked</h2>
          <p>
            Revoked on {formatDate(credential.revokedAt!)}. Reason: {credential.revocationReason}
          </p>
        </section>
      ) : null}
      {credential.status === "EXPIRED" ? (
        <section aria-labelledby="expiration-heading" className="public-status-panel expired">
          <h2 id="expiration-heading">This Credential Has Expired</h2>
          <p>It expired on {formatDate(credential.expiresAt!)}.</p>
        </section>
      ) : null}

      <div className="public-credential-grid">
        <section className="panel credential-panel">
          <h2>Achievement</h2>
          <h3>Criteria</h3>
          <p>{credential.achievement.criteria.narrative}</p>
          {credential.achievement.skills.length ? (
            <>
              <h3>Skills</h3>
              <ul className="credential-tags">
                {credential.achievement.skills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </>
          ) : null}
          {credential.achievement.alignment?.length ? (
            <>
              <h3>Alignments</h3>
              <ul className="credential-alignment">
                {credential.achievement.alignment.map((alignment) => (
                  <li key={`${alignment.targetName}-${alignment.targetUrl}`}>
                    <a href={alignment.targetUrl} rel="noopener noreferrer" target="_blank">
                      {alignment.targetName}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section className="panel credential-panel">
          <h2>Credential Details</h2>
          <dl className="credential-facts">
            <div>
              <dt>Recipient</dt>
              <dd>{credential.recipientDisplayName}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{formatDate(credential.issuedAt)}</dd>
            </div>
            {credential.expiresAt ? (
              <div>
                <dt>Expires</dt>
                <dd>{formatDate(credential.expiresAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Course</dt>
              <dd>
                {credential.achievement.class.courseCode} · {credential.achievement.class.title}
              </dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>
                {credential.achievement.class.section} · {credential.achievement.class.term} ·{" "}
                {credential.achievement.class.academicYear}
              </dd>
            </div>
          </dl>
          <h2>Issuer</h2>
          <a
            className="issuer-link"
            href={credential.issuer.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              alt={`${credential.issuer.name} logo`}
              height={48}
              src={credential.issuer.logoUrl}
              width={48}
            />
            <span>{credential.issuer.name}</span>
          </a>
          {credential.supportContact ? (
            <p>
              Support:{" "}
              <a href={contactLink(credential.supportContact)}>{credential.supportContact}</a>
            </p>
          ) : null}
        </section>
      </div>

      <CryptographicVerification
        legacy={credential.isLegacy ?? !credential.signedCredentialJson}
        result={
          credential.cryptographicVerification ?? {
            outcome: "VERIFICATION_UNAVAILABLE",
            checkedAt: new Date(0).toISOString(),
          }
        }
      />

      <section className="panel public-export-panel">
        <h2>Machine-Readable Credential</h2>
        <p className="credential-note">
          This digital credential was issued through the HAU SOC Badging System. Review the issuer,
          recipient, issue date, and current status to verify its record.
        </p>
        <div className="inline-actions">
          <a
            className="secondary-button export-link"
            href={`/api/credentials/${encodeURIComponent(credential.publicId)}`}
          >
            View JSON-LD
          </a>
          <a
            className="secondary-button export-link"
            href={`/api/credentials/${encodeURIComponent(credential.publicId)}/download`}
          >
            Download JSON-LD
          </a>
        </div>
      </section>
      <ShareControls
        canonicalUrl={canonicalUrl}
        sharingEnabled={credential.sharingEnabled}
        text={text}
        title={title}
      />
    </main>
  );
}
