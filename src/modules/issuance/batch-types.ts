import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(191);
const timestampSchema = z.iso.datetime();
const countSchema = z.number().int().nonnegative();

export type BatchRowDisposition =
  | "READY"
  | "ALREADY_ISSUED"
  | "DUPLICATE_IN_FILE"
  | "STUDENT_NOT_FOUND"
  | "NOT_ACTIVELY_ENROLLED"
  | "EMAIL_MISMATCH"
  | "INVALID";

export type BatchCommitActionState = {
  status: "idle" | "signing-error";
  message: string;
};

export const batchRowDispositionSchema = z.enum([
  "READY",
  "ALREADY_ISSUED",
  "DUPLICATE_IN_FILE",
  "STUDENT_NOT_FOUND",
  "NOT_ACTIVELY_ENROLLED",
  "EMAIL_MISMATCH",
  "INVALID",
]);

export const issuanceBatchStatusSchema = z.enum(["READY", "SIGNING", "COMMITTED", "EXPIRED"]);
export type IssuanceBatchStatus = z.infer<typeof issuanceBatchStatusSchema>;

export type BatchMapping = {
  studentNumber: number;
  email?: number | null;
};

export const batchMappingSchema: z.ZodType<BatchMapping> = z
  .object({
    studentNumber: z.number().int().nonnegative(),
    email: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export type BatchPreviewRow = {
  rowNumber: number;
  studentNumber: string;
  emailSupplied: string | null;
  disposition: BatchRowDisposition;
  message: string;
  studentId: string | null;
  issuanceId: string | null;
  publicId: string | null;
};

export const batchPreviewRowSchema: z.ZodType<BatchPreviewRow> = z
  .object({
    rowNumber: z.number().int().positive(),
    studentNumber: z
      .string()
      .max(100)
      .refine((value) => value === value.trim()),
    emailSupplied: z.string().trim().min(1).max(191).nullable(),
    disposition: batchRowDispositionSchema,
    message: z.string().trim().min(1).max(1000),
    studentId: identifierSchema.nullable(),
    issuanceId: identifierSchema.nullable(),
    publicId: identifierSchema.nullable(),
  })
  .strict();

type BatchSummaryFields = {
  id: string;
  classId: string;
  badgeTemplateId: string;
  facultyUserId: string;
  sourceFilename: string;
  mapping: BatchMapping;
  previewFingerprint: string;
  totalRows: number;
  readyCount: number;
  alreadyIssuedCount: number;
  invalidCount: number;
  issuedCount: number;
  status: IssuanceBatchStatus;
  expiresAt: string;
  committedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rows: BatchPreviewRow[];
};

const batchSummaryFields = {
  id: identifierSchema,
  classId: identifierSchema,
  badgeTemplateId: identifierSchema,
  facultyUserId: identifierSchema,
  sourceFilename: z.string().trim().min(1).max(255),
  mapping: batchMappingSchema,
  previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  totalRows: countSchema,
  readyCount: countSchema,
  alreadyIssuedCount: countSchema,
  invalidCount: countSchema,
  issuedCount: countSchema,
  status: issuanceBatchStatusSchema,
  expiresAt: timestampSchema,
  committedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  rows: z.array(batchPreviewRowSchema),
} satisfies z.ZodRawShape;

const batchSummarySchema = z.object(batchSummaryFields).strict();

type ReconciliationMode = "preview" | "committed";

function addReconciliationIssue(
  context: z.RefinementCtx,
  path: (keyof BatchSummaryFields)[],
  message: string,
) {
  context.addIssue({ code: "custom", message, path });
}

function hasResultIdentifiers(row: BatchPreviewRow) {
  return row.issuanceId !== null && row.publicId !== null;
}

function hasNoResultIdentifiers(row: BatchPreviewRow) {
  return row.issuanceId === null && row.publicId === null;
}

function reconcileRows(
  summary: BatchSummaryFields,
  context: z.RefinementCtx,
  mode: ReconciliationMode,
) {
  if (summary.rows.length !== summary.totalRows) {
    addReconciliationIssue(context, ["rows"], "Batch rows must equal total rows");
  }

  const counts = summary.rows.reduce(
    (current, row) => {
      if (row.disposition === "READY") current.ready += 1;
      else if (row.disposition === "ALREADY_ISSUED") current.alreadyIssued += 1;
      else current.invalid += 1;
      return current;
    },
    { ready: 0, alreadyIssued: 0, invalid: 0 },
  );

  if (summary.readyCount !== counts.ready) {
    addReconciliationIssue(context, ["readyCount"], "Ready count must match row dispositions");
  }
  if (summary.alreadyIssuedCount !== counts.alreadyIssued) {
    addReconciliationIssue(
      context,
      ["alreadyIssuedCount"],
      "Already-issued count must match row dispositions",
    );
  }
  if (summary.invalidCount !== counts.invalid) {
    addReconciliationIssue(context, ["invalidCount"], "Invalid count must match row dispositions");
  }

  for (const [index, row] of summary.rows.entries()) {
    const requiresResultIdentifiers =
      row.disposition === "ALREADY_ISSUED" || (mode === "committed" && row.disposition === "READY");
    const hasExpectedResultIdentifiers = requiresResultIdentifiers
      ? hasResultIdentifiers(row)
      : hasNoResultIdentifiers(row);

    if (!hasExpectedResultIdentifiers) {
      addReconciliationIssue(
        context,
        ["rows", index] as (keyof BatchSummaryFields)[],
        "Row result identifiers do not match its stored batch state",
      );
    }
  }

  if (mode === "preview") {
    if (summary.issuedCount !== 0) {
      addReconciliationIssue(context, ["issuedCount"], "Preview issued count must be zero");
    }
    if (summary.totalRows !== counts.ready + counts.alreadyIssued + counts.invalid) {
      addReconciliationIssue(context, ["totalRows"], "Preview counts must equal total rows");
    }
    return;
  }

  if (summary.issuedCount !== counts.ready) {
    addReconciliationIssue(
      context,
      ["issuedCount"],
      "Issued count must match finalized READY rows",
    );
  }
  if (summary.totalRows !== counts.ready + counts.alreadyIssued + counts.invalid) {
    addReconciliationIssue(context, ["totalRows"], "Committed counts must equal total rows");
  }
}

export type BatchPreviewSummary = Omit<
  BatchSummaryFields,
  "status" | "committedAt" | "issuedCount"
> & {
  status: "READY";
  committedAt: null;
  issuedCount: 0;
};

export const batchPreviewSummarySchema: z.ZodType<BatchPreviewSummary> = batchSummarySchema
  .extend({
    status: z.literal("READY"),
    committedAt: z.null(),
    issuedCount: z.literal(0),
  })
  .superRefine((summary, context) => reconcileRows(summary, context, "preview"));

export type BatchCommitSummary = Omit<BatchSummaryFields, "status" | "committedAt"> & {
  status: "COMMITTED";
  committedAt: string;
  alreadyCommitted: boolean;
};

export const batchCommitSummarySchema: z.ZodType<BatchCommitSummary> = batchSummarySchema
  .extend({
    status: z.literal("COMMITTED"),
    committedAt: timestampSchema,
    alreadyCommitted: z.boolean(),
  })
  .superRefine((summary, context) => reconcileRows(summary, context, "committed"));

export type BatchDetail = BatchSummaryFields;

export const batchDetailSchema: z.ZodType<BatchDetail> = batchSummarySchema.superRefine(
  (summary, context) => {
    reconcileRows(summary, context, summary.status === "COMMITTED" ? "committed" : "preview");
  },
);

export type BatchReportRow = Pick<
  BatchPreviewRow,
  | "rowNumber"
  | "studentNumber"
  | "emailSupplied"
  | "disposition"
  | "message"
  | "issuanceId"
  | "publicId"
>;

export const batchReportRowSchema: z.ZodType<BatchReportRow> = z
  .object({
    rowNumber: z.number().int().positive(),
    studentNumber: z
      .string()
      .max(100)
      .refine((value) => value === value.trim()),
    emailSupplied: z.string().trim().min(1).max(191).nullable(),
    disposition: batchRowDispositionSchema,
    message: z.string().trim().min(1).max(1000),
    issuanceId: identifierSchema.nullable(),
    publicId: identifierSchema.nullable(),
  })
  .strict();

export function parseStoredBatchRows(value: unknown): BatchPreviewRow[] {
  const parsed = z.array(batchPreviewRowSchema).safeParse(value);
  if (!parsed.success) throw new Error("Invalid batch snapshot");
  return parsed.data;
}
