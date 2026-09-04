"use client";
import { useState } from "react";
type Inspect = { headers: string[]; rows: string[][] };
type Preview = {
  id: string;
  validCount: number;
  errorCount: number;
  rows: Array<{
    rowNumber: number;
    studentNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    errors: string[];
  }>;
};
export function ImportWizard({
  classId,
  commitAction,
}: {
  classId: string;
  commitAction: (form: FormData) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Inspect | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [mapping, setMapping] = useState({ studentNumber: 0, firstName: 1, lastName: 2, email: 3 });
  async function inspect() {
    if (!file) return;
    setError("");
    const f = new FormData();
    f.set("file", file);
    const r = await fetch(`/api/classes/${classId}/roster/import/inspect`, {
      method: "POST",
      body: f,
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setData(j);
    const find = (names: string[]) => {
      const index = j.headers.findIndex((h: string) =>
        names.includes(h.toLowerCase().replaceAll(" ", "")),
      );
      return Math.max(0, index);
    };
    setMapping({
      studentNumber: find(["studentnumber", "studentid"]),
      firstName: find(["firstname"]),
      lastName: find(["lastname"]),
      email: find(["email"]),
    });
  }
  async function makePreview() {
    if (!data || !file) return;
    const r = await fetch(`/api/classes/${classId}/roster/import/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, rows: data.rows, mapping }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setPreview(j);
  }
  return (
    <div className="import-wizard">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="template-downloads">
        <p>
          Start with a template, replace the example row with your students, then upload the
          completed file.
        </p>
        <div className="template-download-actions">
          <a
            className="secondary-button export-link"
            href={`/api/classes/${classId}/roster/import/template.csv`}
          >
            Download CSV Template
          </a>
          <a
            className="secondary-button export-link"
            href={`/api/classes/${classId}/roster/import/template.xlsx`}
          >
            Download XLSX Template
          </a>
        </div>
      </div>
      <div className="inline-actions">
        <input
          aria-label="Roster CSV or XLSX"
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setData(null);
            setPreview(null);
          }}
        />
        <button type="button" className="secondary-button" onClick={inspect} disabled={!file}>
          Upload and Map
        </button>
      </div>
      {data && !preview && (
        <div>
          <h3>Map Columns</h3>
          <div className="form-grid">
            {Object.entries(mapping).map(([key, value]) => (
              <label className="field" key={key}>
                {key}
                <select
                  value={value}
                  onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}
                >
                  {data.headers.map((h, i) => (
                    <option value={i} key={`${h}-${i}`}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button type="button" className="primary-button form-submit" onClick={makePreview}>
            Validate Preview
          </button>
        </div>
      )}
      {preview && (
        <div>
          <h3>Validation Preview</h3>
          <p>
            <strong>{preview.validCount}</strong> valid · <strong>{preview.errorCount}</strong> with
            errors
          </p>
          <div className="preview-table">
            {preview.rows.slice(0, 50).map((r) => (
              <div className={r.errors.length ? "preview-error" : ""} key={r.rowNumber}>
                Row {r.rowNumber}: {r.studentNumber} · {r.firstName} {r.lastName} · {r.email}
                {r.errors.length ? <strong>{r.errors.join("; ")}</strong> : <span>Ready</span>}
              </div>
            ))}
          </div>
          {preview.errorCount === 0 ? (
            <form action={commitAction}>
              <input type="hidden" name="classId" value={classId} />
              <input type="hidden" name="previewId" value={preview.id} />
              <button className="primary-button form-submit">
                Commit {preview.validCount} Students
              </button>
            </form>
          ) : (
            <p className="auth-error">
              Correct the source file and preview again. Imports with errors cannot be committed.
            </p>
          )}
          {preview.errorCount > 0 && (
            <a
              className="secondary-button export-link"
              href={`/api/roster-imports/${preview.id}/errors`}
            >
              Download Error Report
            </a>
          )}
        </div>
      )}
    </div>
  );
}
