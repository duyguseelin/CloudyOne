declare module '@noble/ciphers/aes.js' {
  export function gcm(key: Uint8Array, nonce: Uint8Array, AAD?: Uint8Array): {
    encrypt: (plaintext: Uint8Array) => Uint8Array;
    decrypt: (ciphertext: Uint8Array) => Uint8Array;
  };
}
