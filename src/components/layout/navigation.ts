import {
  Award,
  Bell,
  BookOpen,
  ClipboardList,
  Gauge,
  Settings,
  UserRound,
  Users,
} from "lucide-react";

import type { Role } from "@/modules/identity/types";

export type NavigationItem = {
  label: string;
  href: string;
  icon: typeof Gauge;
  phase: "available" | "future";
};

const dashboard: NavigationItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: Gauge,
  phase: "available",
};
const adminItems: NavigationItem[] = [
  { label: "Notifications", href: "/notifications", icon: Bell, phase: "available" },
  {
    label: "Faculty Management",
    href: "/faculty",
    icon: Users,
    phase: "available",
  },
  { label: "Audit Logs", href: "/audit-logs", icon: ClipboardList, phase: "available" },
  { label: "Settings", href: "/settings", icon: Settings, phase: "available" },
];
const classes: NavigationItem = {
  label: "Classes",
  href: "/classes",
  icon: BookOpen,
  phase: "available",
};
const issuedBadges: NavigationItem = {
  label: "Issued Badges",
  href: "/issued",
  icon: Award,
  phase: "available",
};
const profile: NavigationItem = {
  label: "My Profile",
  href: "/profile",
  icon: UserRound,
  phase: "available",
};

export function getNavigationItems(role: Role): NavigationItem[] {
  return role === "ADMIN"
    ? [dashboard, classes, issuedBadges, ...adminItems]
    : [dashboard, classes, issuedBadges, profile];
}

export function getClassTabs(
  classId: string,
  active: "students" | "badges" | "issued" | "settings",
) {
  return [
    { label: "Students", href: `/classes/${classId}/students`, active: active === "students" },
    { label: "Badges", href: `/classes/${classId}/badges`, active: active === "badges" },
    { label: "Issued", href: `/classes/${classId}/issued`, active: active === "issued" },
    { label: "Settings", href: `/classes/${classId}/settings`, active: active === "settings" },
  ];
}
