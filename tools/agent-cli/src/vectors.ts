import { randomUUID, verify as verifyBytes } from "node:crypto";
import type { KeyObject } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  assertPathOutsideRepository,
  deriveKeyIdFromSpki,
  getPublicKeyIdentityFromPrivateKey,
  importEd25519PublicKey,
  loadEd25519PrivateKey,
} from "./keys.js";
import { buildCanonicalString, buildSignedHeaders, sha256Hex } from "./signing.js";

export const DEFAULT_VECTOR_PATH = "docs/agents/signing-test-vectors.json";
export const VECTOR_AGENT_ID = "agt_testvector01";
export const VECTOR_TIMESTAMP = "1750000000";
export const VECTOR_NONCE = "00000000-0000-4000-8000-000000000001";

export const FIXED_VECTOR_CASES = [
  {
    name: "empty-body-get",
    method: "GET",
    path: "/api/agent/videos/vid_testvector01?include=processing",
    body: "",
  },
  {
    name: "json-body-post",
    method: "POST",
    path: "/api/agent/upload-intents",
    body: '{"channelId":"chn_testvector01","title":"Canonical signing vector"}',
  },
  {
    name: "finalize-post",
    method: "POST",
    path: "/api/agent/upload-intents/int_testvector01/finalize",
    body: "{}",
  },
] as const;

const VECTOR_FIELDS = [
  "name",
  "method",
  "path",
  "body",
  "timestamp",
  "nonce",
  "agentId",
  "keyId",
  "bodySha256",
  "canonicalString",
  "signature",
  "publicKeySpkiBase64",
] as const;

export interface SigningVector {
  name: string;
  method: string;
  path: string;
  body: string;
  timestamp: string;
  nonce: string;
  agentId: string;
  keyId: string;
  bodySha256: string;
  canonicalString: string;
  signature: string;
  publicKeySpkiBase64: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  record: Record<string, unknown>,
  field: (typeof VECTOR_FIELDS)[number],
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Signing vector field ${field} must be a string.`);
  }
  return value;
}

function parseVector(value: unknown): SigningVector {
  if (!isRecord(value)) {
    throw new Error("Each signing vector must be an object.");
  }

  const actualFields = Object.keys(value).sort();
  const expectedFields = [...VECTOR_FIELDS].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw new Error("Signing vector objects must contain exactly the documented fields.");
  }

  return {
    name: readStringField(value, "name"),
    method: readStringField(value, "method"),
    path: readStringField(value, "path"),
    body: readStringField(value, "body"),
    timestamp: readStringField(value, "timestamp"),
    nonce: readStringField(value, "nonce"),
    agentId: readStringField(value, "agentId"),
    keyId: readStringField(value, "keyId"),
    bodySha256: readStringField(value, "bodySha256"),
    canonicalString: readStringField(value, "canonicalString"),
    signature: readStringField(value, "signature"),
    publicKeySpkiBase64: readStringField(value, "publicKeySpkiBase64"),
  };
}

function decodeCanonicalBase64(value: string, expectedBytes: number, label: string): Buffer {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error(`${label} must use standard padded base64 encoding.`);
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== expectedBytes || decoded.toString("base64") !== value) {
    throw new Error(`${label} has an invalid byte length or non-canonical encoding.`);
  }
  return decoded;
}

function verifyVector(
  vector: SigningVector,
  expectedCase: (typeof FIXED_VECTOR_CASES)[number],
): void {
  if (
    vector.name !== expectedCase.name ||
    vector.method !== expectedCase.method ||
    vector.path !== expectedCase.path ||
    vector.body !== expectedCase.body ||
    vector.timestamp !== VECTOR_TIMESTAMP ||
    vector.nonce !== VECTOR_NONCE ||
    vector.agentId !== VECTOR_AGENT_ID
  ) {
    throw new Error(`Signing vector ${expectedCase.name} does not match its fixed public inputs.`);
  }

  if (!/^[0-9a-f]{16}$/.test(vector.keyId)) {
    throw new Error(`Signing vector ${vector.name} has an invalid key ID encoding.`);
  }

  if (!/^[0-9a-f]{64}$/.test(vector.bodySha256)) {
    throw new Error(`Signing vector ${vector.name} has an invalid body hash encoding.`);
  }

  const expectedBodySha256 = sha256Hex(vector.body);
  if (vector.bodySha256 !== expectedBodySha256) {
    throw new Error(
      `Signing vector ${vector.name} body hash does not match its exact UTF-8 body bytes.`,
    );
  }

  const expectedCanonicalString = buildCanonicalString({
    method: vector.method,
    path: vector.path,
    timestamp: vector.timestamp,
    nonce: vector.nonce,
    bodySha256: vector.bodySha256,
    agentId: vector.agentId,
    keyId: vector.keyId,
  });
  if (vector.canonicalString !== expectedCanonicalString) {
    throw new Error(
      `Signing vector ${vector.name} canonical bytes do not match the VYNEMA1 contract.`,
    );
  }

  const publicKeyDer = decodeCanonicalBase64(
    vector.publicKeySpkiBase64,
    44,
    `Signing vector ${vector.name} public key`,
  );
  if (deriveKeyIdFromSpki(publicKeyDer) !== vector.keyId) {
    throw new Error(
      `Signing vector ${vector.name} key ID does not match its raw public key bytes.`,
    );
  }

  const signature = decodeCanonicalBase64(
    vector.signature,
    64,
    `Signing vector ${vector.name} signature`,
  );
  const publicKey = importEd25519PublicKey(publicKeyDer);
  if (!verifyBytes(null, Buffer.from(vector.canonicalString, "utf8"), publicKey, signature)) {
    throw new Error(`Signing vector ${vector.name} signature verification failed.`);
  }
}

export function validateSigningVectors(value: unknown): SigningVector[] {
  if (!Array.isArray(value) || value.length !== FIXED_VECTOR_CASES.length) {
    throw new Error(
      `Signing vector artifact must contain exactly ${FIXED_VECTOR_CASES.length} entries.`,
    );
  }

  const vectors = value.map(parseVector);
  const uniqueNames = new Set(vectors.map((vector) => vector.name));
  if (uniqueNames.size !== vectors.length) {
    throw new Error("Signing vector names must be unique.");
  }

  vectors.forEach((vector, index) => {
    const expectedCase = FIXED_VECTOR_CASES[index];
    if (!expectedCase) {
      throw new Error("Signing vector case order is invalid.");
    }
    verifyVector(vector, expectedCase);
  });

  const firstVector = vectors[0];
  if (!firstVector) {
    throw new Error("Signing vector artifact is empty.");
  }
  if (
    vectors.some(
      (vector) =>
        vector.keyId !== firstVector.keyId ||
        vector.publicKeySpkiBase64 !== firstVector.publicKeySpkiBase64,
    )
  ) {
    throw new Error("All signing vectors must use the same reviewed public key identity.");
  }

  return vectors;
}

export function readAndValidateSigningVectors(vectorPath: string): SigningVector[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(vectorPath, "utf8")) as unknown;
  } catch {
    throw new Error("Unable to read the signing vector artifact as JSON.");
  }
  return validateSigningVectors(parsed);
}

export function generateSigningVectors(privateKey: KeyObject): SigningVector[] {
  const identity = getPublicKeyIdentityFromPrivateKey(privateKey);

  const vectors = FIXED_VECTOR_CASES.map((vectorCase) => {
    const headers = buildSignedHeaders({
      method: vectorCase.method,
      path: vectorCase.path,
      body: vectorCase.body,
      agentId: VECTOR_AGENT_ID,
      keyId: identity.keyId,
      privateKey,
      now: Number(VECTOR_TIMESTAMP),
      nonce: VECTOR_NONCE,
    });
    const bodySha256 = headers["x-vynema-content-sha256"];

    return {
      ...vectorCase,
      timestamp: VECTOR_TIMESTAMP,
      nonce: VECTOR_NONCE,
      agentId: VECTOR_AGENT_ID,
      keyId: identity.keyId,
      bodySha256,
      canonicalString: buildCanonicalString({
        method: vectorCase.method,
        path: vectorCase.path,
        timestamp: VECTOR_TIMESTAMP,
        nonce: VECTOR_NONCE,
        bodySha256,
        agentId: VECTOR_AGENT_ID,
        keyId: identity.keyId,
      }),
      signature: headers["x-vynema-signature"],
      publicKeySpkiBase64: identity.publicKeySpkiBase64,
    } satisfies SigningVector;
  });

  return validateSigningVectors(vectors);
}

export function serializeSigningVectors(vectors: readonly SigningVector[]): string {
  validateSigningVectors(vectors);
  return `${JSON.stringify(vectors, null, 2)}\n`;
}

function writePublicArtifactAtomically(outputPath: string, content: string): void {
  const outputDirectory = dirname(resolve(outputPath));
  mkdirSync(outputDirectory, { recursive: true });
  const resolvedOutputPath = join(realpathSync(outputDirectory), basename(outputPath));
  const temporaryPath = join(
    dirname(resolvedOutputPath),
    `.${basename(resolvedOutputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: 0o644 });
  try {
    renameSync(temporaryPath, resolvedOutputPath);
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
}

export function generateSigningVectorFile(options: {
  privateKeyPath: string;
  outputPath: string;
  repositoryRoot: string;
}): SigningVector[] {
  assertPathOutsideRepository(options.privateKeyPath, options.repositoryRoot, "Vector private key");

  let resolvedPrivateKeyPath: string;
  try {
    resolvedPrivateKeyPath = realpathSync(options.privateKeyPath);
  } catch {
    throw new Error("Unable to access the external vector private key.");
  }
  if (
    existsSync(options.outputPath) &&
    realpathSync(options.outputPath) === resolvedPrivateKeyPath
  ) {
    throw new Error("Public vector output must not replace the private key file.");
  }

  const privateKey = loadEd25519PrivateKey(resolvedPrivateKeyPath);
  const vectors = generateSigningVectors(privateKey);
  writePublicArtifactAtomically(options.outputPath, serializeSigningVectors(vectors));
  return vectors;
}
