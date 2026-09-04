import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/app/notifications/actions", () => ({ retryNotificationFormAction: state.action }));

import { RetryNotificationForm } from "./retry-notification-form";

describe("RetryNotificationForm", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.resetAllMocks();
    state.action.mockResolvedValue({ ok: true, message: "Notification queued for retry." });
  });

  it("shows accessible success feedback", async () => {
    const user = userEvent.setup();
    render(<RetryNotificationForm deliveryId="delivery-1" />);
    await user.click(screen.getByRole("button", { name: "Retry Notification" }));
    expect(await screen.findByRole("status")).toHaveTextContent("queued for retry");
  });

  it("disables submission while pending", async () => {
    let resolve!: (value: { ok: true; message: string }) => void;
    state.action.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<RetryNotificationForm deliveryId="delivery-1" />);
    const click = user.click(screen.getByRole("button", { name: "Retry Notification" }));
    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());
    resolve({ ok: true, message: "Notification queued for retry." });
    await click;
  });
});
