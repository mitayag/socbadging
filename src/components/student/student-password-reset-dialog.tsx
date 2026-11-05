"use client";

import { KeyRound, X } from "lucide-react";
import { useRef, useState, type MouseEvent } from "react";

type ResetAction = (formData: FormData) => void | Promise<void>;

function maskedEmail(email: string) {
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return "***";
  return `${email[0]}***${email.slice(separator)}`;
}

function QueryFields({ query }: { query: Record<string, string> }) {
  return (
    <>
      {Object.entries(query).map(([key, value]) =>
        value ? <input key={key} name={key} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

export function StudentPasswordResetDialog({
  studentId,
  studentName,
  email,
  classId,
  canReset,
  query,
  actions,
}: {
  studentId: string;
  studentName: string;
  email: string;
  classId?: string;
  canReset: boolean;
  query: Record<string, string>;
  actions: {
    direct: ResetAction;
    email: ResetAction;
  };
}) {
  const mainDialog = useRef<HTMLDialogElement>(null);
  const directConfirmDialog = useRef<HTMLDialogElement>(null);
  const emailConfirmDialog = useRef<HTMLDialogElement>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [pendingDirect, setPendingDirect] = useState<{
    currentPassword: string;
    newPassword: string;
  } | null>(null);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>, close: () => void) {
    if (event.target === event.currentTarget) close();
  }

  function reviewDirectReset(form: HTMLFormElement) {
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (!currentPassword) {
      setError("Enter your current password to confirm this action.");
      return;
    }
    if (newPassword.length < 14) {
      setError("Use a new password between 14 and 200 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setError("");
    setPendingDirect({ currentPassword, newPassword });
    directConfirmDialog.current?.showModal();
  }

  return (
    <>
      <button
        aria-label={`Reset password for ${studentName}`}
        className="icon-button"
        disabled={!canReset}
        onClick={() => mainDialog.current?.showModal()}
        title={
          canReset
            ? "Reset student password"
            : "Reactivate the portal account before resetting the password"
        }
        type="button"
      >
        <KeyRound aria-hidden="true" size={16} />
      </button>

      <dialog
        aria-labelledby={`reset-password-${studentId}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => mainDialog.current?.close())}
        ref={mainDialog}
      >
        <form className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Account Security</span>
              <h2 id={`reset-password-${studentId}`}>Reset password for {studentName}</h2>
            </div>
            <button
              aria-label="Close reset password dialog"
              className="icon-button"
              onClick={() => mainDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>

          <section className="reset-option">
            <h3>Set a new password</h3>
            <p className="muted">
              The student will be signed out and must choose a new password at next sign-in.
            </p>
            <label className="field">
              Your Current Password
              <input
                autoComplete="current-password"
                name="currentPassword"
                required
                type={showPasswords ? "text" : "password"}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                New Password
                <input
                  autoComplete="new-password"
                  maxLength={200}
                  minLength={14}
                  name="newPassword"
                  required
                  type={showPasswords ? "text" : "password"}
                />
              </label>
              <label className="field">
                Confirm New Password
                <input
                  autoComplete="new-password"
                  maxLength={200}
                  minLength={14}
                  name="confirmPassword"
                  required
                  type={showPasswords ? "text" : "password"}
                />
              </label>
            </div>
            <div className="inline-actions">
              <button
                aria-pressed={showPasswords}
                className="text-button"
                onClick={() => setShowPasswords((value) => !value)}
                type="button"
              >
                {showPasswords ? "Hide passwords" : "Show passwords"}
              </button>
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="primary-button"
              onClick={(event) => {
                const form = event.currentTarget.closest("form");
                if (form) reviewDirectReset(form);
              }}
              type="button"
            >
              Reset Password
            </button>
          </section>

          <section className="reset-option">
            <h3>Email a reset link</h3>
            <p className="muted">
              Send a single-use reset link to <strong>{maskedEmail(email)}</strong>. The link
              expires in 30 minutes. Delivery is not confirmed until the mail provider accepts the
              message.
            </p>
            <button
              className="secondary-button"
              onClick={() => emailConfirmDialog.current?.showModal()}
              type="button"
            >
              Send Reset Link
            </button>
          </section>
        </form>
      </dialog>

      <dialog
        aria-labelledby={`confirm-direct-reset-${studentId}`}
        className="faculty-dialog"
        onClick={(event) =>
          closeOnBackdrop(event, () => {
            directConfirmDialog.current?.close();
            setPendingDirect(null);
          })
        }
        onClose={() => setPendingDirect(null)}
        ref={directConfirmDialog}
      >
        <form action={actions.direct} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Confirm Sensitive Action</span>
              <h2 id={`confirm-direct-reset-${studentId}`}>Confirm password reset</h2>
            </div>
            <button
              aria-label="Close confirmation dialog"
              className="icon-button"
              onClick={() => {
                directConfirmDialog.current?.close();
                setPendingDirect(null);
              }}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <p className="muted">
            Reset the password for {studentName}? Existing sessions and reset links will be
            invalidated, and the student must choose a new password at next sign-in.
          </p>
          <input name="studentId" type="hidden" value={studentId} />
          <input name="classId" type="hidden" value={classId ?? ""} />
          <QueryFields query={query} />
          <input
            name="currentPassword"
            type="hidden"
            value={pendingDirect?.currentPassword ?? ""}
          />
          <input name="newPassword" type="hidden" value={pendingDirect?.newPassword ?? ""} />
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => {
                directConfirmDialog.current?.close();
                setPendingDirect(null);
              }}
              type="button"
            >
              Cancel
            </button>
            <button className="danger-button">Confirm Password Reset</button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={`confirm-email-reset-${studentId}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => emailConfirmDialog.current?.close())}
        ref={emailConfirmDialog}
      >
        <form action={actions.email} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Email Reset Link</span>
              <h2 id={`confirm-email-reset-${studentId}`}>Send a reset link?</h2>
            </div>
            <button
              aria-label="Close email confirmation dialog"
              className="icon-button"
              onClick={() => emailConfirmDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <p className="muted">
            Send a single-use, 30-minute password reset link to {maskedEmail(email)}? Previous
            outstanding reset links will be invalidated.
          </p>
          <input name="studentId" type="hidden" value={studentId} />
          <input name="classId" type="hidden" value={classId ?? ""} />
          <QueryFields query={query} />
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => emailConfirmDialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button className="primary-button">Send Reset Link</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
