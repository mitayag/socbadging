"use client";

import Link from "next/link";
import { ChevronDown, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import type { Actor } from "@/modules/identity/types";

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

export function UserMenu({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const roleLabel =
    actor.role === "ADMIN"
      ? "System Administrator"
      : actor.role === "STUDENT"
        ? "Student"
        : "Faculty";
  const profileHref = actor.role === "STUDENT" ? "/student/profile" : "/profile";

  useEffect(() => {
    if (!open) return;
    menuItems(menuRef.current)[0]?.focus();

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(menuRef.current);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(current + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        aria-controls="user-menu-panel"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Open user menu for ${actor.name}`}
        className="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
        ref={buttonRef}
        type="button"
      >
        <span className="profile-icon">
          <UserRound aria-hidden="true" size={18} />
        </span>
        <span className="user-menu-identity">
          <strong>{actor.name}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={open ? "user-menu-chevron open" : "user-menu-chevron"}
          size={16}
        />
      </button>
      {open ? (
        <div
          aria-label="User menu"
          className="user-menu-panel"
          id="user-menu-panel"
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          <div className="user-menu-header">
            <strong>{actor.name}</strong>
            <span>{roleLabel}</span>
            <small>{actor.email}</small>
          </div>
          <Link
            className="user-menu-item"
            href={profileHref}
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            My Profile
          </Link>
          <Link
            className="user-menu-item"
            href="/account"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Account Settings
          </Link>
          <div className="user-menu-separator" role="separator" />
          <SignOutButton
            className="user-menu-item user-menu-signout"
            onSignedOut={() => setOpen(false)}
            role="menuitem"
          />
        </div>
      ) : null}
    </div>
  );
}
