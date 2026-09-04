"use client";

import { useActionState } from "react";

import {
  retryNotificationFormAction,
  type RetryNotificationState,
} from "@/app/notifications/actions";

const initialState: RetryNotificationState = { ok: null, message: "" };

export function RetryNotificationForm({ deliveryId }: { deliveryId: string }) {
  const [state, action, pending] = useActionState(retryNotificationFormAction, initialState);
  return (
    <form action={action} className="notification-retry-form">
      <input name="deliveryId" type="hidden" value={deliveryId} />
      <button className="text-button" disabled={pending} type="submit">
        {pending ? "Queuing…" : "Retry Notification"}
      </button>
      {state.ok === true ? <span role="status">{state.message}</span> : null}
      {state.ok === false ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}
