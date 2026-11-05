export type DashboardCredentialStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type DashboardStats = {
  facultyAccounts: number | null;
  classes: number;
  students: number;
  badgeTemplates: number;
  issuedBadges: number;
  activeCredentials: number;
  revokedCredentials: number;
  expiredCredentials: number;
};

export type DashboardIssuance = {
  id: string;
  publicId: string;
  badgeName: string;
  classLabel: string;
  recipientDisplayName: string;
  issuedAt: string;
  status: DashboardCredentialStatus;
};

export type DashboardActivity = {
  id: string;
  action: string;
  label: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
};

export type DashboardTrendPoint = {
  date: string;
  count: number;
};

export type DashboardQuickActionIcon =
  "users" | "book" | "award" | "clipboard" | "settings" | "plus" | "badge" | "issue";

export type DashboardQuickAction = {
  label: string;
  href: string;
  description: string;
  icon: DashboardQuickActionIcon;
};

export type DashboardPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type DashboardData = {
  role: "ADMIN" | "FACULTY";
  stats: DashboardStats;
  recentIssuances: DashboardIssuance[];
  issuancePagination: DashboardPagination;
  recentActivities: DashboardActivity[];
  activityPagination: DashboardPagination;
  trend: DashboardTrendPoint[];
  trendDays: number;
  quickActions: DashboardQuickAction[];
};
