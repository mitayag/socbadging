import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotificationList } from "./notification-list";

describe("NotificationList", () => {
  it("renders a semantic privacy-safe delivery table and retry capability", () => {
    render(
      <NotificationList
        items={[
          {
            id: "delivery-1",
            type: "BADGE_ISSUED",
            status: "FAILED",
            maskedRecipientEmail: "s***@example.edu",
            badgeName: "Secure Systems",
            attemptCount: 2,
            lastErrorCategory: "TRANSIENT",
            safeDiagnosticCode: "ETIMEDOUT",
            createdAt: "2026-08-23T00:00:00Z",
            sentAt: null,
            canRetry: true,
          },
        ]}
      />,
    );
    expect(screen.getByRole("table", { name: "Notification Deliveries" })).toBeInTheDocument();
    expect(screen.getByText("s***@example.edu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Notification" })).toBeInTheDocument();
  });
});
