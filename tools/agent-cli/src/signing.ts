import { createHash, randomUUID, sign as signBytes } from "node:crypto";
import type { KeyObject } from "node:crypto";

export const SIGNING_SCHEME = "VYNEMA1";

export const SIGNED_HEADER_NAMES = [
  "x-vynema-agent-id",
  "x-vynema-key-id",
  "x-vynema-timestamp",
  "x-vynema-nonce",
  "x-vynema-content-sha256",
  "x-vynema-signature",
] as const;

export type SignedHeaders = Record<(typeof SIGNED_HEADER_NAMES)[number], string>;

export interface CanonicalStringParts {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
  agentId: string;
  keyId: string;
}

export interface BuildSignedHeadersInput {
  method: string;
  path: string;
  body: string | Uint8Array;
  agentId: string;
  keyId: string;
  privateKey: KeyObject;
  now?: number;
  nonce?: string;
}

function assertLiteralValue(name: string, value: string, maxLength?: number): void {
  if (value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} must be a non-empty single-line value.`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(`${name} must be at most ${maxLength} characters.`);
  }
}

function normalizeMethod(method: string): string {
  if (!/^[A-Za-z]+$/.test(method)) {
    throw new Error("Method must contain ASCII letters only.");
  }
  return method.toUpperCase();
}

function assertCanonicalPath(path: string): void {
  assertLiteralValue("Path with query", path);

  if (!path.startsWith("/api/") || path.includes("#")) {
    throw new Error(
      "Path with query must start with /api/ and must not contain an origin or fragment.",
    );
  }
}

function assertTimestamp(timestamp: string): void {
  if (!/^\d{1,12}$/.test(timestamp)) {
    throw new Error("Timestamp must be a 1-12 digit Unix-seconds value.");
  }
}

function assertKeyId(keyId: string): void {
  if (!/^[0-9a-f]{16}$/.test(keyId)) {
    throw new Error("Key ID must be exactly 16 lowercase hexadecimal characters.");
  }
}

function bodyBytes(body: string | Uint8Array): Buffer {
  return typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
}

export function sha256Hex(body: string | Uint8Array): string {
  return createHash("sha256").update(bodyBytes(body)).digest("hex");
}

export function buildCanonicalString(parts: CanonicalStringParts): string {
  const method = normalizeMethod(parts.method);
  assertCanonicalPath(parts.path);
  assertTimestamp(parts.timestamp);
  assertLiteralValue("Nonce", parts.nonce, 64);
  assertLiteralValue("Agent ID", parts.agentId);
  assertKeyId(parts.keyId);

  if (!/^[0-9a-f]{64}$/.test(parts.bodySha256)) {
    throw new Error("Body SHA-256 must be exactly 64 lowercase hexadecimal characters.");
  }

  return [
    SIGNING_SCHEME,
    method,
    parts.path,
    parts.timestamp,
    parts.nonce,
    parts.bodySha256,
    parts.agentId,
    parts.keyId,
  ].join("\n");
}

export function buildSignedHeaders(input: BuildSignedHeadersInput): SignedHeaders {
  if (input.privateKey.type !== "private" || input.privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Signing requires an Ed25519 private key.");
  }

  const timestampNumber = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampNumber) || timestampNumber < 0) {
    throw new Error("Signing time must be a non-negative integer number of Unix seconds.");
  }

  const timestamp = String(timestampNumber);
  const nonce = input.nonce ?? randomUUID();
  const contentSha256 = sha256Hex(input.body);
  const canonicalString = buildCanonicalString({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    bodySha256: contentSha256,
    agentId: input.agentId,
    keyId: input.keyId,
  });
  const signature = signBytes(
    null,
    Buffer.from(canonicalString, "utf8"),
    input.privateKey,
  ).toString("base64");

  return {
    "x-vynema-agent-id": input.agentId,
    "x-vynema-key-id": input.keyId,
    "x-vynema-timestamp": timestamp,
    "x-vynema-nonce": nonce,
    "x-vynema-content-sha256": contentSha256,
    "x-vynema-signature": signature,
  };
}
