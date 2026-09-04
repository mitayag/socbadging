import Link from "next/link";

export default function CredentialNotFound() {
  return (
    <main className="public-not-found">
      <p className="eyebrow">Credential Verification</p>
      <h1>Credential Not Found</h1>
      <p>The verification link is invalid or this credential is unavailable.</p>
      <Link className="secondary-button export-link" href="/">
        Return to HAU SOC Badging
      </Link>
    </main>
  );
}
