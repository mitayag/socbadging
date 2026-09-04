import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { BrandLockup } from "@/components/layout/brand-lockup";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-brand-header">
          <BrandLockup priority variant="login" />
        </div>
        <div>
          <h1>Secure Academic Credential Management</h1>
          <p>Administrator and Faculty access for the HAU School of Computing.</p>
        </div>
        <small>Foundation release · Authorized personnel only</small>
      </section>
      <section className="auth-panel" aria-labelledby="login-heading">
        <div className="auth-card">
          <h2 id="login-heading">Welcome Back</h2>
          <p>Sign in with your authorized account.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
