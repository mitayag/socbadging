"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, Columns3, Download } from "lucide-react";
import { useId } from "react";

import { ImportCommitForm } from "./import-commit-form";
import { ImportPreviewTable } from "./import-preview-table";
import type { ImportCommitState, ImportPreview } from "./import-types";

export function ImportReviewStep({
  commitAction,
  onBack,
  onCommitSuccess,
  onCorrect,
  preview,
}: {
  commitAction: (
    previousState: ImportCommitState,
    formData: FormData,
  ) => Promise<ImportCommitState>;
  onBack: () => void;
  onCommitSuccess: (state: ImportCommitState) => void;
  onCorrect: () => void;
  preview: ImportPreview;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="import-step-panel">
      <div className="import-step-heading">
        <div>
          <h3 id={headingId}>Review before importing</h3>
          <p>Check student details and resolve any rows that need attention.</p>
        </div>
        <span className="import-step-count">Step 3 of 4</span>
      </div>

      <div aria-label="Validation summary" className="import-summary-grid" role="group">
        <div className="import-summary-card ready">
          <CheckCircle2 aria-hidden size={21} />
          <strong>{preview.validCount}</strong>
          <span>Ready to import</span>
        </div>
        <div className={`import-summary-card${preview.errorCount ? " attention" : ""}`}>
          <AlertCircle aria-hidden size={21} />
          <strong>{preview.errorCount}</strong>
          <span>Need attention</span>
        </div>
        <div className="import-summary-card">
          <Columns3 aria-hidden size={21} />
          <strong>{preview.rows.length}</strong>
          <span>Total rows</span>
        </div>
      </div>

      {preview.errorCount > 0 ? (
        <div className="import-attention-panel">
          <div>
            <strong>Some rows cannot be imported.</strong>
            <p>
              Correct the source file and upload it again. Imports with validation errors cannot be
              committed.
            </p>
          </div>
          <a
            className="secondary-button export-link"
            href={`/api/roster-imports/${encodeURIComponent(preview.id)}/errors`}
          >
            <Download aria-hidden size={16} />
            Download Error Report
          </a>
        </div>
      ) : null}

      <ImportPreviewTable rows={preview.rows} />

      {preview.errorCount === 0 && preview.validCount > 0 ? (
        <ImportCommitForm
          commitAction={commitAction}
          key={preview.id}
          onSuccess={onCommitSuccess}
          preview={preview}
        />
      ) : null}

      <div className="import-action-row">
        <button className="secondary-button" onClick={onBack} type="button">
          <ArrowLeft aria-hidden size={16} />
          Back to mapping
        </button>
        {preview.errorCount > 0 ? (
          <button className="secondary-button" onClick={onCorrect} type="button">
            Upload a corrected file
          </button>
        ) : null}
      </div>
    </section>
  );
}
