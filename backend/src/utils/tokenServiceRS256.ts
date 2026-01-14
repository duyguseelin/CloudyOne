/**
 * JWT RS256 Token Service - FAZ 7: Asymmetric Signing
 * 
 * Security Advantages over HS256:
 * - Private key ONLY on auth server (signs tokens)
 * - Public key can be shared with microservices (verify tokens)
 * - Key compromise less catastrophic (only verification affected)
 * - Better for distributed systems
 * 
 * Key Generation:
 * ```bash
 * # Generate RSA key pair (4096 bits for maximum security)
 * openssl genrsa -out jwt-private.pem 4096
 * openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
 * 
 * # Store in environment (base64 encoded)
 * export JWT_PRIVATE_KEY=$(cat jwt-private.pem | base64)
 * export JWT_PUBLIC_KEY=$(cat jwt-public.pem | base64)
 * ```
 */

import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Load RSA keys from environment or files
 */
function loadPrivateKey(): string {
  // Production: Load from environment (base64 encoded)
  if (process.env.JWT_PRIVATE_KEY) {
    return Buffer.from(process.env.JWT_PRIVATE_KEY, "base64").toString("utf-8");
  }
  
  // Development: Load from file
  const keyPath = path.join(process.cwd(), "keys", "jwt-private.pem");
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf-8");
  }
  
  // Fallback: Generate ephemeral key (dev only)
  if (NODE_ENV === "development") {
    console.warn("⚠️ WARNING: Using ephemeral RSA key (development only)");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return privateKey;
  }
  
  throw new Error("JWT_PRIVATE_KEY not configured in production");
}

function loadPublicKey(): string {
  // Production: Load from environment (base64 encoded)
  if (process.env.JWT_PUBLIC_KEY) {
    return Buffer.from(process.env.JWT_PUBLIC_KEY, "base64").toString("utf-8");
  }
  
  // Development: Load from file
  const keyPath = path.join(process.cwd(), "keys", "jwt-public.pem");
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf-8");
  }
  
  // Fallback: Derive from private key
  if (process.env.JWT_PRIVATE_KEY || NODE_ENV === "development") {
    const privateKey = loadPrivateKey();
    const publicKey = crypto.createPublicKey(privateKey).export({
      type: "spki",
      format: "pem",
    });
    return publicKey.toString();
  }
  
  throw new Error("JWT_PUBLIC_KEY not configured");
}

// Load keys at module initialization
const PRIVATE_KEY = loadPrivateKey();
const PUBLIC_KEY = loadPublicKey();

// Access token expiry - use literal for TypeScript compatibility
const getAccessTokenExpiry = () => process.env.ACCESS_TOKEN_EXPIRY || "30m";

/**
 * Create Access Token (RS256)
 * Only auth service should call this (requires private key)
 */
export function createAccessTokenRS256(userId: string, role?: string): string {
  const payload = {
    userId,
    role: role || "user",
    iat: Math.floor(Date.now() / 1000),
  };
  
  const options: SignOptions = {
    algorithm: "RS256",
    expiresIn: "30m",
    issuer: "onecloud-auth",
    audience: "onecloud-api",
  };
  
  return jwt.sign(payload, PRIVATE_KEY, options);
}

/**
 * Verify Access Token (RS256)
 * Any service can call this (only needs public key)
 */
export function verifyAccessTokenRS256(token: string): {
  userId: string;
  role: string;
} {
  const options: VerifyOptions = {
    algorithms: ["RS256"],
    issuer: "onecloud-auth",
    audience: "onecloud-api",
  };
  
  const decoded = jwt.verify(token, PUBLIC_KEY, options) as any;
  
  return {
    userId: decoded.userId,
    role: decoded.role || "user",
  };
}

/**
 * Get Public Key (for sharing with microservices)
 */
export function getPublicKey(): string {
  return PUBLIC_KEY;
}

/**
 * Middleware: Verify JWT with RS256
 */
export function verifyRS256Middleware(req: any, res: any, next: any): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  
  const token = authHeader.split(" ")[1];
  
  try {
    const decoded = verifyAccessTokenRS256(token);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error: any) {
    console.error("JWT verification failed:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * Export public key endpoint (for microservices)
 * GET /api/auth/public-key
 */
export function publicKeyEndpoint(req: any, res: any): void {
  res.json({
    algorithm: "RS256",
    publicKey: PUBLIC_KEY,
    keyType: "RSA",
    expiresIn: getAccessTokenExpiry(),
  });
}
// Aliases for compatibility with tokenService.ts
export const createAccessToken = createAccessTokenRS256;
export const verifyAccessToken = verifyAccessTokenRS256;

// Note: Refresh token logic remains same (uses database)
// Import from tokenService.ts for refresh token operations
export { 
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyRefreshToken
} from "./tokenService";