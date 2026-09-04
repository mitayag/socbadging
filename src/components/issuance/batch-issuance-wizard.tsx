"use client";

import { useActionState, useRef, useState } from "react";

import type {
  BatchCommitActionState,
  BatchPreviewSummary,
  BatchRowDisposition,
} from "@/modules/issuance/batch-types";

type Inspection = { headers: string[]; rows: string[][] };

function titleDisposition(value: BatchRowDisposition) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function CommitButton({
  count,
  enabled,
  pending,
}: {
  count: number;
  enabled: boolean;
  pending: boolean;
}) {
  return (
    <>
      <button className="primary-button batch-commit-button" disabled={!enabled || pending}>
        {pending
          ? "Issuing Credentials…"
          : `Issue ${count} ${count === 1 ? "Credential" : "Credentials"}`}
      </button>
      {pending ? (
        <span className="sr-only" role="status">
          Issuing Credentials
        </span>
      ) : null}
    </>
  );
}

const initialCommitState: BatchCommitActionState = { status: "idle", message: "" };

function BatchCommitForm({
  commitAction,
  preview,
}: {
  commitAction: (
    previousState: BatchCommitActionState,
    formData: FormData,
  ) => Promise<BatchCommitActionState>;
  preview: BatchPreviewSummary;
}) {
  const [state, formAction, pending] = useActionState(commitAction, initialCommitState);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="batch-confirmation">
      <input type="hidden" name="batchId" value={preview.id} />
      <label className="check-field">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Issue Only {preview.readyCount} Ready{" "}
        {preview.readyCount === 1 ? "Credential" : "Credentials"}
      </label>
      {preview.invalidCount > 0 || preview.alreadyIssuedCount > 0 ? (
        <p>
          Only the reviewed ready rows will be issued. Other rows remain excluded in the report.
        </p>
      ) : null}
      {state.status === "signing-error" ? (
        <p aria-live="polite" className="form-error" role="status">
          {state.message}
        </p>
      ) : null}
      <CommitButton count={preview.readyCount} enabled={confirmed} pending={pending} />
    </form>
  );
}

export function BatchIssuanceWizard({
  classId,
  badgeOptions,
  commitAction,
}: {
  classId: string;
  badgeOptions: Array<{ id: string; name: string }>;
  commitAction: (
    previousState: BatchCommitActionState,
    formData: FormData,
  ) => Promise<BatchCommitActionState>;
}) {
  const [badgeTemplateId, setBadgeTemplateId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [studentNumber, setStudentNumber] = useState("");
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<BatchPreviewSummary | null>(null);
  const [pending, setPending] = useState<"inspect" | "preview" | null>(null);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  function resetReviewedState() {
    requestVersion.current += 1;
    setInspection(null);
    setPreview(null);
    setStudentNumber("");
    setEmail("");
    setError("");
    setPending(null);
  }

  async function inspectFile() {
    if (!file || !badgeTemplateId) return;
    setPending("inspect");
    setError("");
    const version = ++requestVersion.current;
    try {
      const form = new FormData();
      form.set("badgeTemplateId", badgeTemplateId);
      form.set("file", file);
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/issued/batch/inspect`,
        {
          method: "POST",
          body: form,
        },
      );
      const result = (await response.json()) as Inspection & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to inspect batch file");
      if (requestVersion.current !== version) return;
      setInspection(result);
      const normalized = result.headers.map((header) =>
        header.toLowerCase().replaceAll(/[^a-z0-9]/g, ""),
      );
      const numberIndex = normalized.findIndex(
        (header) => header === "studentnumber" || header === "studentid",
      );
      setStudentNumber(numberIndex >= 0 ? String(numberIndex) : "");
      setEmail("");
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(caught instanceof Error ? caught.message : "Unable to inspect batch file");
      }
    } finally {
      if (requestVersion.current === version) setPending(null);
    }
  }

  async function validatePreview() {
    if (!inspection || !file || studentNumber === "") return;
    setPending("preview");
    setError("");
    const version = ++requestVersion.current;
    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/issued/batch/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceFilename: file.name,
            badgeTemplateId,
            mapping: {
              studentNumber: Number(studentNumber),
              email: email === "" ? null : Number(email),
            },
            rows: inspection.rows,
          }),
        },
      );
      const result = (await response.json()) as BatchPreviewSummary & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to create batch preview");
      if (requestVersion.current !== version) return;
      setPreview(result);
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(caught instanceof Error ? caught.message : "Unable to create batch preview");
      }
    } finally {
      if (requestVersion.current === version) setPending(null);
    }
  }

  return (
    <section className="batch-panel" aria-labelledby="batch-issue-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Validated Upload</span>
          <h2 id="batch-issue-title">Batch Issue</h2>
          <p>Review every row before issuing the selected badge to ready recipients.</p>
        </div>
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="template-downloads">
        <p>Use an instructional template or upload an existing CSV/XLSX file.</p>
        <div className="template-download-actions">
          <a
            className="secondary-button export-link"
            href={`/api/classes/${encodeURIComponent(classId)}/issued/batch/template.csv`}
          >
            Download CSV Template
          </a>
          <a
            className="secondary-button export-link"
            href={`/api/classes/${encodeURIComponent(classId)}/issued/batch/template.xlsx`}
          >
            Download XLSX Template
          </a>
        </div>
      </div>
      <div className="batch-choose-grid">
        <label className="field">
          Badge Template
          <select
            value={badgeTemplateId}
            onChange={(event) => {
              setBadgeTemplateId(event.target.value);
              resetReviewedState();
            }}
          >
            <option value="">Select Badge Template</option>
            {badgeOptions.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Student Batch File
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetReviewedState();
            }}
          />
        </label>
      </div>
      <button
        className="secondary-button"
        type="button"
        disabled={!file || !badgeTemplateId || pending !== null}
        onClick={inspectFile}
      >
        Inspect File
      </button>
      {pending === "inspect" ? (
        <p className="pending-status" role="status">
          Inspecting File
        </p>
      ) : null}

      {inspection && !preview ? (
        <div className="batch-step">
          <h3>Map Columns</h3>
          <div className="form-grid">
            <label className="field">
              Student Number Column
              <select
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
              >
                <option value="">Select Column</option>
                {inspection.headers.map((header, index) => (
                  <option key={`${header}-${index}`} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Email Column
              <select value={email} onChange={(event) => setEmail(event.target.value)}>
                <option value="">Do Not Map</option>
                {inspection.headers.map((header, index) => (
                  <option key={`${header}-${index}`} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="primary-button batch-action-button"
            type="button"
            disabled={studentNumber === "" || pending !== null}
            onClick={validatePreview}
          >
            Validate Preview
          </button>
          {pending === "preview" ? (
            <p className="pending-status" role="status">
              Validating Preview
            </p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <div className="batch-step">
          <h3>Validation Preview</h3>
          <div className="batch-counts" aria-label="Batch Preview Counts">
            <strong className="status-ready">{preview.readyCount} Ready</strong>
            <strong>{preview.alreadyIssuedCount} Already Issued</strong>
            <strong className="status-invalid">{preview.invalidCount} Invalid</strong>
            <span>{preview.totalRows} Total</span>
          </div>
          <a
            className="secondary-button export-link"
            href={`/api/issuance-batches/${encodeURIComponent(preview.id)}/report`}
          >
            Download Validation Report
          </a>
          <div className="batch-row-list" role="table" aria-label="Batch Validation Rows">
            <div className="batch-row batch-table-header" role="row">
              <span role="columnheader">Row</span>
              <span role="columnheader">Student Number</span>
              <span role="columnheader">Email Supplied</span>
              <span role="columnheader">Disposition</span>
              <span role="columnheader">Message</span>
            </div>
            {preview.rows.map((row) => (
              <div className="batch-row" role="row" key={row.rowNumber}>
                <span data-label="Row" role="cell">
                  {row.rowNumber}
                </span>
                <span data-label="Student Number" role="cell">
                  {row.studentNumber || "—"}
                </span>
                <span data-label="Email Supplied" role="cell">
                  {row.emailSupplied || "—"}
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
              </div>
            ))}
          </div>
          {preview.readyCount === 0 ? (
            <div className="batch-confirmation">
              <p className="auth-error">No ready rows are available to issue.</p>
              <button className="primary-button batch-commit-button" disabled type="button">
                Issue 0 Credentials
              </button>
            </div>
          ) : (
            <BatchCommitForm key={preview.id} commitAction={commitAction} preview={preview} />
          )}
        </div>
      ) : null}
    </section>
  );
}
