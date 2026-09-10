import { z } from "zod";

import { loadSignerClientConfig, loadSignerReadinessConfig } from "@/config/env";
import {
  SignRequestSchema,
  SignResponseSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
  type SignedOpenBadgeCredential,
  type VerifyResponse,
} from "@/modules/open-badges/proof";

const SIGNER_RESPONSE_MAX_BYTES = 1024 * 1024;
const SignerClientConfigSchema = z
  .object({
    baseUrl: z.url(),
    token: z.string().min(1),
    timeoutMs: z.number().int().min(1).max(60_000),
  })
  .strict();

export type SignerClientErrorCode =
  "SIGNER_UNAVAILABLE" | "SIGNER_REJECTED" | "INVALID_SIGNER_RESPONSE";

export class SignerClientError extends Error {
  constructor(public readonly code: SignerClientErrorCode) {
    super(
      code === "SIGNER_UNAVAILABLE"
        ? "Credential signer is unavailable"
        : code === "SIGNER_REJECTED"
          ? "Credential signer rejected the request"
          : "Credential signer returned an invalid response",
    );
    this.name = "SignerClientError";
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > SIGNER_RESPONSE_MAX_BYTES) {
    await response.body?.cancel();
    throw new SignerClientError("SIGNER_UNAVAILABLE");
  }
  if (!response.body) throw new SignerClientError("INVALID_SIGNER_RESPONSE");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > SIGNER_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new SignerClientError("SIGNER_UNAVAILABLE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new SignerClientError("INVALID_SIGNER_RESPONSE");
  }
}

export function createSignerClient(
  rawConfig: z.input<typeof SignerClientConfigSchema>,
  fetchImplementation: typeof fetch = fetch,
) {
  const config = SignerClientConfigSchema.parse(rawConfig);

  const request = async (path: "/v1/sign" | "/v1/verify", body: unknown, correlationId: string) => {
    let response: Response;
    try {
      response = await fetchImplementation(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      throw new SignerClientError("SIGNER_UNAVAILABLE");
    }

    try {
      if (!response.ok) {
        await response.body?.cancel();
        throw new SignerClientError(
          response.status >= 500 ? "SIGNER_UNAVAILABLE" : "SIGNER_REJECTED",
        );
      }
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof SignerClientError) throw error;
      throw new SignerClientError("SIGNER_UNAVAILABLE");
    }
  };

  return {
    signCredential: async (
      document: unknown,
      correlationId: string,
    ): Promise<SignedOpenBadgeCredential> => {
      const body = SignRequestSchema.parse({ operation: "credential.sign", document });
      const parsed = SignResponseSchema.safeParse(await request("/v1/sign", body, correlationId));
      if (!parsed.success) throw new SignerClientError("INVALID_SIGNER_RESPONSE");
      return parsed.data.document;
    },
    verifyCredential: async (document: unknown, correlationId: string): Promise<VerifyResponse> => {
      const body = VerifyRequestSchema.parse({ operation: "credential.verify", document });
      const parsed = VerifyResponseSchema.safeParse(
        await request("/v1/verify", body, correlationId),
      );
      if (!parsed.success) throw new SignerClientError("INVALID_SIGNER_RESPONSE");
      return parsed.data;
    },
  };
}

export async function signCredential(
  document: unknown,
  correlationId: string,
): Promise<SignedOpenBadgeCredential> {
  return createSignerClient(loadSignerClientConfig(process.env)).signCredential(
    document,
    correlationId,
  );
}

export async function verifyCredential(
  document: unknown,
  correlationId: string,
): Promise<VerifyResponse> {
  return createSignerClient(loadSignerClientConfig(process.env)).verifyCredential(
    document,
    correlationId,
  );
}

export async function getSignerHealth(): Promise<{
  status: "ready";
  keyId: string;
  cryptosuite: string;
} | null> {
  try {
    const config = loadSignerReadinessConfig(process.env);
    const response = await fetch(`${config.baseUrl}/health`, {
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const parsed = z
      .object({
        status: z.literal("ready"),
        keyId: z.url(),
        cryptosuite: z.literal("eddsa-rdfc-2022"),
      })
      .safeParse(await response.json());
    return response.ok &&
      parsed.success &&
      parsed.data.keyId === config.expectedKeyId &&
      parsed.data.cryptosuite === config.expectedCryptosuite
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
