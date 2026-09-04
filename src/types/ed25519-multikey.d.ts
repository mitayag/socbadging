declare module "@digitalbazaar/ed25519-multikey" {
  type MultikeyExport = {
    publicKeyMultibase?: string;
    secretKeyMultibase?: string;
  };

  type Multikey = {
    export(options: {
      publicKey: boolean;
      secretKey?: boolean;
      canonicalize?: boolean;
    }): Promise<MultikeyExport>;
    signer(): {
      sign(options: { data: Uint8Array }): Promise<Uint8Array>;
    };
    verifier(): {
      verify(options: { data: Uint8Array; signature: Uint8Array }): Promise<boolean>;
    };
  };

  export function from(key: {
    "@context"?: string;
    id?: string;
    type: "Multikey";
    publicKeyMultibase: string;
    secretKeyMultibase?: string;
  }): Promise<Multikey>;
  export function generate(): Promise<Multikey>;
}
