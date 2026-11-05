/* eslint-disable @next/next/no-img-element -- immutable public snapshot artwork */
import Link from "next/link";

import { CryptographicVerification } from "@/components/verification/cryptographic-verification";
import { ShareControls } from "@/components/verification/share-controls";
import type { PublicCredential } from "@/modules/verification/types";

function date(value: string | null) {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function StudentCredentialDetail({ credential }: { credential: PublicCredential }) {
  const canonicalUrl = credential.credential.id;
  const title = `Verify ${credential.achievement.name}`;
  const text = `Verify ${credential.achievement.name} from ${credential.issuer.name}.`;

  return (
    <div className="student-credential-detail">
      <header className="credential-heading">
        <img
          alt={`${credential.achievement.name} badge artwork`}
          src={credential.achievement.image.id}
        />
        <div>
          <span className={`status ${credential.status.toLowerCase()}`}>{credential.status}</span>
          <h1>{credential.achievement.name}</h1>
          <p>
            {credential.achievement.class.courseCode} · {credential.achievement.class.title}
          </p>
          <p>{credential.achievement.description}</p>
        </div>
      </header>

      <div className="credential-grid">
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
              <dt>Issuer</dt>
              <dd>{credential.issuer.name}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{date(credential.issuedAt)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{date(credential.expiresAt)}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>
                {credential.achievement.class.section} · {credential.achievement.class.term} ·{" "}
                {credential.achievement.class.academicYear}
              </dd>
            </div>
          </dl>
          <h2>Downloads</h2>
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
            <a
              className="secondary-button export-link"
              href={`/api/credentials/${encodeURIComponent(credential.publicId)}/image?download=1`}
            >
              Download Badge Image
            </a>
            <a
              className="secondary-button export-link"
              href={`/api/credentials/${encodeURIComponent(credential.publicId)}/pdf`}
            >
              Download PDF Summary
            </a>
          </div>
          <p className="credential-note">
            The signed JSON-LD is the authoritative credential. The PDF is a human-readable summary.
          </p>
          <Link
            className="secondary-button export-link"
            href={`/credentials/${credential.publicId}`}
            target="_blank"
          >
            Open Public Verification
          </Link>
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
      <ShareControls
        canonicalUrl={canonicalUrl}
        qrSrc={`/api/credentials/${encodeURIComponent(credential.publicId)}/qr`}
        sharingEnabled={credential.sharingEnabled}
        text={text}
        title={title}
      />
    </div>
  );
}
