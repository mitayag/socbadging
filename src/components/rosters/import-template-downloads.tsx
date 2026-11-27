import { Download } from "lucide-react";

export function ImportTemplateDownloads({ classId }: { classId: string }) {
  return (
    <div className="import-template-panel">
      <div>
        <strong>Need a starting point?</strong>
        <p>Download a template, replace the example row, then upload the completed file.</p>
      </div>
      <div className="template-download-actions">
        <a
          className="secondary-button export-link"
          href={`/api/classes/${encodeURIComponent(classId)}/roster/import/template.csv`}
        >
          <Download aria-hidden size={16} />
          Download CSV Template
        </a>
        <a
          className="secondary-button export-link"
          href={`/api/classes/${encodeURIComponent(classId)}/roster/import/template.xlsx`}
        >
          <Download aria-hidden size={16} />
          Download XLSX Template
        </a>
      </div>
    </div>
  );
}
