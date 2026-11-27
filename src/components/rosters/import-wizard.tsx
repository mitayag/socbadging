"use client";

import { AlertCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ImportCompleteStep } from "./import-complete-step";
import { autoMap } from "./import-file";
import { emptyMapping, importFields, mappingStatus } from "./import-fields";
import { ImportMappingStep } from "./import-mapping-step";
import { ImportProgress } from "./import-progress";
import { ImportReviewStep } from "./import-review-step";
import type {
  ImportCommitState,
  ImportInspection,
  ImportMapping,
  ImportPreview,
  ImportStep,
} from "./import-types";
import { ImportUploadStep } from "./import-upload-step";

const stepHeadings: Record<ImportStep, string> = {
  1: "Upload roster file",
  2: "Map columns",
  3: "Review students",
  4: "Import complete",
};

export function ImportWizard({
  classId,
  commitAction,
}: {
  classId: string;
  commitAction: (
    previousState: ImportCommitState,
    formData: FormData,
  ) => Promise<ImportCommitState>;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef<ImportStep>(1);
  const requestVersion = useRef(0);
  const [step, setStep] = useState<ImportStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"inspect" | "preview" | null>(null);

  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus();
      previousStep.current = step;
    }
  }, [step]);

  const resetFile = useCallback(() => {
    requestVersion.current += 1;
    setFile(null);
    setInspection(null);
    setMapping(emptyMapping);
    setPreview(null);
    setCommitResult(null);
    setError("");
    setPending(null);
    setStep(1);
  }, []);

  function chooseFile(nextFile: File) {
    requestVersion.current += 1;
    setFile(nextFile);
    setInspection(null);
    setMapping(emptyMapping);
    setPreview(null);
    setCommitResult(null);
    setError("");
    setPending(null);
    setStep(1);
  }

  function goBackToUpload() {
    requestVersion.current += 1;
    setInspection(null);
    setPreview(null);
    setPending(null);
    setError("");
    setStep(1);
  }

  function goBackToMapping() {
    requestVersion.current += 1;
    setPreview(null);
    setPending(null);
    setError("");
    setStep(2);
  }

  async function inspectFile() {
    if (!file || pending) return;
    setPending("inspect");
    setError("");
    const version = ++requestVersion.current;
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/roster/import/inspect`,
        { method: "POST", body: form },
      );
      const result = (await response.json()) as ImportInspection & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to inspect the roster file.");
      if (!Array.isArray(result.headers) || !Array.isArray(result.rows)) {
        throw new Error("The roster file could not be read.");
      }
      if (!result.rows.length)
        throw new Error("The roster file does not contain any student rows.");
      if (requestVersion.current !== version) return;
      setInspection(result);
      setMapping((current) => {
        const canPreserve = importFields.every((field) => {
          const value = current[field.key];
          return value !== "" && Number(value) < result.headers.length;
        });
        return canPreserve ? current : autoMap(result.headers);
      });
      setStep(2);
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(caught instanceof Error ? caught.message : "Unable to inspect the roster file.");
      }
    } finally {
      if (requestVersion.current === version) setPending(null);
    }
  }

  async function createPreview() {
    if (!inspection || !file || pending || !mappingStatus(mapping).ready) return;
    setPending("preview");
    setError("");
    const version = ++requestVersion.current;
    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/roster/import/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            rows: inspection.rows,
            mapping: {
              studentNumber: Number(mapping.studentNumber),
              firstName: Number(mapping.firstName),
              lastName: Number(mapping.lastName),
              email: Number(mapping.email),
            },
          }),
        },
      );
      const result = (await response.json()) as ImportPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to validate the roster file.");
      if (!Array.isArray(result.rows)) throw new Error("The validation preview could not be read.");
      if (requestVersion.current !== version) return;
      setPreview(result);
      setStep(3);
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(caught instanceof Error ? caught.message : "Unable to validate the roster file.");
      }
    } finally {
      if (requestVersion.current === version) setPending(null);
    }
  }

  const handleCommitSuccess = useCallback((state: ImportCommitState) => {
    setCommitResult(state);
    setStep(4);
  }, []);

  return (
    <div className="student-import">
      <div className="import-intro">
        <div>
          <span className="eyebrow">Guided roster import</span>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>
            {stepHeadings[step]}
          </h2>
          <p>
            Import students in four steps. Nothing is added to the roster until you review and
            confirm the validated rows.
          </p>
        </div>
        <span className="import-security-note">
          <ShieldCheck aria-hidden size={17} />
          Server-validated
        </span>
      </div>

      <ImportProgress step={step} />

      {error ? (
        <p className="auth-error import-alert" role="alert">
          <AlertCircle aria-hidden size={18} />
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <ImportUploadStep
          classId={classId}
          file={file}
          onFileSelected={chooseFile}
          onInspect={inspectFile}
          onReject={setError}
          onRemove={resetFile}
          pending={pending}
        />
      ) : null}

      {step === 2 && inspection ? (
        <ImportMappingStep
          classId={classId}
          file={file}
          inspection={inspection}
          mapping={mapping}
          onBack={goBackToUpload}
          onMappingChange={(field, value) =>
            setMapping((current) => ({ ...current, [field]: value }))
          }
          onPreview={createPreview}
          pending={pending}
        />
      ) : null}

      {step === 3 && preview ? (
        <ImportReviewStep
          commitAction={commitAction}
          onBack={goBackToMapping}
          onCommitSuccess={handleCommitSuccess}
          onCorrect={resetFile}
          preview={preview}
        />
      ) : null}

      {step === 4 && commitResult ? (
        <ImportCompleteStep file={file} onReset={resetFile} result={commitResult} />
      ) : null}
    </div>
  );
}
