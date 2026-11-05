"use client";

import { useActionState } from "react";

import {
  resendIssuanceNotificationAction,
  type ResendIssuanceState,
} from "@/app/issued/[issuanceId]/resend-actions";

const initialState: ResendIssuanceState = { ok: null, message: "" };

export function ResendIssuanceNotificationForm({ issuanceId }: { issuanceId: string }) {
  const [state, action, pending] = useActionState(resendIssuanceNotificationAction, initialState);
  return (
    <form action={action} className="panel credential-panel">
      <h2>Email notification</h2>
      <p>Queue the issuance email again. The recipient and credential snapshot are unchanged.</p>
      <input name="issuanceId" type="hidden" value={issuanceId} />
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "Queuing…" : "Resend Notification"}
      </button>
      {state.ok === true ? <p role="status">{state.message}</p> : null}
      {state.ok === false ? (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
