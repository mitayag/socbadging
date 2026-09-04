import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";

export type GeneratedEd25519KeyPair = {
  privateKeyMultibase: string;
  publicKeyMultibase: string;
  fingerprint: string;
};

export async function generateEd25519KeyPair(): Promise<GeneratedEd25519KeyPair> {
  const keyPair = await Ed25519Multikey.generate();
  const exported = await keyPair.export({
    publicKey: true,
    secretKey: true,
    canonicalize: true,
  });
  if (!exported.publicKeyMultibase || !exported.secretKeyMultibase) {
    throw new Error("Ed25519 key generation failed");
  }

  return {
    privateKeyMultibase: exported.secretKeyMultibase,
    publicKeyMultibase: exported.publicKeyMultibase,
    fingerprint: exported.publicKeyMultibase,
  };
}
