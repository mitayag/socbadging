"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";

export type ConfirmDialogButtonProps = {
  triggerLabel: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  danger?: boolean;
};

export function ConfirmDialogButton({
  triggerLabel,
  title,
  description,
  confirmLabel,
  action,
  fields = {},
  danger = true,
}: ConfirmDialogButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) dialog.current?.close();
  }

  return (
    <>
      <button
        className={danger ? "danger-button" : "secondary-button"}
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        {triggerLabel}
      </button>
      <dialog
        aria-labelledby="confirm-dialog-title"
        className="faculty-dialog"
        onClick={closeOnBackdrop}
        ref={dialog}
      >
        <form action={action} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Confirm</span>
              <h2 id="confirm-dialog-title">{title}</h2>
            </div>
            <button
              aria-label="Close confirmation dialog"
              className="icon-button"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              ×
            </button>
          </div>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <p className="muted">{description}</p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button className={danger ? "danger-button" : "primary-button"}>{confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
