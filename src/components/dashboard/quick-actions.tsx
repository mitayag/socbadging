import Link from "next/link";
import {
  Award,
  BadgeCheck,
  BookOpen,
  ClipboardList,
  Plus,
  Send,
  Settings,
  Users,
} from "lucide-react";

import type { DashboardQuickAction, DashboardQuickActionIcon } from "@/modules/dashboard/types";

const icons: Record<DashboardQuickActionIcon, typeof Award> = {
  users: Users,
  book: BookOpen,
  award: Award,
  clipboard: ClipboardList,
  settings: Settings,
  plus: Plus,
  badge: BadgeCheck,
  issue: Send,
};

export function QuickActions({ actions }: { actions: DashboardQuickAction[] }) {
  return (
    <section
      className="panel dashboard-panel quick-actions-panel"
      aria-labelledby="quick-actions-heading"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Shortcuts</span>
          <h2 id="quick-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="quick-actions-grid">
        {actions.map((action) => {
          const Icon = icons[action.icon];
          return (
            <Link className="quick-action" href={action.href} key={action.label}>
              <span className="quick-action-icon">
                <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              </span>
              <span>
                <strong>{action.label}</strong>
                <small>{action.description}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
