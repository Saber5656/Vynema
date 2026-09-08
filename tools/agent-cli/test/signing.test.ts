import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, verify as verifyBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { isCliEntryPoint, runCli, type CliIo } from "../src/cli.js";
import {
  installKeyFileSecurityOperationsForTest,
  type KeyFileSecurityOperations,
} from "../src/internal/key-file-security.js";
import {
  assertPathOutsideRepository,
  deriveKeyIdFromSpki,
  findRepositoryRoot,
  generateAgentKeyFiles,
  getPublicKeyIdentity,
  getPublicKeyIdentityFromPrivateKey,
  importEd25519PublicKey,
  loadEd25519PrivateKey,
  PRIVATE_KEY_FILENAME,
  PUBLIC_KEY_FILENAME,
} from "../src/keys.js";
import {
  buildCanonicalString,
  buildSignedHeaders,
  sha256Hex,
  SIGNED_HEADER_NAMES,
} from "../src/signing.js";
import {
  generateSigningVectorFile,
  generateSigningVectors,
  readAndValidateSigningVectors,
  serializeSigningVectors,
  validateSigningVectors,
  type SigningVector,
} from "../src/vectors.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const committedVectorPath = join(repositoryRoot, "docs/agents/signing-test-vectors.json");
const privatePemMarker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(label: string): string {
  const directory = mkdtempSync(join(tmpdir(), `vynema-agent-cli-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

function writeEphemeralPrivateKey(directory: string): {
  path: string;
  pem: string;
  derBase64: string;
} {
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const derBase64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const path = join(directory, "ephemeral-agent-key.pem");
  writeFileSync(path, pem, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, pem, derBase64 };
}

function captureCliIo(): { io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      writeOut: (text) => stdout.push(text),
      writeErr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

function firstVector(vectors: SigningVector[]): SigningVector {
  const vector = vectors[0];
  if (!vector) {
    throw new Error("Expected at least one signing vector in the test fixture.");
  }
  return vector;
}

const nativeKeyFileSecurityOperations: KeyFileSecurityOperations = {
  chmodSync,
  closeSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  unlinkSync,
  writeFileSync: (fileDescriptor, data) => {
    writeFileSync(fileDescriptor, data);
  },
};

function keyFileSecurityOperations(
  overrides: Partial<KeyFileSecurityOperations>,
): KeyFileSecurityOperations {
  return { ...nativeKeyFileSecurityOperations, ...overrides };
}

function generateAgentKeyFilesWithOperations(
  outputDirectory: string,
  operations: KeyFileSecurityOperations,
): void {
  const restore = installKeyFileSecurityOperationsForTest(operations);
  try {
    generateAgentKeyFiles(outputDirectory);
  } finally {
    restore();
  }
}

type KeyFileSecurityStats = ReturnType<KeyFileSecurityOperations["lstatSync"]>;

function withMode(stats: KeyFileSecurityStats, mode: number): KeyFileSecurityStats {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode,
    nlink: stats.nlink,
    size: stats.size,
    isDirectory: () => stats.isDirectory(),
    isFile: () => stats.isFile(),
    isSymbolicLink: () => stats.isSymbolicLink(),
  };
}

function keyFileDataText(data: string | NodeJS.ArrayBufferView): string {
  return typeof data === "string"
    ? data
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonical VYNEMA1 signing", () => {
  it("builds the #7 byte-exact string with uppercase method and no trailing LF", () => {
    const canonical = buildCanonicalString({
      method: "post",
      path: "/api/agent/upload-intents?mode=exact%2Fbytes",
      timestamp: "1750000000",
      nonce: "00000000-0000-4000-8000-000000000001",
      bodySha256: "a".repeat(64),
      agentId: "agt_testvector01",
      keyId: "0123456789abcdef",
    });

    expect(canonical).toBe(
      [
        "VYNEMA1",
        "POST",
        "/api/agent/upload-intents?mode=exact%2Fbytes",
        "1750000000",
        "00000000-0000-4000-8000-000000000001",
        "a".repeat(64),
        "agt_testvector01",
        "0123456789abcdef",
      ].join("\n"),
    );
    expect(Buffer.from(canonical, "utf8").at(-1)).not.toBe(0x0a);
  });

  it("hashes the exact body bytes, including empty and non-text bytes", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

    const binaryBody = Uint8Array.from([0x00, 0xff, 0x0a, 0xc3, 0x28]);
    expect(sha256Hex(binaryBody)).toBe(createHash("sha256").update(binaryBody).digest("hex"));
  });

  it("signs deterministically for injected time and nonce and verifies with the public key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const identity = getPublicKeyIdentity(publicKey);
    const input = {
      method: "POST",
      path: "/api/agent/upload-intents?mode=exact",
      body: '{"title":"same bytes"}',
      agentId: "agt_ephemeral01",
      keyId: identity.keyId,
      privateKey,
      now: 1_750_000_000,
      nonce: "00000000-0000-4000-8000-000000000001",
    } as const;

    const first = buildSignedHeaders(input);
    const second = buildSignedHeaders(input);
    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual(SIGNED_HEADER_NAMES);

    const canonical = buildCanonicalString({
      method: input.method,
      path: input.path,
      timestamp: first["x-vynema-timestamp"],
      nonce: first["x-vynema-nonce"],
      bodySha256: first["x-vynema-content-sha256"],
      agentId: first["x-vynema-agent-id"],
      keyId: first["x-vynema-key-id"],
    });
    expect(
      verifyBytes(
        null,
        Buffer.from(canonical, "utf8"),
        publicKey,
        Buffer.from(first["x-vynema-signature"], "base64"),
      ),
    ).toBe(true);

    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const privateDer = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const visibleOutput = JSON.stringify(first);
    expect(visibleOutput).not.toContain(privatePem);
    expect(visibleOutput).not.toContain(privateDer);
    expect(visibleOutput).not.toContain(privatePemMarker);
  });

  it("rejects canonicalization ambiguities instead of normalizing them", () => {
    const valid = {
      method: "POST",
      path: "/api/agent/upload-intents",
      timestamp: "1750000000",
      nonce: "nonce",
      bodySha256: "a".repeat(64),
      agentId: "agt_testvector01",
      keyId: "0123456789abcdef",
    };

    expect(() =>
      buildCanonicalString({ ...valid, path: "https://example.test/api/agent" }),
    ).toThrow(/must start with \/api\//);
    expect(() => buildCanonicalString({ ...valid, path: "/api/agent#fragment" })).toThrow(
      /fragment/,
    );
    for (const rewrittenPath of [
      "/api/agent/../upload-intents",
      "/api/agent\\upload-intents",
      "/api/agent/upload intents",
      "/api/agent/投稿",
      "/api/agent/upload-intents?title=hello world",
    ]) {
      expect(() => buildCanonicalString({ ...valid, path: rewrittenPath })).toThrow(
        /URL-canonical/,
      );
    }
    expect(
      buildCanonicalString({
        ...valid,
        path: "/api/agent/%E6%8A%95%E7%A8%BF?title=hello%20world",
      }),
    ).toContain("/api/agent/%E6%8A%95%E7%A8%BF?title=hello%20world");
    expect(() => buildCanonicalString({ ...valid, nonce: "line1\nline2" })).toThrow(/single-line/);
    expect(() => buildCanonicalString({ ...valid, nonce: "nonce\u0000suffix" })).toThrow(
      /single-line/,
    );
    expect(() => buildCanonicalString({ ...valid, keyId: "ABCDEF0123456789" })).toThrow(
      /lowercase/,
    );
  });
});

describe("Ed25519 key handling and CLI", () => {
  it("derives keyId from the raw 32-byte public key, not the full SPKI", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const spki = publicKey.export({ format: "der", type: "spki" });
    const expected = createHash("sha256").update(spki.subarray(12)).digest("hex").slice(0, 16);

    expect(spki).toHaveLength(44);
    expect(deriveKeyIdFromSpki(spki)).toBe(expected);
    expect(getPublicKeyIdentity(publicKey).keyId).toBe(expected);
  });

  it("keygen writes a 0600 private key and prints only public registration material", async () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen");
    const outputDirectory = join(temporaryDirectory, "keys");
    const captured = captureCliIo();

    const exitCode = await runCli(
      ["node", "vynema-agent", "keygen", "--out", outputDirectory],
      captured.io,
    );

    expect(exitCode).toBe(0);
    expect(captured.stderr.join("")).toBe("");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    expect(statSync(outputDirectory).mode & 0o777).toBe(0o700);
    expect(statSync(privateKeyPath).mode & 0o777).toBe(0o600);
    expect(statSync(publicKeyPath).mode & 0o777).toBe(0o644);
    expect(lstatSync(privateKeyPath).isSymbolicLink()).toBe(false);
    expect(lstatSync(publicKeyPath).isSymbolicLink()).toBe(false);

    const privateKey = loadEd25519PrivateKey(privateKeyPath);
    const privatePem = readFileSync(privateKeyPath, "utf8");
    const privateDer = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const visibleOutput = captured.stdout.join("");
    const identity = getPublicKeyIdentityFromPrivateKey(privateKey);
    expect(visibleOutput).toBe(
      `publicKeySpkiBase64=${identity.publicKeySpkiBase64}\nkeyId=${identity.keyId}\n`,
    );
    expect(visibleOutput).not.toContain(privatePem);
    expect(visibleOutput).not.toContain(privateDer);
    expect(visibleOutput).not.toContain(privatePemMarker);
  });

  it.each([PRIVATE_KEY_FILENAME, PUBLIC_KEY_FILENAME])(
    "removes both newly generated key files when %s hardening fails",
    (filename) => {
      const temporaryDirectory = makeTemporaryDirectory("keygen-hardening-failure");
      const outputDirectory = join(temporaryDirectory, "keys");
      const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
      const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);

      const descriptorPaths = new Map<number, string>();

      expect(() => {
        generateAgentKeyFilesWithOperations(
          outputDirectory,
          keyFileSecurityOperations({
            openSync: (path, flags, mode) => {
              const fileDescriptor = openSync(path, flags, mode);
              descriptorPaths.set(fileDescriptor, path);
              return fileDescriptor;
            },
            fchmodSync: (fileDescriptor, mode) => {
              if (descriptorPaths.get(fileDescriptor)?.endsWith(filename)) {
                throw new Error(`simulated ${filename} chmod failure`);
              }
              fchmodSync(fileDescriptor, mode);
            },
          }),
        );
      }).toThrow(new RegExp(`simulated ${filename} chmod failure`));

      expect(existsSync(privateKeyPath)).toBe(false);
      expect(existsSync(publicKeyPath)).toBe(false);
    },
  );

  it.each([
    [PRIVATE_KEY_FILENAME, 0o100644, "0600"],
    [PUBLIC_KEY_FILENAME, 0o100600, "0644"],
  ])("removes generated files when %s mode cannot be verified", (filename, mode, expectedMode) => {
    const temporaryDirectory = makeTemporaryDirectory(`keygen-${filename}-mode-verification`);
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    const descriptorPaths = new Map<number, string>();

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          openSync: (path, flags, requestedMode) => {
            const fileDescriptor = openSync(path, flags, requestedMode);
            descriptorPaths.set(fileDescriptor, path);
            return fileDescriptor;
          },
          fstatSync: (fileDescriptor) => {
            const stats = fstatSync(fileDescriptor);
            if (descriptorPaths.get(fileDescriptor)?.endsWith(filename)) {
              return withMode(stats, mode);
            }
            return stats;
          },
        }),
      );
    }).toThrow(new RegExp(`verified as mode ${expectedMode}`));

    expect(existsSync(privateKeyPath)).toBe(false);
    expect(existsSync(publicKeyPath)).toBe(false);
  });

  it("removes a private key after a partial descriptor write fails", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-partial-private-write");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          writeFileSync: (fileDescriptor, data) => {
            if (keyFileDataText(data).includes("PRIVATE KEY")) {
              writeFileSync(fileDescriptor, "partial private material");
              throw new Error("simulated partial private-key write");
            }
            writeFileSync(fileDescriptor, data);
          },
        }),
      );
    }).toThrow(/simulated partial private-key write/);

    expect(existsSync(privateKeyPath)).toBe(false);
    expect(existsSync(publicKeyPath)).toBe(false);
  });

  it("preserves a public-key sentinel that appears during exclusive reservation", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-public-reservation-race");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    const sentinel = "do not replace this file\n";

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          openSync: (path, flags, mode) => {
            if (path.endsWith(PUBLIC_KEY_FILENAME)) {
              writeFileSync(path, sentinel, { flag: "wx", mode: 0o644 });
            }
            return openSync(path, flags, mode);
          },
        }),
      );
    }).toThrow(/Refusing to overwrite/);

    expect(existsSync(privateKeyPath)).toBe(false);
    expect(readFileSync(publicKeyPath, "utf8")).toBe(sentinel);
  });

  it("does not unlink a replacement inode while cleaning up a failed private write", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-cleanup-replacement");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    const descriptorPaths = new Map<number, string>();
    const replacement = "replacement owned by another operation\n";

    let thrown: unknown;
    try {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          openSync: (path, flags, mode) => {
            const fileDescriptor = openSync(path, flags, mode);
            descriptorPaths.set(fileDescriptor, path);
            return fileDescriptor;
          },
          writeFileSync: (fileDescriptor, data) => {
            const path = descriptorPaths.get(fileDescriptor);
            if (path?.endsWith(PRIVATE_KEY_FILENAME)) {
              writeFileSync(fileDescriptor, "partial private material");
              unlinkSync(path);
              writeFileSync(path, replacement, { flag: "wx", mode: 0o600 });
              throw new Error("simulated private-key write failure after replacement");
            }
            writeFileSync(fileDescriptor, data);
          },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as Error).message).toContain("simulated private-key write failure");
    expect((thrown as Error).message).toContain(privateKeyPath);
    expect((thrown as Error).message).toContain("Private key material may remain");
    expect(readFileSync(privateKeyPath, "utf8")).toBe(replacement);
    expect(existsSync(publicKeyPath)).toBe(false);
  });

  it("retries a transient descriptor-close failure before removing generated files", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-transient-close-failure");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    const descriptorPaths = new Map<number, string>();
    let privateCloseAttempts = 0;

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          openSync: (path, flags, mode) => {
            const fileDescriptor = openSync(path, flags, mode);
            descriptorPaths.set(fileDescriptor, path);
            return fileDescriptor;
          },
          closeSync: (fileDescriptor) => {
            if (
              descriptorPaths.get(fileDescriptor)?.endsWith(PRIVATE_KEY_FILENAME) &&
              ++privateCloseAttempts === 1
            ) {
              throw new Error("simulated transient private descriptor close failure");
            }
            closeSync(fileDescriptor);
          },
        }),
      );
    }).toThrow(/simulated transient private descriptor close failure/);

    expect(privateCloseAttempts).toBe(2);
    expect(existsSync(privateKeyPath)).toBe(false);
    expect(existsSync(publicKeyPath)).toBe(false);
  });

  it("reports a persistently unclosed descriptor and still attempts every path cleanup", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-persistent-close-failure");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    const descriptorPaths = new Map<number, string>();
    let privateFileDescriptor: number | undefined;
    let privateCloseAttempts = 0;
    let thrown: unknown;

    try {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          openSync: (path, flags, mode) => {
            const fileDescriptor = openSync(path, flags, mode);
            descriptorPaths.set(fileDescriptor, path);
            if (path.endsWith(PRIVATE_KEY_FILENAME)) {
              privateFileDescriptor = fileDescriptor;
            }
            return fileDescriptor;
          },
          closeSync: (fileDescriptor) => {
            if (descriptorPaths.get(fileDescriptor)?.endsWith(PRIVATE_KEY_FILENAME)) {
              privateCloseAttempts += 1;
              throw new Error("simulated persistent private descriptor close failure");
            }
            closeSync(fileDescriptor);
          },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    try {
      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as Error).message).toContain("Open key file descriptors may remain");
      expect((thrown as Error).message).toContain("terminate this process");
      expect(privateCloseAttempts).toBe(2);
      expect(existsSync(privateKeyPath)).toBe(false);
      expect(existsSync(publicKeyPath)).toBe(false);
    } finally {
      if (privateFileDescriptor !== undefined) {
        closeSync(privateFileDescriptor);
      }
    }
  });

  it("documents the same-user replacement race between identity check and path unlink", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-unlink-race-boundary");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);
    const replacement = "same-user replacement during unlink\n";
    let raced = false;

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          writeFileSync: (fileDescriptor, data) => {
            if (keyFileDataText(data).includes("PRIVATE KEY")) {
              writeFileSync(fileDescriptor, "partial private material");
              throw new Error("simulated private-key write failure");
            }
            writeFileSync(fileDescriptor, data);
          },
          unlinkSync: (path) => {
            if (path.endsWith(PRIVATE_KEY_FILENAME) && !raced) {
              // Interpose after the production identity check but before its path-based unlink.
              unlinkSync(path);
              writeFileSync(path, replacement, { flag: "wx", mode: 0o600 });
              raced = true;
            }
            unlinkSync(path);
          },
        }),
      );
    }).toThrow(/simulated private-key write failure/);

    expect(raced).toBe(true);
    expect(existsSync(privateKeyPath)).toBe(false);
    expect(existsSync(publicKeyPath)).toBe(false);
  });

  it("fails before key creation when restrictive directory mode cannot be verified", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-directory-mode-verification");
    const outputDirectory = join(temporaryDirectory, "keys");
    let directoryStatCalls = 0;

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          lstatSync: (path) => {
            const stats = lstatSync(path);
            if (stats.isDirectory() && ++directoryStatCalls > 1) {
              return withMode(stats, 0o040755);
            }
            return stats;
          },
        }),
      );
    }).toThrow(/verified as mode 0700/);

    expect(existsSync(join(outputDirectory, PRIVATE_KEY_FILENAME))).toBe(false);
    expect(existsSync(join(outputDirectory, PUBLIC_KEY_FILENAME))).toBe(false);
  });

  it("fails before key creation when output-directory hardening throws", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-directory-hardening-failure");
    const outputDirectory = join(temporaryDirectory, "keys");

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          chmodSync: () => {
            throw new Error("simulated directory chmod failure");
          },
        }),
      );
    }).toThrow(/simulated directory chmod failure/);

    expect(existsSync(join(outputDirectory, PRIVATE_KEY_FILENAME))).toBe(false);
    expect(existsSync(join(outputDirectory, PUBLIC_KEY_FILENAME))).toBe(false);
  });

  it("reports incomplete cleanup but still removes the public artifact", () => {
    const temporaryDirectory = makeTemporaryDirectory("keygen-cleanup-failure");
    const outputDirectory = join(temporaryDirectory, "keys");
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const publicKeyPath = join(outputDirectory, PUBLIC_KEY_FILENAME);

    expect(() => {
      generateAgentKeyFilesWithOperations(
        outputDirectory,
        keyFileSecurityOperations({
          writeFileSync: (fileDescriptor, data) => {
            if (keyFileDataText(data).includes("PRIVATE KEY")) {
              writeFileSync(fileDescriptor, "partial private material");
              throw new Error("simulated private-key write failure");
            }
            writeFileSync(fileDescriptor, data);
          },
          unlinkSync: (path) => {
            if (path.endsWith(PRIVATE_KEY_FILENAME)) {
              throw new Error("simulated private-key cleanup failure");
            }
            unlinkSync(path);
          },
        }),
      );
    }).toThrow(
      new RegExp(
        `simulated private-key write failure.*${PRIVATE_KEY_FILENAME}.*Private key material may remain`,
      ),
    );

    expect(existsSync(privateKeyPath)).toBe(true);
    expect(existsSync(publicKeyPath)).toBe(false);
  });

  it("refuses to overwrite an existing keypair", async () => {
    const temporaryDirectory = makeTemporaryDirectory("no-overwrite");
    const outputDirectory = join(temporaryDirectory, "keys");
    const first = captureCliIo();
    expect(
      await runCli(["node", "vynema-agent", "keygen", "--out", outputDirectory], first.io),
    ).toBe(0);
    const privateKeyPath = join(outputDirectory, PRIVATE_KEY_FILENAME);
    const before = createHash("sha256").update(readFileSync(privateKeyPath)).digest("hex");

    const second = captureCliIo();
    expect(
      await runCli(["node", "vynema-agent", "keygen", "--out", outputDirectory], second.io),
    ).toBe(1);
    expect(second.stderr.join("")).toContain("Refusing to overwrite");
    expect(createHash("sha256").update(readFileSync(privateKeyPath)).digest("hex")).toBe(before);
  });

  it("fails closed on Windows before accessing or creating private-key files", () => {
    const temporaryDirectory = makeTemporaryDirectory("windows-acl");
    const ephemeral = writeEphemeralPrivateKey(temporaryDirectory);
    const outputDirectory = join(temporaryDirectory, "windows-keys");
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!platformDescriptor) {
      throw new Error("Expected process.platform descriptor.");
    }

    Object.defineProperty(process, "platform", { ...platformDescriptor, value: "win32" });
    try {
      expect(() => loadEd25519PrivateKey(ephemeral.path)).toThrow(
        /restrictive ACLs cannot be established and verified/,
      );
      expect(() => generateAgentKeyFiles(outputDirectory)).toThrow(
        /restrictive ACLs cannot be established and verified/,
      );
      expect(existsSync(outputDirectory)).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", platformDescriptor);
    }
  });

  it("sign emits verifiable canonical headers without private material", async () => {
    const temporaryDirectory = makeTemporaryDirectory("sign");
    const ephemeral = writeEphemeralPrivateKey(temporaryDirectory);
    const privateKey = loadEd25519PrivateKey(ephemeral.path);
    const identity = getPublicKeyIdentityFromPrivateKey(privateKey);
    const captured = captureCliIo();

    const exitCode = await runCli(
      [
        "node",
        "vynema-agent",
        "sign",
        "--method",
        "post",
        "--path",
        "/api/agent/upload-intents?case=cli",
        "--agent-id",
        "agt_ephemeral01",
        "--key",
        ephemeral.path,
        "--key-id",
        identity.keyId,
        "--body",
        '{"title":"exact body"}',
        "--timestamp",
        "1750000000",
        "--nonce",
        "00000000-0000-4000-8000-000000000001",
      ],
      captured.io,
    );

    expect(exitCode).toBe(0);
    expect(captured.stderr.join("")).toBe("");
    const visibleOutput = captured.stdout.join("");
    expect(visibleOutput).not.toContain(ephemeral.pem);
    expect(visibleOutput).not.toContain(ephemeral.derBase64);
    expect(visibleOutput).not.toContain(privatePemMarker);

    const headers = JSON.parse(visibleOutput) as Record<string, string>;
    const canonical = buildCanonicalString({
      method: "POST",
      path: "/api/agent/upload-intents?case=cli",
      timestamp: headers["x-vynema-timestamp"] ?? "",
      nonce: headers["x-vynema-nonce"] ?? "",
      bodySha256: headers["x-vynema-content-sha256"] ?? "",
      agentId: headers["x-vynema-agent-id"] ?? "",
      keyId: headers["x-vynema-key-id"] ?? "",
    });
    expect(
      verifyBytes(
        null,
        Buffer.from(canonical, "utf8"),
        importEd25519PublicKey(Buffer.from(identity.publicKeySpkiBase64, "base64")),
        Buffer.from(headers["x-vynema-signature"] ?? "", "base64"),
      ),
    ).toBe(true);
  });

  it("sign hashes exact --body-file bytes without text decoding", async () => {
    const temporaryDirectory = makeTemporaryDirectory("binary-body");
    const ephemeral = writeEphemeralPrivateKey(temporaryDirectory);
    const body = Buffer.from([0x00, 0xff, 0x0a, 0xc3, 0x28]);
    const bodyPath = join(temporaryDirectory, "request-body.bin");
    writeFileSync(bodyPath, body);
    const captured = captureCliIo();

    const exitCode = await runCli(
      [
        "node",
        "vynema-agent",
        "sign",
        "--method",
        "POST",
        "--path",
        "/api/agent/upload-intents",
        "--agent-id",
        "agt_ephemeral01",
        "--key",
        ephemeral.path,
        "--body-file",
        bodyPath,
        "--timestamp",
        "1750000000",
        "--nonce",
        "00000000-0000-4000-8000-000000000001",
      ],
      captured.io,
    );

    expect(exitCode).toBe(0);
    const headers = JSON.parse(captured.stdout.join("")) as Record<string, string>;
    expect(headers["x-vynema-content-sha256"]).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
    const visibleOutput = `${captured.stdout.join("")}\n${captured.stderr.join("")}`;
    expect(visibleOutput).not.toContain(ephemeral.pem);
    expect(visibleOutput).not.toContain(ephemeral.derBase64);
    expect(visibleOutput).not.toContain(privatePemMarker);
  });

  it("does not expose private material when sign rejects a mismatched key ID", async () => {
    const temporaryDirectory = makeTemporaryDirectory("sign-error");
    const ephemeral = writeEphemeralPrivateKey(temporaryDirectory);
    const captured = captureCliIo();

    const exitCode = await runCli(
      [
        "node",
        "vynema-agent",
        "sign",
        "--method",
        "GET",
        "--path",
        "/api/agent/videos/vid_test",
        "--agent-id",
        "agt_ephemeral01",
        "--key",
        ephemeral.path,
        "--key-id",
        "0000000000000000",
      ],
      captured.io,
    );

    expect(exitCode).toBe(1);
    const visibleOutput = `${captured.stdout.join("")}\n${captured.stderr.join("")}`;
    expect(visibleOutput).not.toContain(ephemeral.pem);
    expect(visibleOutput).not.toContain(ephemeral.derBase64);
    expect(visibleOutput).not.toContain(privatePemMarker);
  });

  it("rejects private-key locations inside the repository before reading them", () => {
    expect(() => {
      assertPathOutsideRepository(
        join(repositoryRoot, "AGENTS.md"),
        repositoryRoot,
        "Vector private key",
      );
    }).toThrow(/outside the repository checkout/);
  });

  it("resolves a symlinked key destination before repository containment lookup", () => {
    const temporaryDirectory = makeTemporaryDirectory("symlinked-key-destination");
    const fakeRepository = join(temporaryDirectory, "fake-repository");
    const repositoryTarget = join(fakeRepository, "nested", "key-output");
    const externalDirectory = join(temporaryDirectory, "external");
    const symlinkPath = join(externalDirectory, "repository-output");
    mkdirSync(join(fakeRepository, ".git"), { recursive: true });
    mkdirSync(repositoryTarget, { recursive: true });
    mkdirSync(externalDirectory);
    symlinkSync(repositoryTarget, symlinkPath, "dir");

    expect(findRepositoryRoot(symlinkPath)).toBe(realpathSync(fakeRepository));
    expect(() => generateAgentKeyFiles(symlinkPath)).toThrow(/outside the repository checkout/);
    expect(existsSync(join(repositoryTarget, PRIVATE_KEY_FILENAME))).toBe(false);
    expect(existsSync(join(repositoryTarget, PUBLIC_KEY_FILENAME))).toBe(false);
  });

  it("recognizes the real CLI entry point when argv uses a symlink launcher", () => {
    const temporaryDirectory = makeTemporaryDirectory("symlinked-cli-launcher");
    const realEntryPoint = join(temporaryDirectory, "cli.js");
    const symlinkEntryPoint = join(temporaryDirectory, "vynema-agent");
    writeFileSync(realEntryPoint, "// test entry point\n");
    symlinkSync(realEntryPoint, symlinkEntryPoint, "file");

    expect(isCliEntryPoint(symlinkEntryPoint, pathToFileURL(realEntryPoint).href)).toBe(true);
  });

  it("runs the built CLI through a symlink launcher", () => {
    const temporaryDirectory = makeTemporaryDirectory("symlinked-built-cli-launcher");
    const realEntryPoint = join(repositoryRoot, "tools/agent-cli/dist/cli.js");
    const symlinkEntryPoint = join(temporaryDirectory, "vynema-agent");
    symlinkSync(realEntryPoint, symlinkEntryPoint, "file");

    const result = spawnSync(process.execPath, [symlinkEntryPoint, "--help"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: vynema-agent");
    expect(result.stdout).toContain("keygen");
  });
});

describe("public deterministic signing vectors", () => {
  it("validates every committed vector from public material only", () => {
    const vectors = readAndValidateSigningVectors(committedVectorPath);
    expect(vectors).toHaveLength(3);

    const artifact = readFileSync(committedVectorPath, "utf8");
    expect(artifact.toLowerCase()).not.toContain("privatekey");
    expect(artifact.toLowerCase()).not.toContain("private_key");
    expect(artifact.toLowerCase()).not.toContain("seed");
    expect(artifact).not.toContain(privatePemMarker);
  });

  it("reproduces byte-identical vectors with the same ephemeral key", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const first = generateSigningVectors(privateKey);
    const second = generateSigningVectors(privateKey);

    expect(second).toEqual(first);
    expect(serializeSigningVectors(second)).toBe(serializeSigningVectors(first));
  });

  it.each([
    "changed request field",
    "changed hash",
    "changed canonical byte",
    "changed public key",
    "changed signature",
  ])("rejects a %s mutation", (mutation) => {
    const vectors = readAndValidateSigningVectors(committedVectorPath);
    const changed = structuredClone(vectors);
    const vector = firstVector(changed);

    if (mutation === "changed request field") {
      vector.path = `${vector.path}&tampered=1`;
    } else if (mutation === "changed hash") {
      vector.bodySha256 = `${vector.bodySha256.startsWith("0") ? "1" : "0"}${vector.bodySha256.slice(1)}`;
    } else if (mutation === "changed canonical byte") {
      vector.canonicalString = `${vector.canonicalString} `;
    } else if (mutation === "changed public key") {
      const { publicKey } = generateKeyPairSync("ed25519");
      vector.publicKeySpkiBase64 = getPublicKeyIdentity(publicKey).publicKeySpkiBase64;
    } else {
      const signature = Buffer.from(vector.signature, "base64");
      const firstByte = signature[0];
      if (firstByte === undefined) {
        throw new Error("Expected a non-empty signature.");
      }
      signature[0] = firstByte ^ 0x01;
      vector.signature = signature.toString("base64");
    }

    expect(() => validateSigningVectors(changed)).toThrow();
  });

  it("enforces exact schema, unique names, and fixed case order", () => {
    const vectors = readAndValidateSigningVectors(committedVectorPath);
    const withUnknownField: unknown = vectors.map((vector, index) =>
      index === 0 ? { ...vector, unexpected: "field" } : vector,
    );
    expect(() => validateSigningVectors(withUnknownField)).toThrow(/exactly the documented fields/);

    const duplicate = structuredClone(vectors);
    const duplicateFirst = duplicate[0];
    const duplicateSecond = duplicate[1];
    if (!duplicateFirst || !duplicateSecond) {
      throw new Error("Expected at least two signing vectors.");
    }
    duplicateSecond.name = duplicateFirst.name;
    expect(() => validateSigningVectors(duplicate)).toThrow(/unique/);

    const reordered = [vectors[1], vectors[0], vectors[2]];
    expect(() => validateSigningVectors(reordered)).toThrow(/fixed public inputs/);
  });

  it("generates only a public artifact from an external 0600 key and leaves that key unchanged", () => {
    const temporaryDirectory = makeTemporaryDirectory("vector-generation");
    const ephemeral = writeEphemeralPrivateKey(temporaryDirectory);
    const outputPath = join(temporaryDirectory, "public-vectors.json");
    const privateHashBefore = createHash("sha256")
      .update(readFileSync(ephemeral.path))
      .digest("hex");

    const vectors = generateSigningVectorFile({
      privateKeyPath: ephemeral.path,
      outputPath,
      repositoryRoot,
    });

    expect(readAndValidateSigningVectors(outputPath)).toEqual(vectors);
    expect(createHash("sha256").update(readFileSync(ephemeral.path)).digest("hex")).toBe(
      privateHashBefore,
    );
    const publicArtifact = readFileSync(outputPath, "utf8");
    expect(publicArtifact).not.toContain(ephemeral.pem);
    expect(publicArtifact).not.toContain(ephemeral.derBase64);
    expect(publicArtifact).not.toContain(privatePemMarker);
  });

  it("wires public verification and explicit external-key replacement through the CLI", async () => {
    const verifyCapture = captureCliIo();
    expect(
      await runCli(
        ["node", "vynema-agent", "test-vectors", "verify", "--file", committedVectorPath],
        verifyCapture.io,
      ),
    ).toBe(0);
    expect(verifyCapture.stdout.join("")).toBe("Verified 3 public signing vectors.\n");

    const temporaryDirectory = makeTemporaryDirectory("vector-cli");
    const ephemeral = writeEphemeralPrivateKey(temporaryDirectory);
    const outputPath = join(temporaryDirectory, "generated-public-vectors.json");
    const generateCapture = captureCliIo();
    expect(
      await runCli(
        [
          "node",
          "vynema-agent",
          "test-vectors",
          "generate",
          "--private-key",
          ephemeral.path,
          "--out",
          outputPath,
        ],
        generateCapture.io,
      ),
    ).toBe(0);
    expect(readAndValidateSigningVectors(outputPath)).toHaveLength(3);

    const visibleOutput = `${generateCapture.stdout.join("")}\n${generateCapture.stderr.join("")}`;
    expect(visibleOutput).not.toContain(ephemeral.pem);
    expect(visibleOutput).not.toContain(ephemeral.derBase64);
    expect(visibleOutput).not.toContain(privatePemMarker);
  });
});
