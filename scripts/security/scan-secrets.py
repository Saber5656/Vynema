#!/usr/bin/env python3
"""High-confidence secret pattern scan for local and CI checks.

This is a lightweight guardrail, not a replacement for GitHub Secret Scanning,
push protection, or a dedicated scanner such as gitleaks.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("private-key-block", re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----")),
    ("github-token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b")),
    ("github-fine-grained-token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{70,}\b")),
    ("openai-api-key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b")),
    ("anthropic-api-key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{40,}\b")),
    ("aws-access-key-id", re.compile(r"\b(?:A3T|AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("stripe-secret-key", re.compile(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b")),
    ("stripe-webhook-secret", re.compile(r"\bwhsec_[A-Za-z0-9]{24,}\b")),
]

SKIP_SUFFIXES = {
    ".avif",
    ".bin",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".webp",
    ".zip",
}


def candidate_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return [Path(item) for item in result.stdout.decode("utf-8", errors="replace").split("\0") if item]


def should_skip(path: Path) -> bool:
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    try:
        return path.stat().st_size > MAX_FILE_SIZE_BYTES
    except FileNotFoundError:
        return True


def scan_file(path: Path) -> list[str]:
    if should_skip(path):
        return []

    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []

    findings: list[str] = []
    for line_number, line in enumerate(content.splitlines(), start=1):
        for name, pattern in PATTERNS:
            if pattern.search(line):
                findings.append(f"{path}:{line_number}: potential {name}")
    return findings


def main() -> int:
    findings: list[str] = []
    for path in candidate_files():
        findings.extend(scan_file(path))

    if findings:
        print("Potential secrets detected. The matching values are intentionally not printed.")
        for finding in findings:
            print(f"- {finding}")
        print("Remove the value from the commit and rotate/revoke it if it was real.")
        return 1

    print("No high-confidence secret patterns detected in tracked or untracked candidate files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
