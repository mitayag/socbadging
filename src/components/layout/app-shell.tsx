import type { ReactNode } from "react";
import { Menu, UserRound } from "lucide-react";

import type { Actor } from "@/modules/identity/types";
import { SidebarContent } from "./sidebar-content";

export function AppShell({
  actor,
  children,
  title = "Dashboard",
}: {
  actor: Actor;
  children: ReactNode;
  title?: string;
}) {
  const roleLabel = actor.role === "ADMIN" ? "System Administrator" : "Faculty";
  return (
    <div className="app-frame">
      <aside className="desktop-sidebar">
        <SidebarContent actor={actor} />
      </aside>
      <div className="app-column">
        <header className="topbar">
          <details className="mobile-menu">
            <summary aria-label="Open navigation">
              <Menu aria-hidden="true" size={22} />
            </summary>
            <div className="mobile-menu-panel">
              <SidebarContent actor={actor} />
            </div>
          </details>
          <span className="page-title">{title}</span>
          <div className="profile-summary">
            <span className="profile-icon">
              <UserRound aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>{actor.name}</strong>
              <small>{roleLabel}</small>
            </span>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
