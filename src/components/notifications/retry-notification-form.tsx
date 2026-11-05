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
    <form
      action={action}
      className="notification-retry-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Retry this notification? This will create a new delivery attempt and may send another email.",
          )
        )
          event.preventDefault();
      }}
    >
      <input name="deliveryId" type="hidden" value={deliveryId} />
      <button className="text-button" disabled={pending} type="submit">
        {pending ? "Queuing…" : "Retry Notification"}
      </button>
      {state.ok === true ? <span role="status">{state.message}</span> : null}
      {state.ok === false ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}
