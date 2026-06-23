#!/usr/bin/env python3
"""High-confidence secret pattern scan for local and CI checks.

This is a lightweight guardrail, not a replacement for GitHub Secret Scanning,
push protection, or a dedicated scanner such as gitleaks.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import stat
from pathlib import Path


MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("private-key-block", re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |)?PRIVATE KEY-----")),
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

PATCH_FILE_RE = re.compile(r"^\+\+\+ b/(.+)$")
PATCH_HUNK_RE = re.compile(r"^@@ .+ \+(\d+)(?:,\d+)? @@")


def run_git(repo: Path, args: list[str]) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result


def candidate_files(repo: Path) -> list[Path]:
    result = run_git(repo, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    return [Path(item) for item in result.stdout.decode("utf-8", errors="replace").split("\0") if item]


def should_skip(path: Path) -> bool:
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    try:
        file_stat = path.lstat()
    except (FileNotFoundError, OSError):
        return True

    if not stat.S_ISREG(file_stat.st_mode):
        return True

    return file_stat.st_size > MAX_FILE_SIZE_BYTES


def display_path(repo: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo))
    except ValueError:
        return str(path)


def scan_text(source: str, lines: list[tuple[int, str]]) -> list[str]:
    findings: list[str] = []
    for line_number, line in lines:
        for name, pattern in PATTERNS:
            if pattern.search(line):
                findings.append(f"{source}:{line_number}: potential {name}")
    return findings


def scan_file(repo: Path, path: Path) -> list[str]:
    if should_skip(path):
        return []

    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []

    source = display_path(repo, path)
    return scan_text(source, list(enumerate(content.splitlines(), start=1)))


def scan_worktree(repo: Path) -> list[str]:
    findings: list[str] = []
    for path in candidate_files(repo):
        findings.extend(scan_file(repo, repo / path))
    return findings


def commits_in_range(repo: Path, commit_range: str) -> list[str]:
    result = run_git(repo, ["rev-list", "--reverse", commit_range])
    return [line for line in result.stdout.decode("utf-8", errors="replace").splitlines() if line]


def scan_commit_patch(repo: Path, commit: str) -> list[str]:
    result = run_git(repo, ["show", "--format=", "--no-ext-diff", "--unified=0", commit])
    patch = result.stdout.decode("utf-8", errors="replace").splitlines()

    findings: list[str] = []
    current_file = "unknown"
    current_line = 0
    commit_short = commit[:12]

    for line in patch:
        file_match = PATCH_FILE_RE.match(line)
        if file_match:
            current_file = file_match.group(1)
            current_line = 0
            continue

        hunk_match = PATCH_HUNK_RE.match(line)
        if hunk_match:
            current_line = int(hunk_match.group(1))
            continue

        if line.startswith("+++") or line.startswith("---") or line.startswith("\\"):
            continue

        if line.startswith("+"):
            source = f"commit {commit_short}:{current_file}"
            findings.extend(scan_text(source, [(current_line, line[1:])]))
            current_line += 1
            continue

        if line.startswith("-"):
            continue

        if current_line:
            current_line += 1

    return findings


def scan_commit_range(repo: Path, commit_range: str) -> list[str]:
    findings: list[str] = []
    for commit in commits_in_range(repo, commit_range):
        findings.extend(scan_commit_patch(repo, commit))
    return findings


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan repository content for high-confidence secret patterns.")
    parser.add_argument("--repo", default=".", help="Repository path to scan.")
    parser.add_argument("--commit-range", help="Optional git commit range to scan for added secret patterns.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    repo = Path(args.repo).resolve()

    try:
        findings = scan_worktree(repo)
        if args.commit_range:
            findings.extend(scan_commit_range(repo, args.commit_range))
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.decode("utf-8", errors="replace").strip()
        print(f"Secret scan failed while running git: {stderr}", file=sys.stderr)
        return 2

    if findings:
        print("Potential secrets detected. The matching values are intentionally not printed.")
        for finding in sorted(set(findings)):
            print(f"- {finding}")
        print("Remove the value from the commit and rotate/revoke it if it was real.")
        return 1

    print("No high-confidence secret patterns detected in tracked or untracked candidate files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
