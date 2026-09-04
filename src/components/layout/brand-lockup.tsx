import Image from "next/image";

type BrandLockupProps = {
  priority?: boolean;
  variant?: "login" | "sidebar";
};

export function BrandLockup({ priority = false, variant = "sidebar" }: BrandLockupProps) {
  const login = variant === "login";

  return (
    <div className={`brand-lockup brand-row brand-lockup--${variant}`}>
      <div className="brand-wordmark" aria-label="HAU SOC Badging System">
        <span data-brand-line="institution">HAU SOC</span>
        <span data-brand-line="product">Badging System</span>
      </div>
      <Image
        className={login ? "auth-logo" : "sidebar-logo"}
        src="/images/hausoclogo.png"
        alt="HAU School of Computing logo"
        width={login ? 180 : 72}
        height={login ? 180 : 72}
        sizes={login ? "(max-width: 820px) 120px, 180px" : "(max-width: 820px) 56px, 72px"}
        priority={priority}
      />
    </div>
  );
}
