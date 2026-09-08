import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";
import {
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  getKeyFileSecurityOperations,
  type KeyFileSecurityOperations,
  type KeyPathSecurityStats,
} from "./internal/key-file-security.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export const PRIVATE_KEY_FILENAME = "agent-key.pem";
export const PUBLIC_KEY_FILENAME = "agent-key.pub.pem";

const WINDOWS_PRIVATE_KEY_ERROR =
  "Private-key operations are unavailable on Windows because restrictive ACLs cannot be established and verified.";

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
  let current = resolveThroughExistingAncestor(startPath);

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

function assertPrivateKeyPlatform(): void {
  if (process.platform === "win32") {
    throw new Error(WINDOWS_PRIVATE_KEY_ERROR);
  }
}

function assertSecureKeyDirectory(
  directoryPath: string,
  operations: KeyFileSecurityOperations,
): void {
  const directory = operations.lstatSync(directoryPath);
  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    throw new Error("Key output path must resolve to a real directory.");
  }
  if ((directory.mode & 0o777) !== 0o700) {
    throw new Error("Key output directory permissions could not be verified as mode 0700.");
  }
}

interface KeyFileIdentity {
  dev: number;
  ino: number;
}

interface TrackedGeneratedKeyFile {
  created: boolean;
  expectedMode: number;
  fileDescriptor?: number;
  identity?: KeyFileIdentity;
  path: string;
}

interface KeyCleanupResult {
  additionalLinksMayRemain: boolean;
  errors: unknown[];
  incompletePaths: string[];
  openDescriptorsMayRemain: boolean;
}

const EXCLUSIVE_KEY_FILE_FLAGS =
  constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW;

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isExistingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown key generation failure.";
  return message.replace(/[\r\n]+/g, " ");
}

function getFileIdentity(stats: KeyPathSecurityStats): KeyFileIdentity {
  if (!Number.isSafeInteger(stats.dev) || !Number.isSafeInteger(stats.ino)) {
    throw new Error("Generated key file identity could not be verified.");
  }
  return { dev: stats.dev, ino: stats.ino };
}

function hasSameIdentity(stats: KeyPathSecurityStats, identity: KeyFileIdentity): boolean {
  return stats.dev === identity.dev && stats.ino === identity.ino;
}

function assertRegularSingleLink(stats: KeyPathSecurityStats, label: string): void {
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} is not a regular file.`);
  }
  if (stats.nlink !== 1) {
    throw new Error(`${label} must have exactly one filesystem link.`);
  }
}

function reserveGeneratedKeyFile(
  file: TrackedGeneratedKeyFile,
  operations: KeyFileSecurityOperations,
): void {
  try {
    file.fileDescriptor = operations.openSync(
      file.path,
      EXCLUSIVE_KEY_FILE_FLAGS,
      file.expectedMode,
    );
    file.created = true;
  } catch (error) {
    if (isExistingPathError(error)) {
      throw new Error("Refusing to overwrite an existing agent key file.", { cause: error });
    }
    throw error;
  }

  const descriptor = operations.fstatSync(file.fileDescriptor);
  file.identity = getFileIdentity(descriptor);
  assertRegularSingleLink(descriptor, "Generated key file descriptor");
}

function getGeneratedKeyFileDescriptor(file: TrackedGeneratedKeyFile): number {
  if (file.fileDescriptor === undefined) {
    throw new Error("Generated key file descriptor is unavailable.");
  }
  return file.fileDescriptor;
}

function assertGeneratedKeyDescriptorSecure(
  file: TrackedGeneratedKeyFile,
  operations: KeyFileSecurityOperations,
  expectedSize?: number,
): void {
  if (file.fileDescriptor === undefined || file.identity === undefined) {
    throw new Error("Generated key file descriptor identity is unavailable.");
  }

  const descriptor = operations.fstatSync(file.fileDescriptor);
  assertRegularSingleLink(descriptor, "Generated key file descriptor");
  if (!hasSameIdentity(descriptor, file.identity)) {
    throw new Error("Generated key file descriptor identity changed unexpectedly.");
  }
  if ((descriptor.mode & 0o777) !== file.expectedMode) {
    throw new Error(
      `Generated key file permissions could not be verified as mode ${file.expectedMode.toString(8).padStart(4, "0")}.`,
    );
  }
  if (expectedSize !== undefined && descriptor.size !== expectedSize) {
    throw new Error("Generated key file contents could not be verified as complete.");
  }
}

function assertGeneratedKeyPathSecure(
  file: TrackedGeneratedKeyFile,
  operations: KeyFileSecurityOperations,
  expectedSize: number,
): void {
  if (file.identity === undefined) {
    throw new Error("Generated key file path identity is unavailable.");
  }

  const pathStats = operations.lstatSync(file.path);
  assertRegularSingleLink(pathStats, "Generated key path");
  if (!hasSameIdentity(pathStats, file.identity)) {
    throw new Error("Generated key path no longer references the reserved file.");
  }
  if ((pathStats.mode & 0o777) !== file.expectedMode) {
    throw new Error(
      `Generated key file permissions could not be verified as mode ${file.expectedMode.toString(8).padStart(4, "0")}.`,
    );
  }
  if (pathStats.size !== expectedSize) {
    throw new Error("Generated key path contents could not be verified as complete.");
  }
}

function closeGeneratedKeyFile(
  file: TrackedGeneratedKeyFile,
  operations: KeyFileSecurityOperations,
): void {
  if (file.fileDescriptor === undefined) {
    return;
  }
  operations.closeSync(file.fileDescriptor);
  file.fileDescriptor = undefined;
}

function cleanupGeneratedKeyFiles(
  files: readonly TrackedGeneratedKeyFile[],
  operations: KeyFileSecurityOperations,
): KeyCleanupResult {
  const errors: unknown[] = [];
  const incompletePaths = new Set<string>();
  let additionalLinksMayRemain = false;
  let openDescriptorsMayRemain = false;

  for (const file of files) {
    if (!file.created || file.fileDescriptor === undefined) {
      continue;
    }

    if (file.identity === undefined) {
      try {
        file.identity = getFileIdentity(operations.fstatSync(file.fileDescriptor));
      } catch {
        // The path is handled conservatively below when descriptor identity is unavailable.
      }
    }

    try {
      closeGeneratedKeyFile(file, operations);
    } catch (error) {
      errors.push(error);
      incompletePaths.add(file.path);
      openDescriptorsMayRemain = true;
    }
  }

  for (const file of files) {
    if (!file.created) {
      continue;
    }

    let pathStats: KeyPathSecurityStats;
    try {
      pathStats = operations.lstatSync(file.path);
    } catch (error) {
      if (isMissingPathError(error)) {
        continue;
      }
      errors.push(error);
      incompletePaths.add(file.path);
      continue;
    }

    if (file.identity === undefined) {
      errors.push(new Error(`Cannot verify ownership of generated key artifact: ${file.path}`));
      incompletePaths.add(file.path);
      continue;
    }

    if (!hasSameIdentity(pathStats, file.identity)) {
      errors.push(new Error(`Generated key path was replaced before cleanup: ${file.path}`));
      incompletePaths.add(file.path);
      continue;
    }

    if (pathStats.nlink > 1) {
      additionalLinksMayRemain = true;
      errors.push(
        new Error(`Generated key artifact has additional filesystem links: ${file.path}`),
      );
      incompletePaths.add(file.path);
    }

    try {
      operations.unlinkSync(file.path);
    } catch (error) {
      errors.push(error);
      incompletePaths.add(file.path);
      continue;
    }

    try {
      operations.lstatSync(file.path);
      errors.push(new Error(`Generated key artifact remained after cleanup: ${file.path}`));
      incompletePaths.add(file.path);
    } catch (error) {
      if (!isMissingPathError(error)) {
        errors.push(error);
        incompletePaths.add(file.path);
      }
    }
  }

  return {
    additionalLinksMayRemain,
    errors,
    incompletePaths: [...incompletePaths],
    openDescriptorsMayRemain,
  };
}

function throwAfterGeneratedKeyCleanup(
  originalError: unknown,
  files: readonly TrackedGeneratedKeyFile[],
  operations: KeyFileSecurityOperations,
): never {
  const cleanup = cleanupGeneratedKeyFiles(files, operations);

  if (cleanup.errors.length > 0) {
    const hardLinkWarning = cleanup.additionalLinksMayRemain
      ? " Hard-link warning: additional filesystem links may retain generated key material."
      : "";
    const descriptorWarning = cleanup.openDescriptorsMayRemain
      ? " Open key file descriptors may remain; terminate this process before inspecting or removing residual artifacts."
      : "";
    throw new AggregateError(
      [originalError, ...cleanup.errors],
      `Key generation failed: ${errorMessage(originalError)} Cleanup was incomplete for ${cleanup.incompletePaths.join(", ")}. Private key material may remain.${hardLinkWarning}${descriptorWarning} Manually inspect and remove the affected paths before retrying.`,
      { cause: originalError },
    );
  }

  throw originalError;
}

export function loadEd25519PrivateKey(privateKeyPath: string): KeyObject {
  assertPrivateKeyPlatform();

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

  if ((file.mode & 0o077) !== 0) {
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
  assertPrivateKeyPlatform();
  const operations = getKeyFileSecurityOperations();

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
  const directory = operations.lstatSync(resolvedDirectory);

  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    throw new Error("Key output path must be a directory.");
  }

  if (directoryExisted && (directory.mode & 0o077) !== 0) {
    throw new Error("Key output directory must not grant group or other access (use mode 0700).");
  }
  operations.chmodSync(resolvedDirectory, 0o700);
  assertSecureKeyDirectory(resolvedDirectory, operations);

  const privateKeyFile: TrackedGeneratedKeyFile = {
    created: false,
    expectedMode: 0o600,
    path: join(resolvedDirectory, PRIVATE_KEY_FILENAME),
  };
  const publicKeyFile: TrackedGeneratedKeyFile = {
    created: false,
    expectedMode: 0o644,
    path: join(resolvedDirectory, PUBLIC_KEY_FILENAME),
  };
  const generatedFiles = [privateKeyFile, publicKeyFile];

  let publicKey: KeyObject;
  try {
    reserveGeneratedKeyFile(privateKeyFile, operations);
    reserveGeneratedKeyFile(publicKeyFile, operations);

    operations.fchmodSync(
      getGeneratedKeyFileDescriptor(privateKeyFile),
      privateKeyFile.expectedMode,
    );
    assertGeneratedKeyDescriptorSecure(privateKeyFile, operations);
    operations.fchmodSync(getGeneratedKeyFileDescriptor(publicKeyFile), publicKeyFile.expectedMode);
    assertGeneratedKeyDescriptorSecure(publicKeyFile, operations);
    assertSecureKeyDirectory(resolvedDirectory, operations);

    const generated = generateKeyPairSync("ed25519");
    publicKey = generated.publicKey;
    const privateKeyPem = generated.privateKey.export({ format: "pem", type: "pkcs8" });
    const publicKeyPem = generated.publicKey.export({ format: "pem", type: "spki" });
    const privateKeySize = Buffer.byteLength(privateKeyPem);
    const publicKeySize = Buffer.byteLength(publicKeyPem);

    operations.writeFileSync(getGeneratedKeyFileDescriptor(publicKeyFile), publicKeyPem);
    operations.writeFileSync(getGeneratedKeyFileDescriptor(privateKeyFile), privateKeyPem);

    assertGeneratedKeyDescriptorSecure(privateKeyFile, operations, privateKeySize);
    assertGeneratedKeyDescriptorSecure(publicKeyFile, operations, publicKeySize);
    assertGeneratedKeyPathSecure(privateKeyFile, operations, privateKeySize);
    assertGeneratedKeyPathSecure(publicKeyFile, operations, publicKeySize);
    assertSecureKeyDirectory(resolvedDirectory, operations);

    closeGeneratedKeyFile(privateKeyFile, operations);
    closeGeneratedKeyFile(publicKeyFile, operations);
    assertGeneratedKeyPathSecure(privateKeyFile, operations, privateKeySize);
    assertGeneratedKeyPathSecure(publicKeyFile, operations, publicKeySize);
  } catch (error) {
    throwAfterGeneratedKeyCleanup(error, generatedFiles, operations);
  }

  return {
    ...getPublicKeyIdentity(publicKey),
    privateKeyPath: privateKeyFile.path,
    publicKeyPath: publicKeyFile.path,
  };
}
