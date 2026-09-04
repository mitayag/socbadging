import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { SignRequestSchema, VerifyRequestSchema } from "@/modules/open-badges/proof";
import { writeStructuredLog } from "@/platform/logging/structured-log";

import { SignerRuntimeError, type SignerRuntime } from "./runtime";

export const SIGNER_HTTP_MAX_BYTES = 1024 * 1024;

type SafeLogWriter = (event: string, fields?: Readonly<Record<string, unknown>>) => void;

class PayloadTooLargeError extends Error {}

export function constantTimeBearerTokenMatches(
  header: string | undefined,
  expectedToken: string,
  compare: typeof timingSafeEqual = timingSafeEqual,
): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expectedToken).digest();
  return compare(presentedDigest, expectedDigest);
}

function correlationId(request: IncomingMessage): string {
  const value = request.headers["x-correlation-id"];
  if (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    return value;
  }
  return randomUUID();
}

async function readBoundedBody(request: IncomingMessage): Promise<string> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > SIGNER_HTTP_MAX_BYTES) {
    request.resume();
    throw new PayloadTooLargeError();
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    total += chunk.length;
    if (total > SIGNER_HTTP_MAX_BYTES) {
      request.resume();
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  let body = JSON.stringify(value);
  let responseStatus = status;
  if (Buffer.byteLength(body) > SIGNER_HTTP_MAX_BYTES) {
    responseStatus = 500;
    body = JSON.stringify({ error: "RESPONSE_TOO_LARGE" });
  }
  response.writeHead(responseStatus, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

export function createSignerHttpServer(options: {
  runtime: SignerRuntime;
  token: string;
  log?: SafeLogWriter;
}) {
  const log = options.log ?? writeStructuredLog;
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const health = options.runtime.getHealth();
      sendJson(response, health.status === "ready" ? 200 : 503, {
        status: health.status,
        keyId: health.keyId,
        cryptosuite: health.cryptosuite,
      });
      return;
    }

    if (request.method !== "POST" || (request.url !== "/v1/sign" && request.url !== "/v1/verify")) {
      sendJson(response, 404, { error: "NOT_FOUND" });
      return;
    }

    const requestCorrelationId = correlationId(request);
    const operation = request.url === "/v1/sign" ? "credential.sign" : "credential.verify";
    if (!constantTimeBearerTokenMatches(request.headers.authorization, options.token)) {
      request.resume();
      log("signer.http.request", {
        correlationId: requestCorrelationId,
        operation,
        outcome: "UNAUTHORIZED",
      });
      sendJson(response, 401, { error: "UNAUTHORIZED" });
      return;
    }

    try {
      const rawBody = await readBoundedBody(request);
      const json = JSON.parse(rawBody) as unknown;
      if (request.url === "/v1/sign") {
        const parsed = SignRequestSchema.safeParse(json);
        if (!parsed.success) {
          sendJson(response, 400, { error: "INVALID_REQUEST" });
          return;
        }
        const signed = await options.runtime.sign(parsed.data.document, requestCorrelationId);
        sendJson(response, 200, { document: signed, keyId: options.runtime.getHealth().keyId });
        return;
      }

      const parsed = VerifyRequestSchema.safeParse(json);
      if (!parsed.success) {
        sendJson(response, 400, { error: "INVALID_REQUEST" });
        return;
      }
      sendJson(
        response,
        200,
        await options.runtime.verify(parsed.data.document, requestCorrelationId),
      );
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendJson(response, 413, { error: "PAYLOAD_TOO_LARGE" });
        return;
      }
      if (
        error instanceof SyntaxError ||
        (error instanceof SignerRuntimeError && error.code === "INVALID_DOCUMENT")
      ) {
        sendJson(response, 400, { error: "INVALID_REQUEST" });
        return;
      }
      if (error instanceof SignerRuntimeError && error.code === "SIGNER_UNAVAILABLE") {
        sendJson(response, 503, { error: "SIGNER_UNAVAILABLE" });
        return;
      }
      log("signer.http.request", {
        correlationId: requestCorrelationId,
        operation,
        outcome: "FAILED",
      });
      sendJson(response, 500, { error: "SIGNER_ERROR" });
    }
  });
}
