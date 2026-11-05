import type { ReactNode } from "react";
import type { Actor } from "@/modules/identity/types";
import { SidebarContent } from "./sidebar-content";
import { MobileNavigation } from "./mobile-navigation";
import { UserMenu } from "./user-menu";

export function AppShell({
  actor,
  children,
  title = "Dashboard",
}: {
  actor: Actor;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="app-frame">
      <aside className="desktop-sidebar">
        <SidebarContent actor={actor} />
      </aside>
      <div className="app-column">
        <header className="topbar">
          <MobileNavigation actor={actor} />
          <span className="page-title">{title}</span>
          <UserMenu actor={actor} />
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
