import { spawn } from "node:child_process";
import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { generateEd25519KeyPair } from "../src/modules/signing/key-generator";
import { createSignerHttpServer } from "../src/signer/server";
import { createSignerRuntime } from "../src/signer/runtime";

const signerMetadataPath = resolve(".playwright-e2e-signer.json");
const signerToken = "student-import-e2e-signer-token";
const signerControlToken = "student-import-e2e-control-token";
const appUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/+$/, "");
const keyId = `${appUrl}/api/issuers/hau-soc/keys/e2e`;
const issuerUrl = `${appUrl}/api/issuers/hau-soc`;
const databaseUrl = process.env.E2E_DATABASE_URL;

async function main() {
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required for local production E2E");
  await unlink(signerMetadataPath).catch(() => undefined);
  const directory = await mkdtemp(join(tmpdir(), "hau-student-import-e2e-"));
  const privateKeyPath = join(directory, "signing-key.json");
  const generated = await generateEd25519KeyPair();
  await writeFile(
    privateKeyPath,
    `${JSON.stringify({ privateKeyMultibase: generated.privateKeyMultibase })}\n`,
    { mode: 0o600, flag: "wx" },
  );

  const runtime = await createSignerRuntime({
    privateKeyPath,
    keyId,
    publicKeyMultibase: generated.publicKeyMultibase,
    fingerprint: generated.fingerprint,
  });
  const signer = createSignerHttpServer({ runtime, token: signerToken });
  const startSigner = () =>
    new Promise<void>((resolveListen, rejectListen) => {
      signer.once("error", rejectListen);
      signer.listen(3101, "127.0.0.1", () => {
        signer.off("error", rejectListen);
        resolveListen();
      });
    });
  const stopSigner = () =>
    new Promise<void>((resolveClose, rejectClose) =>
      signer.close((error) => (error ? rejectClose(error) : resolveClose())),
    );
  await startSigner();

  const signerControl = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${signerControlToken}`) {
      response.writeHead(401).end();
      return;
    }
    try {
      if (request.method === "POST" && request.url === "/stop") await stopSigner();
      else if (request.method === "POST" && request.url === "/start") await startSigner();
      else {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(204).end();
    } catch {
      response.writeHead(503).end();
    }
  });
  await new Promise<void>((resolveListen) =>
    signerControl.listen(3102, "127.0.0.1", resolveListen),
  );

  await writeFile(
    signerMetadataPath,
    `${JSON.stringify({
      privateKeyPath,
      appUrl,
      keyId,
      issuerUrl,
      publicKeyMultibase: generated.publicKeyMultibase,
      fingerprint: generated.fingerprint,
      signerToken,
      signerControlToken,
    })}\n`,
    { mode: 0o600, flag: "wx" },
  );

  const child = spawn(
    "./node_modules/.bin/next",
    ["start", "--hostname", "127.0.0.1", "--port", "3200"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        APP_URL: appUrl,
        TRUST_PROXY: "false",
        ISSUER_NAME: "HAU SOC Student Import E2E",
        ISSUER_URL: issuerUrl,
        SIGNER_URL: "http://127.0.0.1:3101",
        SIGNER_TOKEN: signerToken,
        SIGNER_TIMEOUT_MS: "5000",
        SIGNING_KEY_ID: keyId,
        SIGNING_CRYPTOSUITE: "eddsa-rdfc-2022",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        SMTP_FROM: "HAU SOC Test <test@example.test>",
        EMAIL_DELIVERY_MODE: "mailpit",
        EMAIL_RECIPIENT_POLICY: "local",
        EXTERNAL_EMAIL_ENABLED: "false",
        CONTROLLED_ACCEPTANCE_ONLY: "false",
      },
    },
  );

  const close = async (signal: NodeJS.Signals) => {
    child.kill(signal);
    if (signer.listening) await stopSigner();
    await new Promise<void>((resolveClose) => signerControl.close(() => resolveClose()));
    await unlink(signerMetadataPath).catch(() => undefined);
    await unlink(privateKeyPath).catch(() => undefined);
    process.exit(0);
  };
  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
  child.once("exit", (code, signal) => {
    process.stderr.write(
      `Local production E2E server exited (code=${String(code)}, signal=${String(signal)})\n`,
    );
    process.exitCode = code ?? 1;
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "E2E startup failed"}\n`);
  process.exitCode = 1;
});
