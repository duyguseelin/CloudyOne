declare module 'expo-crypto' {
  /**
   * Crypto digest algorithms
   */
  export enum CryptoDigestAlgorithm {
    SHA1 = 'SHA-1',
    SHA256 = 'SHA-256',
    SHA384 = 'SHA-384',
    SHA512 = 'SHA-512',
    MD5 = 'MD5',
  }

  /**
   * Crypto encoding formats
   */
  export enum CryptoEncoding {
    HEX = 'hex',
    BASE64 = 'base64',
  }

  /**
   * Options for digest functions
   */
  export interface DigestOptions {
    encoding?: CryptoEncoding;
  }

  /**
   * Generate cryptographically secure random bytes
   * @param byteCount Number of random bytes to generate
   * @returns Uint8Array of random bytes
   */
  export function getRandomBytes(byteCount: number): Uint8Array;

  /**
   * Generate cryptographically secure random values into existing Uint8Array
   * @param array Uint8Array to fill with random values
   * @returns The same Uint8Array filled with random values
   */
  export function getRandomValues<T extends Uint8Array>(array: T): T;

  /**
   * Generate a digest (hash) of the provided data
   * @param algorithm Hash algorithm to use
   * @param data Data to hash (string or Uint8Array)
   * @param options Optional encoding options
   * @returns Promise that resolves to the hash digest
   */
  export function digest(
    algorithm: CryptoDigestAlgorithm | string,
    data: string | Uint8Array,
    options?: DigestOptions
  ): Promise<string>;

  /**
   * Generate a digest (hash) of a string
   * @param algorithm Hash algorithm to use
   * @param data String to hash
   * @param options Optional encoding options
   * @returns Promise that resolves to the hash digest
   */
  export function digestStringAsync(
    algorithm: CryptoDigestAlgorithm | string,
    data: string,
    options?: DigestOptions
  ): Promise<string>;
}
