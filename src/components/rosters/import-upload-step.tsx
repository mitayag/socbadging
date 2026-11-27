"use client";

import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { formatFileSize, validateFile } from "./import-file";
import { ImportTemplateDownloads } from "./import-template-downloads";

export function ImportUploadStep({
  classId,
  file,
  pending,
  onFileSelected,
  onInspect,
  onReject,
  onRemove,
}: {
  classId: string;
  file: File | null;
  pending: "inspect" | "preview" | null;
  onFileSelected: (file: File) => void;
  onInspect: () => void;
  onReject: (message: string) => void;
  onRemove: () => void;
}) {
  const headingId = useId();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function selectFile(nextFile: File | null) {
    if (!nextFile) return;
    const validationError = validateFile(nextFile);
    if (validationError) {
      onReject(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    onFileSelected(nextFile);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function removeFile() {
    onRemove();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <section aria-labelledby={headingId} className="import-step-panel">
      <div className="import-step-heading">
        <div>
          <h3 id={headingId}>Choose your roster file</h3>
          <p>Use a CSV or XLSX file with one row per student.</p>
        </div>
        <span className="import-step-count">Step 1 of 4</span>
      </div>

      <label
        className={`import-dropzone${dragActive ? " drag-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <UploadCloud aria-hidden size={32} />
        <strong>{file ? "Choose a different file" : "Drop your roster file here"}</strong>
        <span>{file ? "Replace the selected file" : "or browse files from your computer"}</span>
        <small>CSV or XLSX · up to 2 MiB</small>
        <input
          accept=".csv,.xlsx"
          aria-label="Roster CSV or XLSX"
          className="sr-only"
          id={fileInputId}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          ref={fileInputRef}
          type="file"
        />
      </label>

      {file ? (
        <div className="import-file-card">
          <FileSpreadsheet aria-hidden size={24} />
          <span>
            <strong>{file.name}</strong>
            <small>{formatFileSize(file.size)}</small>
          </span>
          <button
            aria-label={`Remove ${file.name}`}
            className="import-icon-button"
            onClick={removeFile}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
      ) : null}

      <ImportTemplateDownloads classId={classId} />

      <div className="import-action-row">
        <button
          className="primary-button import-primary-action"
          disabled={!file || pending !== null}
          onClick={onInspect}
          type="button"
        >
          {pending === "inspect" ? "Inspecting file…" : "Inspect file"}
        </button>
        {pending === "inspect" ? (
          <span className="pending-status" role="status">
            Reading headers and rows
          </span>
        ) : null}
      </div>
    </section>
  );
}
