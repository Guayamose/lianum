#!/usr/bin/env python3
"""Recover public SOURCE bytes from Git and verify the original attempt pins.

Creates a private overlay for an isolated mount namespace. It never replaces
the working tree, opens a capsule, changes a locator or creates financial state.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import uuid

from import_paths import map_path, translate

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".internal/runtime"
FLAT = RUNTIME / "omnichain-flat-profile"
WALLET = FLAT / "flat-wallet"
MAX_BYTES = 128 * 1024 * 1024
PREFIXES = (
    ("development-tooling/", ROOT / "scripts/development"),
    ("development-config/", ROOT / "scripts"),
    ("golden/", RUNTIME / "omnichain-product"),
    ("candidate/", FLAT / "candidate-poseidon"),
    ("mobile-protocol/", RUNTIME / "mobile-protocol"),
    ("mobile-app/", ROOT / "apps/mobile"),
    ("mobile-protocol-workspace/", ROOT / "packages/mobile-protocol"),
    ("flat/", FLAT),
    ("workspace-module/", ROOT),
    ("development-root/", ROOT),
)
RELEASE_SOURCE = "packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relative(value):
    if not isinstance(value, str) or not value or value.startswith("/"):
        raise RuntimeError("SOURCE_SNAPSHOT_RELATIVE_PATH")
    parts = value.split("/")
    if any(not part or part in (".", "..", ".local", ".git", ".env") for part in parts):
        raise RuntimeError("SOURCE_SNAPSHOT_PUBLIC_PATH_REQUIRED")
    return Path(value)


def physical_read(path):
    if path.resolve() != path.absolute():
        raise RuntimeError("SOURCE_SNAPSHOT_PHYSICAL_PATH_REQUIRED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_BYTES:
            raise RuntimeError("SOURCE_SNAPSHOT_FILE_BOUND")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            data = stream.read(MAX_BYTES + 1)
        after, named = os.fstat(fd), path.lstat()
        for field in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns"):
            if getattr(before, field) != getattr(after, field) or getattr(before, field) != getattr(named, field):
                raise RuntimeError("SOURCE_SNAPSHOT_FILE_CHANGED")
        if len(data) != before.st_size:
            raise RuntimeError("SOURCE_SNAPSHOT_FILE_CHANGED")
        return data, stat.S_IMODE(before.st_mode)
    finally:
        os.close(fd)


def git_bytes(commit, path):
    relative(path)
    result = subprocess.run(["git", "show", commit + ":" + path], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode or len(result.stdout) > MAX_BYTES:
        raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_GIT_BYTES_UNAVAILABLE")
    return result.stdout


def destination(label):
    relative(label)
    for prefix, directory in PREFIXES:
        if label.startswith(prefix):
            return directory / relative(label[len(prefix):])
    return WALLET / relative(label)


def original_bytes(commit, path, layout, runtime_sources):
    rel = path.relative_to(ROOT).as_posix()
    if path.is_relative_to(RUNTIME):
        runtime = path.relative_to(RUNTIME).as_posix()
        # Domain directories can share a formerly flat runtime directory. The
        # original forward build is unambiguous; its reverse directory rule
        # can invent a source path for a file added after the frozen inventory.
        candidates = runtime_sources.get(runtime, [])
        if len(candidates) != 1:
            raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_MAPPING_REQUIRED")
        source = candidates[0]
        data = git_bytes(commit, source)
        if path.suffix == ".mjs":
            data = translate(data.decode("utf8"), source, runtime, layout, "runtime",
                             layout.get("importSpellings", {}).get(source))[0].encode("utf8")
        return data
    return git_bytes(commit, rel)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--pins", required=True, type=Path)
    args = parser.parse_args()
    commit = subprocess.check_output(["git", "rev-parse", "--verify", args.commit + "^{commit}"],
                                     cwd=ROOT, text=True).strip()
    if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
        raise RuntimeError("SOURCE_SNAPSHOT_COMMIT_REQUIRED")
    pin_path = args.pins.absolute()
    pin_bytes, _ = physical_read(pin_path)
    pins = json.loads(pin_bytes)
    if pins.get("format") != "LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_SOURCE_CAPSULE_V1":
        raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_PINS_FORMAT")
    layout = json.loads(git_bytes(commit, "scripts/layout.json"))
    if git_bytes(commit, "scripts/development/import_paths.py") != (ROOT / "scripts/development/import_paths.py").read_bytes():
        raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_TRANSLATOR_REQUIRED")
    original_paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", commit],
                                             cwd=ROOT, text=True).splitlines()
    runtime_sources = {}
    roots = layout.get("sourceRoots", [rule["source"] for rule in layout["rules"]])
    for source in original_paths:
        if not any(source == root or source.startswith(root.rstrip("/") + "/") for root in roots):
            continue
        target = map_path(source, layout, "runtime")
        if target is not None:
            runtime_sources.setdefault(target, []).append(source)
    targets, counts = {}, {}
    for family in ("financialCurrent", "runner", "mobile", "launcher"):
        rows = pins.get(family)
        if not isinstance(rows, list) or not rows or len(rows) > 4096:
            raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_PINS_REQUIRED")
        counts[family] = len(rows)
        for row in rows:
            if not isinstance(row, dict) or set(row) not in ({"path", "sha256"}, {"path", "sha256", "bytes"}):
                raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_PIN_FIELDS")
            sha = row["sha256"]
            if not isinstance(sha, str) or len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
                raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_PIN_HASH")
            path = destination(row["path"])
            key = path.relative_to(ROOT).as_posix()
            previous = targets.get(key)
            if previous and previous["sha256"] != sha:
                raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_PIN_CONFLICT")
            targets[key] = {"sha256": sha, "bytes": row.get("bytes")}
    staged, checked = [], []
    # Validate everything before creating the overlay; a mismatch produces no
    # usable manifest and cannot affect the funded original.
    for name, pin in sorted(targets.items()):
        path = ROOT / relative(name)
        current, mode = physical_read(path)
        data = current if digest(current) == pin["sha256"] else original_bytes(commit, path, layout, runtime_sources)
        if digest(data) != pin["sha256"] or (pin["bytes"] is not None and len(data) != pin["bytes"]):
            raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_BYTES_MISMATCH")
        row = {"path": name, "sha256": pin["sha256"], "bytes": len(data)}
        checked.append(row)
        if data != current:
            staged.append((name, data, mode))
    release = git_bytes(commit, RELEASE_SOURCE)
    release_runtime = map_path(RELEASE_SOURCE, layout, "runtime")
    if release_runtime is None:
        raise RuntimeError("SOURCE_SNAPSHOT_ORIGINAL_RELEASE_MAPPING")
    runtime_bytes = translate(release.decode("utf8"), RELEASE_SOURCE, release_runtime, layout, "runtime",
                              layout.get("importSpellings", {}).get(RELEASE_SOURCE))[0].encode("utf8")
    for name, data in ((RELEASE_SOURCE, release), (".internal/runtime/" + release_runtime, runtime_bytes)):
        current, mode = physical_read(ROOT / name)
        checked.append({"path": name, "sha256": digest(data), "bytes": len(data)})
        if data != current:
            staged.append((name, data, mode))
    base = ROOT / ".internal/dev/source-snapshots"
    base.mkdir(mode=0o700, parents=True, exist_ok=True)
    output = base / ("snapshot-" + str(uuid.uuid4()))
    output.mkdir(mode=0o700)
    overrides = []
    for name, data, mode in staged:
        target = output / "overlay" / relative(name)
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with target.open("xb") as stream:
            os.chmod(target, mode)
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        overrides.append({"path": name, "snapshot": "overlay/" + name,
                          "sha256": digest(data), "bytes": len(data)})
    manifest = {"format": "LIANUM_ORIGINAL_SOURCE_PUBLIC_SNAPSHOT_V1", "commit": commit,
                "originalPinsSHA256": digest(pin_bytes), "originalPinCounts": counts,
                "verified": checked, "overrides": overrides, "financialStateOpened": False,
                "workingTreeChanged": False, "requiresIsolatedMountNamespace": True}
    encoded = (json.dumps(manifest, indent=2) + "\n").encode("utf8")
    with (output / "snapshot.json").open("xb") as stream:
        os.chmod(output / "snapshot.json", 0o600)
        stream.write(encoded); stream.flush(); os.fsync(stream.fileno())
    print(json.dumps({"snapshot": str(output.relative_to(ROOT) / "snapshot.json"),
                      "sha256": digest(encoded), "originalPinCounts": counts,
                      "physicalOverrides": len(overrides), "financialStateOpened": False}))


if __name__ == "__main__":
    main()
