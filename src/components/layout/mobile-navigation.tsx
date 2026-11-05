"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";

import type { Actor } from "@/modules/identity/types";
import { SidebarContent } from "./sidebar-content";

export function MobileNavigation({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="mobile-menu">
      <button
        aria-expanded={open}
        aria-label={open ? "Close navigation" : "Open navigation"}
        className="mobile-menu-button"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Menu aria-hidden="true" size={22} />
      </button>
      {open ? (
        <>
          <button
            aria-label="Dismiss navigation"
            className="mobile-menu-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="mobile-menu-panel">
            <SidebarContent actor={actor} onNavigate={() => setOpen(false)} />
          </div>
        </>
      ) : null}
    </div>
  );
}
