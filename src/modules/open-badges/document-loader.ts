import bitstringStatusListContext from "./contexts/bitstring-status-list-v1.json";
import dataIntegrityContext from "./contexts/data-integrity-v2.json";
import multikeyContext from "./contexts/multikey-v1.json";
import openBadgesContext from "./contexts/open-badges-3.0.3.json";
import openBadgesExtensionsContext from "./contexts/open-badges-extensions.json";
import vcV2Context from "./contexts/vc-v2.json";

// Official source SHA-256 values reviewed 2026-08-25, in URL order below.
// The checked-in JSON is semantically identical; patch application normalizes
// line endings and terminal newlines, so it has its own recorded digest in the task report.
// 59955ced6697d61e03f2b2556febe5308ab16842846f5b586d7f1f7adec92734
// 3d34f4d4ef1bce691106e63798beb5e7b862ba841423f5ee1e53ab7ddf3bca84
// 87c06c81bc2317663bf288d740d94fddd2818c4342b186270ff6371dfaa63f93
// 67f21e6e33a6c14e5ccfd2fc7865f7474fb71a04af7e94136cb399dfac8ae8f4
// ba2c182de2d92f7e47184bcca8fcf0beaee6d3986c527bf664c195bbc7c58597
// fda5add353231e6a6884a46b12e6c75464281900cb348284d9c360f62381d9f7
const reviewedDocuments = new Map<string, unknown>([
  ["https://www.w3.org/ns/credentials/v2", vcV2Context],
  ["https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json", openBadgesContext],
  ["https://purl.imsglobal.org/spec/ob/v3p0/extensions.json", openBadgesExtensionsContext],
  ["https://w3id.org/security/data-integrity/v2", dataIntegrityContext],
  ["https://w3id.org/security/multikey/v1", multikeyContext],
  ["https://www.w3.org/ns/credentials/status/v1", bitstringStatusListContext],
]);

export async function loadAllowlistedDocument(
  url: string,
): Promise<{ documentUrl: string; document: unknown }> {
  const document = reviewedDocuments.get(url);

  if (!document) {
    throw new Error("JSON-LD context is not allowlisted");
  }

  return { documentUrl: url, document };
}
