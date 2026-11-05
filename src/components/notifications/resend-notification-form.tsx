"use client";

import { useActionState } from "react";

import {
  resendNotificationFormAction,
  type RetryNotificationState,
} from "@/app/notifications/actions";

const initialState: RetryNotificationState = { ok: null, message: "" };

export function ResendNotificationForm({ deliveryId }: { deliveryId: string }) {
  const [state, action, pending] = useActionState(resendNotificationFormAction, initialState);
  return (
    <form
      action={action}
      className="notification-retry-form"
      onSubmit={(event) => {
        if (!window.confirm("Resend this notification? This will create another email submission."))
          event.preventDefault();
      }}
    >
      <input name="deliveryId" type="hidden" value={deliveryId} />
      <button className="text-button" disabled={pending} type="submit">
        {pending ? "Queuing…" : "Resend Notification"}
      </button>
      {state.ok === true ? <span role="status">{state.message}</span> : null}
      {state.ok === false ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}
