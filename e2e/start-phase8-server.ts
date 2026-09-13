import { execFile, spawn } from "node:child_process";
import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { generateEd25519KeyPair } from "../src/modules/signing/key-generator";
import { createSignerHttpServer } from "../src/signer/server";
import { createSignerRuntime } from "../src/signer/runtime";

const signerMetadataPath = resolve(".playwright-e2e-signer.json");
const signerToken = "phase8-disposable-e2e-signer-token";
const signerControlToken = "phase8-disposable-e2e-control-token";
const appUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const keyId = `${appUrl}/api/issuers/hau-soc/keys/e2e`;
const issuerUrl = `${appUrl}/api/issuers/hau-soc`;
const run = promisify(execFile);
const webContainer = "hau-phase8-e2e-web";

async function main() {
  // Remove an interrupted prior run before Playwright begins polling health;
  // otherwise a stale container can satisfy readiness and then disappear.
  await run("docker", ["rm", "-f", webContainer]).catch(() => undefined);
  await unlink(signerMetadataPath).catch(() => undefined);
  const directory = await mkdtemp(join(tmpdir(), "hau-phase8-e2e-"));
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
  if (runtime.getHealth().status !== "ready") throw new Error("Disposable signer is not ready");
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

  const databaseUrl = new URL(
    process.env.TEST_DATABASE_URL ?? "mysql://invalid:invalid@127.0.0.1/invalid",
  );
  databaseUrl.hostname = "host.docker.internal";
  await run("docker", ["build", "--target", "tools", "-t", "hau-phase8-e2e-app", "."]);
  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--name",
      webContainer,
      "-p",
      "127.0.0.1:3100:3100",
      "-e",
      `DATABASE_URL=${databaseUrl.toString()}`,
      "-e",
      `APP_URL=${appUrl}`,
      "-e",
      `ISSUER_URL=${issuerUrl}`,
      "-e",
      "SIGNER_URL=http://host.docker.internal:3101",
      "-e",
      `SIGNER_TOKEN=${signerToken}`,
      "-e",
      "SIGNER_TIMEOUT_MS=5000",
      "-e",
      `SIGNING_KEY_ID=${keyId}`,
      "-e",
      "SIGNING_CRYPTOSUITE=eddsa-rdfc-2022",
      "hau-phase8-e2e-app",
      "./node_modules/.bin/next",
      "dev",
      "--hostname",
      "0.0.0.0",
      "--port",
      "3100",
    ],
    { stdio: "inherit" },
  );

  const close = async (signal: NodeJS.Signals) => {
    child.kill(signal);
    await run("docker", ["rm", "-f", webContainer]).catch(() => undefined);
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
      `Disposable E2E web container exited (code=${String(code)}, signal=${String(signal)})\n`,
    );
    process.exitCode = code ?? 1;
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "E2E startup failed"}\n`);
  process.exitCode = 1;
});
