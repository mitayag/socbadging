"use client";

import { CheckCircle2 } from "lucide-react";
import { useId } from "react";

import type { ImportCommitState } from "./import-types";

export function ImportCompleteStep({
  file,
  onReset,
  result,
}: {
  file: File | null;
  onReset: () => void;
  result: ImportCommitState;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="import-step-panel import-complete-panel">
      <div className="import-complete-icon">
        <CheckCircle2 aria-hidden size={32} />
      </div>
      <div className="import-step-heading">
        <div>
          <h3 id={headingId}>Roster imported successfully</h3>
          <p>{result.message}</p>
        </div>
        <span className="import-step-count">Step 4 of 4</span>
      </div>
      <dl className="import-complete-facts">
        <div>
          <dt>Students imported</dt>
          <dd>{result.importedCount}</dd>
        </div>
        <div>
          <dt>Source file</dt>
          <dd>{file?.name ?? "Roster file"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>Roster updated</dd>
        </div>
      </dl>
      <div className="import-action-row">
        <a className="primary-button import-primary-action" href="#class-roster">
          View updated roster
        </a>
        <button className="secondary-button" onClick={onReset} type="button">
          Import another file
        </button>
      </div>
    </section>
  );
}
