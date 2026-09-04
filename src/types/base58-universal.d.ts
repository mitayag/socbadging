declare module "base58-universal" {
  export function decode(value: string): Uint8Array;
  export function encode(value: Uint8Array): string;
}
