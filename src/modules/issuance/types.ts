export type RecipientSnapshot = {
  studentId: string;
  studentNumber: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type AchievementAlignmentSnapshot = {
  type: ["Alignment"];
  targetName: string;
  targetUrl: string;
};

export type AchievementImageSnapshot = {
  id: string;
  type: "Image";
};

export type AchievementSnapshot = {
  badgeTemplateId: string;
  id: string;
  type: ["Achievement"];
  name: string;
  description: string;
  criteria: {
    narrative: string;
  };
  imagePath: string;
  image: AchievementImageSnapshot;
  skills: string[];
  tag?: string[];
  alignment?: AchievementAlignmentSnapshot[];
  templateUpdatedAt: string;
  class: {
    id: string;
    courseCode: string;
    title: string;
    section: string;
    term: string;
    academicYear: string;
  };
  expiresAfterDays: number | null;
};

export type IssuerImageSnapshot = {
  id: string;
  type: "Image";
};

export type IssuerSnapshot = {
  name: string;
  url: string;
  logoUrl: string;
  issuerUserId: string;
  issuerUserName: string;
};

export type OpenBadgeCredentialSnapshot = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ];
  id: string;
  type: ["VerifiableCredential", "OpenBadgeCredential"];
  name: string;
  issuer: {
    id: string;
    type: ["Profile"];
    name: string;
    image: IssuerImageSnapshot;
  };
  validFrom: string;
  validUntil?: string;
  credentialSubject: {
    type: ["AchievementSubject"];
    identifier: Array<{
      type: "IdentityObject";
      identityHash: string;
      identityType: "email";
      hashed: true;
    }>;
    achievement: {
      id: string;
      type: ["Achievement"];
      name: string;
      description: string;
      criteria: {
        narrative: string;
      };
      image: AchievementImageSnapshot;
      tag?: string[];
      alignment?: AchievementAlignmentSnapshot[];
    };
  };
};

export type IssuanceListItem = {
  id: string;
  publicId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: string;
  expiresAt: string | null;
  classId: string;
  classCourseCode: string;
  classTitle: string;
  classSection: string;
  badgeTemplateId: string;
  badgeName: string;
  badgeImageUrl: string;
  studentId: string;
  studentNumber: string;
  recipientDisplayName: string;
  recipientEmail: string;
  issuerUserId: string;
  issuerUserName: string;
};

export type IssuanceResult = {
  issuanceId: string;
  publicId: string;
  alreadyIssued: boolean;
};

export type IssueBadgeActionState = {
  status: "idle" | "retryable-error" | "error";
  message: string;
};
