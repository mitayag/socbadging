"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") ? "Invalid email or password." : "");
  const [submitting, setSubmitting] = useState(false);
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
    router.push("/dashboard");
    router.refresh();
  }
  return (
    <form onSubmit={submit} noValidate>
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
