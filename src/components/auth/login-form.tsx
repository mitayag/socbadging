"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") ? "Invalid email or password." : "");
  const [submitting, setSubmitting] = useState(false);
  const noticeValue = params.get("notice");
  const notice =
    noticeValue === "password-updated"
      ? "Your password was updated. Sign in again with your new password."
      : noticeValue === "student-activated"
        ? "Your student account is active. Sign in to view your badges."
        : noticeValue === "student-password-reset"
          ? "Your password was reset. Sign in with your new password."
          : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    if (!response.ok) {
      setError("Invalid email or password.");
      setSubmitting(false);
      return;
    }
    const result = (await response.json().catch(() => null)) as { redirectTo?: unknown } | null;
    const redirectTo =
      result?.redirectTo === "/student" ||
      result?.redirectTo === "/student/change-password" ||
      result?.redirectTo === "/dashboard"
        ? result.redirectTo
        : "/dashboard";
    router.push(redirectTo);
    router.refresh();
  }
  return (
    <form onSubmit={submit} noValidate>
      {notice ? (
        <p className="auth-success" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <label className="field">
        Institutional Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Signing In…" : "Sign In Securely"}
      </button>
    </form>
  );
}
