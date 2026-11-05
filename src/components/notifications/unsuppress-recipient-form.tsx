"use client";

import { useActionState } from "react";

import {
  unsuppressRecipientAction,
  type RetryNotificationState,
} from "@/app/notifications/actions";

const initialState: RetryNotificationState = { ok: null, message: "" };

export function UnsuppressRecipientForm({
  normalizedEmail,
  reason,
}: {
  normalizedEmail: string;
  reason: string;
}) {
  const [state, action, pending] = useActionState(unsuppressRecipientAction, initialState);
  return (
    <form
      action={action}
      className="notification-retry-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Clear this recipient suppression? This sends future email to the recipient again and is audit logged.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="normalizedEmail" type="hidden" value={normalizedEmail} />
      <label>
        Clearance reason
        <input name="reason" required minLength={5} maxLength={1000} />
      </label>
      {reason === "COMPLAINT" ? (
        <label>
          <input name="acknowledgeComplaint" type="checkbox" />I acknowledge this recipient filed a
          spam complaint
        </label>
      ) : null}
      <button className="text-button" disabled={pending} type="submit">
        {pending ? "Clearing…" : "Clear Suppression"}
      </button>
      {state.ok === true ? <span role="status">{state.message}</span> : null}
      {state.ok === false ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}
