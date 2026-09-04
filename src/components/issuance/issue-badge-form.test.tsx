import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueBadgeForm } from "./issue-badge-form";
import { IssueBadgeSection } from "./issue-badge-section";

const issueAction = vi.fn();
const signerUnavailableMessage =
  "Credential signing is temporarily unavailable. No badge was issued. Try again.";

function options() {
  return {
    badgeOptions: [{ id: "badge-1", name: "Secure Systems", imagePath: "badges/secure.png" }],
    classId: "class-1",
    studentOptions: [{ id: "student-1", studentNumber: "2026-0001", displayName: "Ada Lovelace" }],
  };
}

describe("IssueBadgeForm", () => {
  beforeEach(() => {
    issueAction.mockResolvedValue({ status: "idle", message: "" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lets Faculty select an active badge and student before issuing the confirmed credential", async () => {
    const user = userEvent.setup();
    render(
      <IssueBadgeForm
        badgeOptions={[{ id: "badge-1", name: "Secure Systems", imagePath: "badges/secure.png" }]}
        classId="class-1"
        issueAction={issueAction}
        studentOptions={[
          { id: "student-1", studentNumber: "2026-0001", displayName: "Ada Lovelace" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Badge Template")).toBeInTheDocument();
    expect(screen.getByLabelText("Student")).toBeInTheDocument();
    expect(
      screen.getByText("Select a badge and student to review the issuance."),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.selectOptions(screen.getByLabelText("Student"), "student-1");

    expect(
      screen.getByText("Secure Systems will be issued to Ada Lovelace (2026-0001)."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue Badge" })).toBeEnabled();

    fireEvent.submit(screen.getByRole("button", { name: "Issue Badge" }).closest("form")!);

    expect(issueAction).toHaveBeenCalledOnce();
  });

  it.each([
    [
      [],
      [{ id: "student-1", studentNumber: "2026-0001", displayName: "Ada Lovelace" }],
      "Create an active badge template before issuing a credential.",
    ],
    [
      [{ id: "badge-1", name: "Secure Systems", imagePath: "badges/secure.png" }],
      [],
      "Add an active student to this class before issuing a credential.",
    ],
  ])(
    "disables issuance with next-step guidance when an option set is empty",
    (badgeOptions, studentOptions, message) => {
      render(
        <IssueBadgeForm
          badgeOptions={badgeOptions}
          classId="class-1"
          issueAction={issueAction}
          studentOptions={studentOptions}
        />,
      );

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Issue Badge" })).toBeDisabled();
    },
  );

  it("does not render issuance controls for an Administrator presentation boundary", () => {
    render(
      <IssueBadgeSection
        classId="class-1"
        issueAction={issueAction}
        role="ADMIN"
        options={{
          badgeOptions: [{ id: "badge-1", name: "Secure Systems", imagePath: "badges/secure.png" }],
          studentOptions: [
            { id: "student-1", studentNumber: "2026-0001", displayName: "Ada Lovelace" },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Issue Badge" })).not.toBeInTheDocument();
  });

  it("announces retryable signing feedback politely and preserves submit focus", async () => {
    const user = userEvent.setup();
    issueAction.mockResolvedValueOnce({
      status: "retryable-error",
      message: signerUnavailableMessage,
    });
    render(<IssueBadgeForm {...options()} issueAction={issueAction} />);
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.selectOptions(screen.getByLabelText("Student"), "student-1");
    const submit = screen.getByRole("button", { name: "Issue Badge" });

    await user.click(submit);

    const feedback = await screen.findByRole("status");
    expect(feedback).toHaveTextContent(signerUnavailableMessage);
    expect(feedback).toHaveAttribute("aria-live", "polite");
    expect(submit).toHaveFocus();
  });

  it("uses React form pending state without a separate client loading flag", async () => {
    const user = userEvent.setup();
    let finish!: (value: { status: "idle"; message: string }) => void;
    issueAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<IssueBadgeForm {...options()} issueAction={issueAction} />);
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.selectOptions(screen.getByLabelText("Student"), "student-1");

    const submission = user.click(screen.getByRole("button", { name: "Issue Badge" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Issuing Badge…" })).toBeDisabled();
    });
    finish({ status: "idle", message: "" });
    await submission;
  });
});
