declare module "@digitalbazaar/data-integrity" {
  export class DataIntegrityProof {
    constructor(options: { cryptosuite: object; signer?: object });
  }
}

declare module "@digitalbazaar/eddsa-rdfc-2022-cryptosuite" {
  export const cryptosuite: object;
}
