/* eslint-disable @next/next/no-img-element -- immutable public snapshot artwork */
import Link from "next/link";

import type { StudentBadgeListItem } from "@/modules/student/types";

function date(value: string | null) {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function StudentBadgeCard({ item }: { item: StudentBadgeListItem }) {
  return (
    <article className="student-badge-card">
      <img alt={`${item.badgeName} badge artwork`} src={item.imageUrl} />
      <div className="student-badge-card-body">
        <div className="student-badge-card-heading">
          <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
          <h2>{item.badgeName}</h2>
          <p>{item.description}</p>
        </div>
        <dl className="credential-facts">
          <div>
            <dt>Issuer</dt>
            <dd>{item.issuerName}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{item.classLabel}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>{date(item.issuedAt)}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{date(item.expiresAt)}</dd>
          </div>
        </dl>
        <div className="inline-actions">
          <Link
            className="secondary-button export-link"
            href={`/student/badges/${item.issuanceId}`}
          >
            View Credential
          </Link>
          <Link
            className="secondary-button export-link"
            href={`/credentials/${item.publicId}`}
            target="_blank"
          >
            Verify Publicly
          </Link>
        </div>
      </div>
    </article>
  );
}
