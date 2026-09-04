import { constants as fsConstants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { generateEd25519KeyPair } from "../src/modules/signing/key-generator";

type OutputPaths = { privateKeyPath: string; publicMetadataPath: string };

function parseArguments(arguments_: string[]): OutputPaths {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      (flag !== "--private-key-path" && flag !== "--public-metadata-path") ||
      !value ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: generate-signing-key --private-key-path <path> --public-metadata-path <path>",
      );
    }
    values.set(flag, value);
  }
  const privateKeyPath = values.get("--private-key-path");
  const publicMetadataPath = values.get("--public-metadata-path");
  if (!privateKeyPath || !publicMetadataPath) {
    throw new Error("Both --private-key-path and --public-metadata-path are required");
  }
  const resolved = {
    privateKeyPath: resolve(privateKeyPath),
    publicMetadataPath: resolve(publicMetadataPath),
  };
  if (resolved.privateKeyPath === resolved.publicMetadataPath) {
    throw new Error("Private and public output paths must be different");
  }
  return resolved;
}

async function assertTargetDoesNotExist(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing target: ${path}`);
}

export async function runGenerateSigningKeyCli(arguments_: string[]): Promise<void> {
  const paths = parseArguments(arguments_);
  await Promise.all([
    assertTargetDoesNotExist(paths.privateKeyPath),
    assertTargetDoesNotExist(paths.publicMetadataPath),
  ]);
  const generated = await generateEd25519KeyPair();
  let privateCreated = false;
  let publicCreated = false;
  try {
    const privateFile = await open(
      paths.privateKeyPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
      0o600,
    );
    privateCreated = true;
    try {
      await privateFile.chmod(0o600);
      await privateFile.writeFile(
        `${JSON.stringify({ privateKeyMultibase: generated.privateKeyMultibase })}\n`,
        "utf8",
      );
    } finally {
      await privateFile.close();
    }

    const publicFile = await open(
      paths.publicMetadataPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
      0o644,
    );
    publicCreated = true;
    try {
      await publicFile.writeFile(
        `${JSON.stringify(
          {
            algorithm: "Ed25519",
            cryptosuite: "eddsa-rdfc-2022",
            publicKeyMultibase: generated.publicKeyMultibase,
            fingerprint: generated.fingerprint,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } finally {
      await publicFile.close();
    }
  } catch (error) {
    if (publicCreated) await unlink(paths.publicMetadataPath).catch(() => undefined);
    if (privateCreated) await unlink(paths.privateKeyPath).catch(() => undefined);
    throw error;
  }

  process.stdout.write(`Private key path: ${paths.privateKeyPath}\n`);
  process.stdout.write(`Public metadata path: ${paths.publicMetadataPath}\n`);
  process.stdout.write(`Fingerprint: ${generated.fingerprint}\n`);
}

runGenerateSigningKeyCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Signing key generation failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
