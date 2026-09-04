"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Actor } from "@/modules/identity/types";
import { BrandLockup } from "./brand-lockup";
import { getNavigationItems } from "./navigation";

export function SidebarContent({ actor }: { actor: Actor }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="sidebar-content">
      <div className="brand">
        <BrandLockup />
      </div>
      <nav aria-label="Primary Navigation" className="primary-nav">
        {getNavigationItems(actor.role).map(({ label, href, icon: Icon, phase }) => {
          const active =
            phase === "available" && (pathname === href || pathname.startsWith(`${href}/`));
          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-disabled={phase === "future"}
              className={active ? "nav-link active" : "nav-link"}
              href={href}
              key={label}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span>{label}</span>
              {phase === "future" ? (
                <span className="sr-only"> (available in a later phase)</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span>HAU School of Computing</span>
        <small>Secure credential foundations</small>
      </div>
    </div>
  );
}
