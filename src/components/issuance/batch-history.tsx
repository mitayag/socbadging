import Link from "next/link";

import type { BatchHistoryItem } from "@/modules/issuance/services/batch-preview-service";

export function BatchHistory({ items }: { items: BatchHistoryItem[] }) {
  return (
    <section className="batch-history" aria-labelledby="batch-history-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Recent Activity</span>
          <h2 id="batch-history-title">Batch History</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">No batch previews have been created for this class.</p>
      ) : (
        <div className="batch-history-list">
          {items.map((item) => (
            <article className="batch-history-row" key={item.id}>
              <div>
                <strong>{item.sourceFilename}</strong>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <div className="batch-history-counts">
                <span>{item.issuedCount} Issued</span>
                <span>{item.invalidCount} Invalid</span>
                <span className={`batch-status status-${item.status.toLowerCase()}`}>
                  {item.status === "READY"
                    ? "Ready"
                    : item.status === "COMMITTED"
                      ? "Committed"
                      : "Expired"}
                </span>
              </div>
              <div className="inline-actions">
                <Link
                  className="secondary-button export-link"
                  href={`/issuance-batches/${encodeURIComponent(item.id)}`}
                >
                  View Batch Result
                </Link>
                <a
                  className="text-button"
                  href={`/api/issuance-batches/${encodeURIComponent(item.id)}/report`}
                >
                  Download Batch Report
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
