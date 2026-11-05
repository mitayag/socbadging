"use client";

import { useRouter } from "next/navigation";

export function SignOutButton({
  className = "text-button",
  onSignedOut,
  role,
}: {
  className?: string;
  onSignedOut?: () => void;
  role?: "menuitem";
}) {
  const router = useRouter();
  return (
    <button
      className={className}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        onSignedOut?.();
        router.push("/login");
        router.refresh();
      }}
      role={role}
      type="button"
    >
      Sign Out
    </button>
  );
}
