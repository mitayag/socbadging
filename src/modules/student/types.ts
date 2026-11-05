export type StudentCredentialStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type StudentBadgeSort = "issued_desc" | "issued_asc" | "status";

export type StudentBadgeListItem = {
  issuanceId: string;
  publicId: string;
  badgeName: string;
  description: string;
  imageUrl: string;
  issuerName: string;
  classLabel: string;
  issuedAt: string;
  expiresAt: string | null;
  status: StudentCredentialStatus;
};

export type StudentDashboardData = {
  total: number;
  active: number;
  expired: number;
  revoked: number;
  recent: StudentBadgeListItem[];
};

export type StudentNotificationItem = {
  id: string;
  type: "BADGE_ISSUED" | "BADGE_REVOKED";
  status: "PENDING" | "PROCESSING" | "RETRY_SCHEDULED" | "SENT" | "FAILED";
  badgeName: string;
  createdAt: string;
  sentAt: string | null;
  attemptCount: number;
  lastErrorCategory: string | null;
  safeDiagnosticCode: string | null;
};
