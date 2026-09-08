import {
  chmodSync,
  closeSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

export interface KeyPathSecurityStats {
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  size: number;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}

export interface KeyFileSecurityOperations {
  chmodSync: (path: string, mode: number) => void;
  closeSync: (fileDescriptor: number) => void;
  fchmodSync: (fileDescriptor: number, mode: number) => void;
  fstatSync: (fileDescriptor: number) => KeyPathSecurityStats;
  lstatSync: (path: string) => KeyPathSecurityStats;
  openSync: (path: string, flags: number, mode: number) => number;
  unlinkSync: (path: string) => void;
  writeFileSync: (fileDescriptor: number, data: string | NodeJS.ArrayBufferView) => void;
}

const productionKeyFileSecurityOperations: KeyFileSecurityOperations = Object.freeze({
  chmodSync,
  closeSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  unlinkSync,
  writeFileSync,
});

let activeKeyFileSecurityOperations = productionKeyFileSecurityOperations;

export function getKeyFileSecurityOperations(): KeyFileSecurityOperations {
  return activeKeyFileSecurityOperations;
}

/** @internal Available only to this package's tests; never re-exported by the public module. */
export function installKeyFileSecurityOperationsForTest(
  operations: KeyFileSecurityOperations,
): () => void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Key-file security operation overrides are available only in tests.");
  }
  if (activeKeyFileSecurityOperations !== productionKeyFileSecurityOperations) {
    throw new Error("A key-file security test override is already installed.");
  }

  activeKeyFileSecurityOperations = operations;
  return () => {
    if (activeKeyFileSecurityOperations !== operations) {
      throw new Error("The active key-file security test override changed unexpectedly.");
    }
    activeKeyFileSecurityOperations = productionKeyFileSecurityOperations;
  };
}
