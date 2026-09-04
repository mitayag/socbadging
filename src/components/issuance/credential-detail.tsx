import Image from "next/image";
import Link from "next/link";

import type { IssuanceDetail } from "@/modules/issuance/services/issuance-query-service";
import type { NotificationDeliveryStatus } from "@/modules/notifications/types";
import { RevokeCredentialForm } from "./revoke-credential-form";
import { replaceCredentialAction } from "@/app/issued/[issuanceId]/replacement-actions";

function formatDate(value: string | null) {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function mediaUrl(imagePath: string) {
  return `/api/media/${imagePath.split("/").map(encodeURIComponent).join("/")}`;
}

export function CredentialDetail({
  canRevoke = false,
  canReplace = false,
  detail,
  notificationStatus = null,
}: {
  canRevoke?: boolean;
  canReplace?: boolean;
  detail: IssuanceDetail;
  notificationStatus?: NotificationDeliveryStatus | null;
}) {
  return (
    <>
      <header className="credential-heading">
        <Image
          alt={`${detail.achievement.name} badge artwork`}
          height={160}
          src={mediaUrl(detail.achievement.imagePath)}
          unoptimized
          width={160}
        />
        <div>
          <span className={`status ${detail.status.toLowerCase()}`}>{detail.status}</span>
          {notificationStatus ? (
            <span className={`status ${notificationStatus.toLowerCase()}`}>
              Email{" "}
              {notificationStatus === "SENT" ? "Sent" : notificationStatus.replaceAll("_", " ")}
            </span>
          ) : null}
          <h1>{detail.achievement.name}</h1>
          <p>
            {detail.achievement.class.courseCode} · {detail.achievement.class.section}
          </p>
        </div>
      </header>
      <div className="credential-grid">
        <section className="panel credential-panel">
          <h2>Achievement</h2>
          <p>{detail.achievement.description}</p>
          <h3>Criteria</h3>
          <p>{detail.achievement.criteria.narrative}</p>
          {detail.achievement.skills.length ? (
            <>
              <h3>Skills</h3>
              <ul className="credential-tags">
                {detail.achievement.skills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </>
          ) : null}
          {detail.achievement.alignment?.length ? (
            <>
              <h3>Alignment</h3>
              <ul className="credential-alignment">
                {detail.achievement.alignment.map((alignment) => (
                  <li key={`${alignment.targetName}-${alignment.targetUrl}`}>
                    <a href={alignment.targetUrl} rel="noreferrer" target="_blank">
                      {alignment.targetName}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section className="panel credential-panel">
          <h2>Recipient</h2>
          <dl className="credential-facts">
            <div>
              <dt>Name</dt>
              <dd>{detail.recipient.displayName}</dd>
            </div>
            <div>
              <dt>Student Number</dt>
              <dd>{detail.recipient.studentNumber}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.recipient.email}</dd>
            </div>
          </dl>
          <h2>Issuer</h2>
          <dl className="credential-facts">
            <div>
              <dt>Institution</dt>
              <dd>{detail.issuer.name}</dd>
            </div>
            <div>
              <dt>Issuing Faculty</dt>
              <dd>{detail.issuer.issuerUserName}</dd>
            </div>
          </dl>
        </section>
        <section className="panel credential-panel">
          <h2>Credential Record</h2>
          <dl className="credential-facts">
            <div>
              <dt>Issuance ID</dt>
              <dd>{detail.id}</dd>
            </div>
            <div>
              <dt>Public ID</dt>
              <dd>{detail.publicId}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{formatDate(detail.issuedAt)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatDate(detail.expiresAt)}</dd>
            </div>
          </dl>
          <p className="credential-note">
            This credential is preserved as an immutable issuance record. Use its public
            verification link to confirm the current status.
          </p>
          {detail.supersededBy ? (
            <p className="credential-note" role="status">
              This legacy credential has been superseded. View the{" "}
              <Link href={`/issued/${encodeURIComponent(detail.supersededBy.id)}`}>
                replacement credential
              </Link>
              .
            </p>
          ) : null}
          {detail.supersedes ? (
            <p className="credential-note" role="status">
              This is a replacement for the{" "}
              <Link href={`/issued/${encodeURIComponent(detail.supersedes.id)}`}>
                original credential
              </Link>
              . The original remains historically available.
            </p>
          ) : null}
          <Link
            className="secondary-button export-link"
            href={`/api/issued/${encodeURIComponent(detail.id)}/credential`}
          >
            Download Credential JSON
          </Link>
        </section>
        {canRevoke ? <RevokeCredentialForm issuanceId={detail.id} /> : null}
        {canReplace && detail.status === "ACTIVE" && !detail.supersededBy ? (
          <form action={replaceCredentialAction} className="panel credential-panel">
            <h2>Signed replacement</h2>
            <p>Create a new signed historical replacement. The original remains available.</p>
            <input name="originalIssuanceId" type="hidden" value={detail.id} />
            <label>
              <input name="confirmation" required type="checkbox" value="replace" /> I confirm this
              signed replacement
            </label>
            <button className="danger-button" type="submit">
              Create signed replacement
            </button>
          </form>
        ) : null}
      </div>
    </>
  );
}
