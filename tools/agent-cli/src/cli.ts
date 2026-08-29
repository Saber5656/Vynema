#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Command, CommanderError } from "commander";

import {
  findRepositoryRoot,
  generateAgentKeyFiles,
  getPublicKeyIdentityFromPrivateKey,
  loadEd25519PrivateKey,
} from "./keys.js";
import { buildSignedHeaders } from "./signing.js";
import {
  DEFAULT_VECTOR_PATH,
  generateSigningVectorFile,
  readAndValidateSigningVectors,
} from "./vectors.js";

export interface CliIo {
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
}

interface KeygenOptions {
  out: string;
}

interface SignOptions {
  method: string;
  path: string;
  agentId: string;
  key: string;
  keyId?: string;
  body?: string;
  bodyFile?: string;
  timestamp?: string;
  nonce?: string;
}

interface VerifyVectorOptions {
  file: string;
}

interface GenerateVectorOptions {
  privateKey: string;
  out: string;
}

const defaultIo: CliIo = {
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
};

function parseTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d{1,12}$/.test(value)) {
    throw new Error("Timestamp must be a 1-12 digit Unix-seconds value.");
  }

  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error("Timestamp is outside the supported integer range.");
  }
  return timestamp;
}

function readBody(options: SignOptions): string | Buffer {
  if (options.body !== undefined && options.bodyFile !== undefined) {
    throw new Error("Use only one of --body or --body-file.");
  }

  if (options.bodyFile !== undefined) {
    try {
      return readFileSync(options.bodyFile);
    } catch {
      throw new Error("Unable to read the request body file.");
    }
  }
  return options.body ?? "";
}

export function createProgram(io: CliIo = defaultIo): Command {
  const program = new Command();
  program
    .name("vynema-agent")
    .description("Reference key generation and byte-exact request signing for Vynema agents")
    .version("0.0.0")
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: io.writeOut,
      writeErr: io.writeErr,
      outputError: (text, write) => {
        write(text);
      },
    });

  program
    .command("keygen")
    .description("Create a local Ed25519 agent keypair without printing private material")
    .option("--out <directory>", "key directory", join(homedir(), ".vynema"))
    .action((options: KeygenOptions) => {
      const repositoryRoot = findRepositoryRoot(process.cwd());
      const result = generateAgentKeyFiles(resolve(options.out), repositoryRoot);
      io.writeOut(`publicKeySpkiBase64=${result.publicKeySpkiBase64}\nkeyId=${result.keyId}\n`);
    });

  program
    .command("sign")
    .description("Produce the six canonical VYNEMA1 headers for exact request body bytes")
    .requiredOption("--method <method>", "HTTP method")
    .requiredOption("--path <pathWithQuery>", "exact /api/ path and query, without an origin")
    .requiredOption("--agent-id <agentId>", "registered agent ID")
    .requiredOption("--key <privateKeyPath>", "local Ed25519 PKCS8 private key")
    .option("--key-id <keyId>", "assert the expected derived key ID")
    .option("--body <utf8Body>", "exact UTF-8 request body")
    .option("--body-file <path>", "read exact request body bytes from a file")
    .option("--timestamp <unixSeconds>", "inject Unix seconds (testing/debugging only)")
    .option("--nonce <nonce>", "inject a unique nonce (testing/debugging only)")
    .action((options: SignOptions) => {
      const privateKey = loadEd25519PrivateKey(options.key);
      const identity = getPublicKeyIdentityFromPrivateKey(privateKey);

      if (options.keyId !== undefined && options.keyId !== identity.keyId) {
        throw new Error("Provided key ID does not match the private key's public identity.");
      }

      const headers = buildSignedHeaders({
        method: options.method,
        path: options.path,
        body: readBody(options),
        agentId: options.agentId,
        keyId: identity.keyId,
        privateKey,
        now: parseTimestamp(options.timestamp),
        nonce: options.nonce,
      });
      io.writeOut(`${JSON.stringify(headers, null, 2)}\n`);
    });

  const vectors = program
    .command("test-vectors")
    .description("Verify or intentionally replace the committed public signing vectors");

  vectors
    .command("verify")
    .description("Validate every public field, canonical byte, key ID, and signature")
    .option("--file <path>", "public vector JSON", DEFAULT_VECTOR_PATH)
    .action((options: VerifyVectorOptions) => {
      const verified = readAndValidateSigningVectors(resolve(options.file));
      io.writeOut(`Verified ${verified.length} public signing vectors.\n`);
    });

  vectors
    .command("generate")
    .description("Replace public vectors using an explicit private key outside this checkout")
    .requiredOption("--private-key <externalPath>", "external Ed25519 PKCS8 private key")
    .requiredOption("--out <path>", "public JSON output path")
    .action((options: GenerateVectorOptions) => {
      const repositoryRoot = findRepositoryRoot(process.cwd());
      if (!repositoryRoot) {
        throw new Error("Vector replacement must run from inside the repository checkout.");
      }

      const generated = generateSigningVectorFile({
        privateKeyPath: options.privateKey,
        outputPath: resolve(options.out),
        repositoryRoot,
      });
      io.writeOut(`Wrote ${generated.length} public signing vectors.\n`);
    });

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  io: CliIo = defaultIo,
): Promise<number> {
  try {
    await createProgram(io).parseAsync([...argv], { from: "node" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    io.writeErr(`Error: ${error instanceof Error ? error.message : "Command failed."}\n`);
    return 1;
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  void runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
