"use client";

import { AlertCircle, ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useId } from "react";

import { importFields, mappingStatus } from "./import-fields";
import { ImportTemplateDownloads } from "./import-template-downloads";
import type { ImportField, ImportInspection, ImportMapping } from "./import-types";

export function ImportMappingStep({
  classId,
  file,
  inspection,
  mapping,
  pending,
  onBack,
  onMappingChange,
  onPreview,
}: {
  classId: string;
  file: File | null;
  inspection: ImportInspection;
  mapping: ImportMapping;
  pending: "inspect" | "preview" | null;
  onBack: () => void;
  onMappingChange: (field: ImportField, value: string) => void;
  onPreview: () => void;
}) {
  const headingId = useId();
  const status = mappingStatus(mapping);

  return (
    <section aria-labelledby={headingId} className="import-step-panel">
      <div className="import-step-heading">
        <div>
          <h3 id={headingId}>Match student fields to columns</h3>
          <p>
            We found {inspection.rows.length}{" "}
            {inspection.rows.length === 1 ? "student row" : "student rows"} and{" "}
            {inspection.headers.length} columns. Each required field must use a different column.
          </p>
        </div>
        <span className="import-step-count">Step 2 of 4</span>
      </div>

      <div className="import-mapping-grid">
        {importFields.map((field) => (
          <label className="field" key={field.key}>
            {field.label}
            <select
              aria-label={field.label}
              aria-required="true"
              onChange={(event) => onMappingChange(field.key, event.target.value)}
              value={mapping[field.key]}
            >
              <option value="">Select a column</option>
              {inspection.headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>
                  {header || `Column ${index + 1}`}
                </option>
              ))}
            </select>
            <small>{field.hint}</small>
          </label>
        ))}
      </div>

      {status.duplicate ? (
        <p className="auth-error import-inline-alert" role="alert">
          <AlertCircle aria-hidden size={17} />
          Each student field must use a different column.
        </p>
      ) : !status.complete ? (
        <p className="import-mapping-hint">Map all four required fields to continue.</p>
      ) : null}

      <div className="import-file-summary">
        <FileSpreadsheet aria-hidden size={18} />
        <span>
          <strong>{file?.name}</strong>
          <small>{inspection.rows.length} data rows detected</small>
        </span>
      </div>

      <ImportTemplateDownloads classId={classId} />

      <div className="import-action-row import-action-row-between">
        <button className="secondary-button" onClick={onBack} type="button">
          <ArrowLeft aria-hidden size={16} />
          Back to upload
        </button>
        <button
          className="primary-button import-primary-action"
          disabled={!status.ready || pending !== null}
          onClick={onPreview}
          type="button"
        >
          {pending === "preview" ? "Validating rows…" : "Review students"}
        </button>
      </div>
      {pending === "preview" ? (
        <p className="pending-status" role="status">
          Checking each row against the roster
        </p>
      ) : null}
    </section>
  );
}
