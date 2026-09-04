import Link from "next/link";

import type { BatchDetail, BatchRowDisposition } from "@/modules/issuance/batch-types";

function titleDisposition(value: BatchRowDisposition) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

export function BatchResult({
  detail,
  repeatedCommit = false,
}: {
  detail: BatchDetail;
  repeatedCommit?: boolean;
}) {
  return (
    <section className="batch-result" aria-labelledby="batch-result-title">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {detail.status === "COMMITTED" ? "Committed Batch" : "Validation Preview"}
          </span>
          <h1 id="batch-result-title">Batch Result</h1>
          <p>{detail.sourceFilename}</p>
        </div>
      </div>
      {repeatedCommit ? (
        <p className="notice">
          This batch was already committed. No duplicate credentials were created.
        </p>
      ) : null}
      <div className="batch-counts batch-result-counts">
        <strong className="status-ready">{detail.issuedCount} Issued</strong>
        <strong>{detail.alreadyIssuedCount} Already Issued</strong>
        <strong className="status-invalid">{detail.invalidCount} Invalid</strong>
        <span>{detail.totalRows} Total</span>
      </div>
      {detail.status === "COMMITTED" ? (
        <p className="notice">
          Every newly issued credential in this batch was signed before the batch committed.
        </p>
      ) : null}
      <a
        className="secondary-button export-link"
        href={`/api/issuance-batches/${encodeURIComponent(detail.id)}/report`}
      >
        Download Result Report
      </a>
      <div className="batch-row-list batch-result-rows" role="table" aria-label="Batch Result Rows">
        <div className="batch-row batch-result-row batch-table-header" role="row">
          <span role="columnheader">Row</span>
          <span role="columnheader">Student Number</span>
          <span role="columnheader">Disposition</span>
          <span role="columnheader">Message</span>
          <span role="columnheader">Credential</span>
        </div>
        {detail.rows.map((row) => (
          <div className="batch-row batch-result-row" role="row" key={row.rowNumber}>
            <span data-label="Row" role="cell">
              {row.rowNumber}
            </span>
            <span data-label="Student Number" role="cell">
              {row.studentNumber || "—"}
            </span>
            <strong
              data-label="Disposition"
              role="cell"
              className={`batch-disposition disposition-${row.disposition.toLowerCase()}`}
            >
              {titleDisposition(row.disposition)}
            </strong>
            <span data-label="Message" role="cell">
              {row.message}
            </span>
            <span data-label="Credential" role="cell">
              {row.issuanceId ? (
                <Link
                  className="text-button"
                  href={`/issued/${encodeURIComponent(row.issuanceId)}`}
                >
                  View Credential
                </Link>
              ) : (
                "—"
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
