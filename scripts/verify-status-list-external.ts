import "dotenv/config";

import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";

import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import { cryptosuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";

import { loadAllowlistedDocument } from "../src/modules/open-badges/document-loader";

const require = createRequire(import.meta.url);
const jsonldSignatures = require("jsonld-signatures") as {
  verify: (
    document: object,
    options: {
      suite: object;
      purpose: object;
      documentLoader: (url: string) => Promise<{ documentUrl: string; document: unknown }>;
    },
  ) => Promise<{ verified: boolean }>;
  purposes: {
    AssertionProofPurpose: new (options?: { controller?: object }) => object;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const baseUrl = required("APP_URL").replace(/\/+$/, "");
const listId = process.argv[2]?.trim() || "status-list-local";
const expectedRevoked = process.env.EXPECTED_REVOKED_INDEX
  ? Number(process.env.EXPECTED_REVOKED_INDEX)
  : null;
const expectedActive = process.env.EXPECTED_ACTIVE_INDEX
  ? Number(process.env.EXPECTED_ACTIVE_INDEX)
  : null;

function revokedIndexes(encodedList: string): number[] {
  if (!encodedList.startsWith("u")) throw new Error("Unsupported status-list encoding");
  const bytes = gunzipSync(Buffer.from(encodedList.slice(1), "base64url"));
  const indexes: number[] = [];
  for (let index = 0; index < bytes.length * 8; index += 1) {
    const byte = bytes[Math.floor(index / 8)] ?? 0;
    if ((byte & (1 << (7 - (index % 8)))) !== 0) indexes.push(index);
  }
  return indexes;
}

async function main() {
  const listUrl = `${baseUrl}/api/status-lists/${encodeURIComponent(listId)}`;
  const listResponse = await fetch(listUrl, { headers: { accept: "application/ld+json" } });
  if (listResponse.status !== 200) {
    throw new Error(`Public status list returned HTTP ${listResponse.status}`);
  }
  const list = (await listResponse.json()) as {
    "@context": unknown;
    id: string;
    issuer: string | { id: string };
    credentialSubject: { encodedList: string; statusPurpose: string };
    proof: {
      verificationMethod: string;
      cryptosuite: string;
      proofPurpose: string;
      proofValue: string;
    };
  };

  const keyResponse = await fetch(list.proof.verificationMethod, {
    headers: { accept: "application/ld+json" },
  });
  if (keyResponse.status !== 200) {
    throw new Error(`Public verification method returned HTTP ${keyResponse.status}`);
  }
  const key = (await keyResponse.json()) as {
    id: string;
    controller: string;
    type: string;
    publicKeyMultibase: string;
    keyTrust?: { state?: string };
  };
  if (key.keyTrust?.state === "COMPROMISED") throw new Error("Status list key is compromised");
  const issuer = typeof list.issuer === "string" ? list.issuer : list.issuer.id;
  if (key.id !== list.proof.verificationMethod || key.controller !== issuer) {
    throw new Error("Status list key metadata does not match the proof or issuer");
  }

  const issuerResponse = await fetch(issuer, { headers: { accept: "application/ld+json" } });
  if (issuerResponse.status !== 200) {
    throw new Error(`Issuer profile returned HTTP ${issuerResponse.status}`);
  }
  const issuerProfile = (await issuerResponse.json()) as {
    id: string;
    verificationMethod?: string[];
  };
  if (
    issuerProfile.id !== issuer ||
    !issuerProfile.verificationMethod?.includes(list.proof.verificationMethod)
  ) {
    throw new Error("Issuer profile does not authorize the status-list proof key");
  }

  const suite = new DataIntegrityProof({ cryptosuite });
  const purpose = new jsonldSignatures.purposes.AssertionProofPurpose({
    controller: { id: key.controller, assertionMethod: [key.id] },
  });
  const publicKey = {
    "@context": "https://w3id.org/security/multikey/v1",
    id: key.id,
    type: key.type,
    controller: key.controller,
    publicKeyMultibase: key.publicKeyMultibase,
  };
  const controller = {
    id: key.controller,
    assertionMethod: [key.id],
  };
  const verification = await jsonldSignatures.verify(list, {
    suite,
    purpose,
    documentLoader: async (url: string) => {
      if (url === key.id) return { documentUrl: url, document: publicKey };
      if (url === key.controller) return { documentUrl: url, document: controller };
      return loadAllowlistedDocument(url);
    },
  });
  if (!verification.verified) {
    throw new Error("Status-list Data Integrity proof did not verify");
  }
  if (list.credentialSubject.statusPurpose !== "revocation") {
    throw new Error("Status list purpose is not revocation");
  }

  const revoked = revokedIndexes(list.credentialSubject.encodedList);
  if (expectedRevoked !== null && !revoked.includes(expectedRevoked)) {
    throw new Error(`Expected revoked index ${expectedRevoked} is not set`);
  }
  if (expectedActive !== null && revoked.includes(expectedActive)) {
    throw new Error(`Expected active index ${expectedActive} is revoked`);
  }

  console.log(
    JSON.stringify(
      {
        listUrl,
        id: list.id,
        issuer,
        keyId: key.id,
        proof: list.proof.cryptosuite,
        proofVerified: true,
        revokedIndexes: revoked,
        expectedRevoked,
        expectedActive,
        status: "PASS",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      { status: "FAIL", error: error instanceof Error ? error.message : "Unknown failure" },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
