// @vitest-environment node

import { spawn } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";
import { afterEach, describe, expect, it } from "vitest";

import { generateEd25519KeyPair } from "./key-generator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function runKeyCli(arguments_: string[]) {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const script = join(process.cwd(), "scripts", "generate-signing-key.ts");
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, script, ...arguments_], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("generateEd25519KeyPair", () => {
  it("returns a canonical matching Ed25519 key pair and public fingerprint", async () => {
    const generated = await generateEd25519KeyPair();
    const keyPair = await Ed25519Multikey.from({
      type: "Multikey",
      publicKeyMultibase: generated.publicKeyMultibase,
      secretKeyMultibase: generated.privateKeyMultibase,
    });
    const challenge = new TextEncoder().encode("key-pair-consistency-check");
    const signature = await keyPair.signer().sign({ data: challenge });
    const canonical = await keyPair.export({
      publicKey: false,
      secretKey: true,
      canonicalize: true,
    });

    await expect(keyPair.verifier().verify({ data: challenge, signature })).resolves.toBe(true);
    expect(generated.privateKeyMultibase).toBe(canonical.secretKeyMultibase);
    expect(generated.fingerprint).toBe(generated.publicKeyMultibase);
    expect(generated.privateKeyMultibase).not.toBe(generated.publicKeyMultibase);
  });
});

describe("generate-signing-key CLI", () => {
  it("requires both explicit output paths", async () => {
    const result = await runKeyCli([]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("--private-key-path");
    expect(result.stderr).toContain("--public-metadata-path");
  });

  it("creates a 0600 private file and prints no private material", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hau-signing-key-cli-"));
    temporaryDirectories.push(directory);
    const privateKeyPath = join(directory, "private.key");
    const publicMetadataPath = join(directory, "public.json");

    const result = await runKeyCli([
      "--private-key-path",
      privateKeyPath,
      "--public-metadata-path",
      publicMetadataPath,
    ]);

    const privateFile = JSON.parse(await readFile(privateKeyPath, "utf8")) as {
      privateKeyMultibase: string;
    };
    const publicMetadata = JSON.parse(await readFile(publicMetadataPath, "utf8")) as {
      algorithm: string;
      cryptosuite: string;
      publicKeyMultibase: string;
      fingerprint: string;
    };
    expect(result.code).toBe(0);
    expect((await stat(privateKeyPath)).mode & 0o777).toBe(0o600);
    expect(publicMetadata).toEqual({
      algorithm: "Ed25519",
      cryptosuite: "eddsa-rdfc-2022",
      publicKeyMultibase: publicMetadata.fingerprint,
      fingerprint: publicMetadata.fingerprint,
    });
    expect(result.stdout).toContain(privateKeyPath);
    expect(result.stdout).toContain(publicMetadataPath);
    expect(result.stdout).toContain(publicMetadata.fingerprint);
    expect(result.stdout).not.toContain(privateFile.privateKeyMultibase);
    expect(result.stderr).not.toContain(privateFile.privateKeyMultibase);
    expect(await readFile(publicMetadataPath, "utf8")).not.toContain(
      privateFile.privateKeyMultibase,
    );
  });

  it("refuses an existing target without creating the other target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hau-signing-key-existing-"));
    temporaryDirectories.push(directory);
    const privateKeyPath = join(directory, "private.key");
    const publicMetadataPath = join(directory, "public.json");
    await writeFile(publicMetadataPath, "keep-me", { mode: 0o600 });
    await chmod(publicMetadataPath, 0o600);

    const result = await runKeyCli([
      "--private-key-path",
      privateKeyPath,
      "--public-metadata-path",
      publicMetadataPath,
    ]);

    expect(result.code).not.toBe(0);
    expect(await readFile(publicMetadataPath, "utf8")).toBe("keep-me");
    await expect(access(privateKeyPath)).rejects.toThrow();
  });
});
