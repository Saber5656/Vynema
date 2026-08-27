import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export const PRIVATE_KEY_FILENAME = "agent-key.pem";
export const PUBLIC_KEY_FILENAME = "agent-key.pub.pem";

export interface PublicKeyIdentity {
  keyId: string;
  publicKeySpkiBase64: string;
}

export interface GeneratedAgentKeyPair extends PublicKeyIdentity {
  privateKeyPath: string;
  publicKeyPath: string;
}

function assertEd25519Key(key: KeyObject, expectedType: "private" | "public"): void {
  if (key.type !== expectedType || key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected an Ed25519 ${expectedType} key.`);
  }
}

function exportPublicKeyDer(publicKey: KeyObject): Buffer {
  assertEd25519Key(publicKey, "public");
  const exported = publicKey.export({ format: "der", type: "spki" });
  return Buffer.isBuffer(exported) ? exported : Buffer.from(exported);
}

export function extractRawEd25519PublicKey(spkiDer: Uint8Array): Buffer {
  const der = Buffer.from(spkiDer);

  if (
    der.length !== 44 ||
    !der.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    throw new Error("Expected a canonical 44-byte Ed25519 SPKI public key.");
  }

  return der.subarray(ED25519_SPKI_PREFIX.length);
}

export function deriveKeyIdFromSpki(spkiDer: Uint8Array): string {
  const rawPublicKey = extractRawEd25519PublicKey(spkiDer);
  return createHash("sha256").update(rawPublicKey).digest("hex").slice(0, 16);
}

export function getPublicKeyIdentity(publicKey: KeyObject): PublicKeyIdentity {
  const spkiDer = exportPublicKeyDer(publicKey);

  return {
    keyId: deriveKeyIdFromSpki(spkiDer),
    publicKeySpkiBase64: spkiDer.toString("base64"),
  };
}

export function getPublicKeyIdentityFromPrivateKey(privateKey: KeyObject): PublicKeyIdentity {
  assertEd25519Key(privateKey, "private");
  return getPublicKeyIdentity(createPublicKey(privateKey));
}

export function importEd25519PublicKey(spkiDer: Uint8Array): KeyObject {
  extractRawEd25519PublicKey(spkiDer);
  const publicKey = createPublicKey({ key: Buffer.from(spkiDer), format: "der", type: "spki" });
  assertEd25519Key(publicKey, "public");
  return publicKey;
}

function resolveThroughExistingAncestor(candidatePath: string): string {
  let current = resolve(candidatePath);
  const missingSegments: string[] = [];

  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    missingSegments.unshift(basename(current));
    current = parent;
  }

  const resolvedAncestor = realpathSync(current);
  return resolve(resolvedAncestor, ...missingSegments);
}

export function findRepositoryRoot(startPath: string): string | undefined {
  let current = resolve(startPath);

  if (existsSync(current) && !statSync(current).isDirectory()) {
    current = dirname(current);
  }

  while (current !== dirname(current)) {
    if (existsSync(join(current, ".git"))) {
      return realpathSync(current);
    }

    current = dirname(current);
  }

  if (existsSync(join(current, ".git"))) {
    return realpathSync(current);
  }
  return undefined;
}

export function assertPathOutsideRepository(
  candidatePath: string,
  repositoryRoot: string,
  label: string,
): void {
  const resolvedRepository = realpathSync(repositoryRoot);
  const resolvedCandidate = resolveThroughExistingAncestor(candidatePath);
  const fromRepository = relative(resolvedRepository, resolvedCandidate);
  const isInsideRepository =
    fromRepository === "" || (fromRepository !== ".." && !fromRepository.startsWith(`..${sep}`));

  if (isInsideRepository) {
    throw new Error(`${label} must be outside the repository checkout.`);
  }
}

export function loadEd25519PrivateKey(privateKeyPath: string): KeyObject {
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(privateKeyPath);
  } catch {
    throw new Error("Unable to access the private key file.");
  }

  const file = lstatSync(resolvedPath);

  if (!file.isFile()) {
    throw new Error("Private key path must reference a regular file.");
  }

  if (process.platform !== "win32" && (file.mode & 0o077) !== 0) {
    throw new Error(
      "Private key permissions must not grant group or other access (use mode 0600).",
    );
  }

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(readFileSync(resolvedPath));
  } catch {
    throw new Error("Unable to load the Ed25519 private key.");
  }

  assertEd25519Key(privateKey, "private");
  return privateKey;
}

export function generateAgentKeyFiles(
  outputDirectory: string,
  repositoryRoot?: string,
): GeneratedAgentKeyPair {
  const containingRepository = findRepositoryRoot(outputDirectory);
  if (containingRepository) {
    assertPathOutsideRepository(outputDirectory, containingRepository, "Key output directory");
  }

  if (repositoryRoot) {
    assertPathOutsideRepository(outputDirectory, repositoryRoot, "Key output directory");
  }

  const directoryExisted = existsSync(outputDirectory);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const resolvedDirectory = realpathSync(outputDirectory);
  const directory = statSync(resolvedDirectory);

  if (!directory.isDirectory()) {
    throw new Error("Key output path must be a directory.");
  }

  if (process.platform !== "win32") {
    if (directoryExisted && (directory.mode & 0o077) !== 0) {
      throw new Error("Key output directory must not grant group or other access (use mode 0700).");
    }
    chmodSync(resolvedDirectory, 0o700);
  }

  const privateKeyPath = join(resolvedDirectory, PRIVATE_KEY_FILENAME);
  const publicKeyPath = join(resolvedDirectory, PUBLIC_KEY_FILENAME);

  if (existsSync(privateKeyPath) || existsSync(publicKeyPath)) {
    throw new Error("Refusing to overwrite an existing agent key file.");
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });

  writeFileSync(privateKeyPath, privateKeyPem, { flag: "wx", mode: 0o600 });
  try {
    writeFileSync(publicKeyPath, publicKeyPem, { flag: "wx", mode: 0o644 });
  } catch (error) {
    unlinkSync(privateKeyPath);
    throw error;
  }

  if (process.platform !== "win32") {
    chmodSync(privateKeyPath, 0o600);
  }

  return {
    ...getPublicKeyIdentity(publicKey),
    privateKeyPath,
    publicKeyPath,
  };
}
