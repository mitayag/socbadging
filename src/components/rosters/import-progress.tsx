import { Check } from "lucide-react";

import type { ImportStep } from "./import-types";

const steps: Array<{ number: ImportStep; label: string; description: string }> = [
  { number: 1, label: "Upload", description: "Choose a CSV or XLSX file" },
  { number: 2, label: "Map columns", description: "Match the required fields" },
  { number: 3, label: "Review", description: "Check every student row" },
  { number: 4, label: "Complete", description: "Confirm the import" },
];

export function ImportProgress({ step }: { step: ImportStep }) {
  return (
    <ol aria-label="Import progress" className="import-progress">
      {steps.map((item) => {
        const status =
          step === item.number ? "current" : step > item.number ? "complete" : "upcoming";
        return (
          <li
            aria-current={status === "current" ? "step" : undefined}
            className={`import-progress-step ${status}`}
            key={item.number}
          >
            <span aria-hidden className="import-progress-marker">
              {status === "complete" ? <Check size={16} /> : item.number}
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
