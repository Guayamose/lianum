#!/usr/bin/env python3
"""Review/update current source pins, never historical publications or dependencies."""
import argparse
import difflib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
POLICY = "scripts/development/source-pins.json"
TARGETS = {
    "mobile": "packages/backend/src/operations/releases/native-value/native-value-dev-mobile-package-pins-v5.mjs",
    "platform": "apps/platform/src/original-device-cloud-source-pins-v1.mjs",
    "callers": "packages/backend/src/operations/recovery/native-device-local-operator-v1.mjs",
}
MOBILE_MANIFESTS = {
    "packageLockSHA256": "apps/mobile/package-lock.json",
    "mobilePackageSHA256": "apps/mobile/package.json",
    "localProtocolPackageSHA256": "packages/mobile-protocol/package.json",
}
MAX_BYTES = 16 * 1024 * 1024
HASH = re.compile(r"[0-9a-f]{64}\Z")


def sha(value):
    return hashlib.sha256(value).hexdigest()


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON field: " + key)
        value[key] = item
    return value


DECODER = json.JSONDecoder(object_pairs_hook=unique_object)


def public_path(name):
    if not isinstance(name, str) or not name or name.startswith("/") or "\\" in name:
        raise ValueError("Expected a declared public relative path")
    if any(not part or (part.startswith(".") and part not in (".travis.yml", ".jshintrc")) or part in ("archive", "secrets")
           for part in name.split("/")):
        raise ValueError("Private or escaping path is forbidden: " + name)
    if name.endswith((".pem", ".key", ".p12", ".pfx")):
        raise ValueError("Private key input is forbidden: " + name)
    return name


def fingerprint(info):
    return tuple(getattr(info, key) for key in
                 ("st_dev", "st_ino", "st_uid", "st_mode", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns"))


class Snapshot:
    def __init__(self, root):
        self.root = Path(root).absolute()
        if self.root.resolve() != self.root:
            raise ValueError("Repository root must not be an alias")
        self.files = {}

    def physical(self, name):
        path = self.root
        for part in public_path(name).split("/"):
            path = path / part
            if path.is_symlink():
                raise ValueError("Symlink input is forbidden: " + name)
        return path

    def read_now(self, name):
        path = self.physical(name)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > MAX_BYTES:
                raise ValueError("Expected one bounded regular public file: " + name)
            with os.fdopen(fd, "rb", closefd=False) as stream:
                value = stream.read(MAX_BYTES + 1)
            after = os.fstat(fd)
            named = self.physical(name).lstat()
            if len(value) != before.st_size or fingerprint(before) != fingerprint(after) or fingerprint(before) != fingerprint(named):
                raise ValueError("Concurrent input change: " + name)
            return value, fingerprint(before)
        finally:
            os.close(fd)

    def read(self, name):
        if name not in self.files:
            self.files[name] = self.read_now(name)
        return self.files[name][0]

    def verify(self, exclude=()):
        for name, original in self.files.items():
            if name not in exclude and self.read_now(name) != original:
                raise ValueError("Concurrent input change: " + name)


def marker_start(text, marker):
    if text.count(marker) != 1:
        raise ValueError("Expected exactly one fixed declaration: " + marker)
    return text.index(marker) + len(marker)


def json_at(text, offset):
    offset += len(text[offset:]) - len(text[offset:].lstrip())
    value, length = DECODER.raw_decode(text[offset:])
    return value, offset, offset + length


def rows_at(text, marker, wrapped=False):
    offset = marker_start(text, marker)
    offset += len(text[offset:]) - len(text[offset:].lstrip())
    if text[offset] != "[":
        raise ValueError("Expected fixed pin array")
    rows = []
    offset += 1
    while True:
        offset += len(text[offset:]) - len(text[offset:].lstrip())
        if text[offset] == "]":
            return rows
        if wrapped:
            prefix = "Object.freeze("
            if not text.startswith(prefix, offset):
                raise ValueError("Expected frozen JSON caller record")
            offset += len(prefix)
        row, start, end = json_at(text, offset)
        rows.append((row, start, end))
        offset = end
        if wrapped:
            if text[offset:offset + 1] != ")":
                raise ValueError("Unexpected caller expression")
            offset += 1
        offset += len(text[offset:]) - len(text[offset:].lstrip())
        if text[offset] == ",":
            offset += 1
        elif text[offset] != "]":
            raise ValueError("Unexpected pin array expression")


def exact_paths(rows, expected):
    expected = [public_path(path) for path in expected]
    actual = [row["path"] for row in rows]
    if len(set(expected)) != len(expected) or len(set(actual)) != len(actual) or set(actual) != set(expected):
        raise ValueError("Pin paths differ from the declared policy; review path changes explicitly")


def hash_field(text, key, value):
    pattern = re.compile(r'("' + re.escape(key) + r'"\s*:\s*")[0-9a-f]{64}(")')
    result, count = pattern.subn(lambda match: match[1] + value + match[2], text)
    if count != 1:
        raise ValueError("Expected one existing hash field: " + key)
    return result


def replace_row(text, row):
    text = hash_field(text, "sha256", row["sha256"])
    if "bytes" in row:
        text, count = re.subn(r'("bytes"\s*:\s*)\d+', lambda match: match[1] + str(row["bytes"]), text)
        if count != 1:
            raise ValueError("Expected one existing byte count")
    return text


class Plan:
    def __init__(self, root, profile):
        self.snapshot = Snapshot(root)
        self.policy = DECODER.decode(self.snapshot.read(POLICY).decode())
        if self.policy.get("schema") != "LIANUM_CURRENT_SOURCE_PIN_POLICY_V1":
            raise ValueError("Unknown source pin policy")
        self.profiles = list(TARGETS) if profile == "all" else [profile]
        if "platform" in self.profiles and "callers" not in self.profiles:
            self.profiles.append("callers")
        self.pending, self.changes, self.immutable_checks = {}, [], 0

    def source(self, name):
        # A dependent caller pins the proposed capsule, not its stale old bytes.
        return self.pending[name] if name in self.pending else self.snapshot.read(name)

    def change(self, profile, path, field, before, after):
        if before != after:
            self.changes.append({"profile": profile, "target": TARGETS[profile], "path": path,
                                 "field": field, "before": before, "after": after})

    def verify_packages(self, base, packages, exact=False):
        lock = DECODER.decode(self.snapshot.read(base + "/package-lock.json").decode())
        if exact and set(lock["packages"]) != {"", *("node_modules/" + row["name"] for row in packages)}:
            raise ValueError("Public dependency paths changed; dependency review is required")
        for row in packages:
            record = lock["packages"].get("node_modules/" + row["name"], {})
            if any(record.get(key) != row[key] for key in ("version", "resolved", "integrity")):
                raise ValueError("Public dependency lock changed: " + row["name"])
            installed = DECODER.decode(self.snapshot.read(base + "/node_modules/" + row["name"] + "/package.json").decode())
            if installed.get("name") != row["name"] or installed.get("version") != row["version"]:
                raise ValueError("Installed public dependency changed: " + row["name"])
            self.immutable_checks += 1

    def mobile(self, policy, text):
        marker = "export const NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5 = Object.freeze("
        data, start, end = json_at(text, marker_start(text, marker))
        if set(data) != {*MOBILE_MANIFESTS, "packages", "rawFiles"} or policy["manifests"] != MOBILE_MANIFESTS:
            raise ValueError("Unexpected mobile manifest policy or fields")
        if [row["name"] for row in data["packages"]] != policy["packages"]:
            raise ValueError("Mobile dependency names changed")
        self.verify_packages("apps/mobile", data["packages"])
        exact_paths(data["rawFiles"], policy["rawPaths"])
        for row in data["rawFiles"]:
            if set(row) != {"path", "sha256"} or not row["path"].startswith("mobile-app/node_modules/"):
                raise ValueError("Unexpected public mobile dependency record")
            path = "apps/mobile/" + row["path"][len("mobile-app/"):]
            if sha(self.snapshot.read(path)) != row["sha256"]:
                raise ValueError("Immutable public dependency bytes changed: " + path)
            self.immutable_checks += 1
        new_literal = text[start:end]
        for key, path in MOBILE_MANIFESTS.items():
            digest = sha(self.source(path))
            self.change("mobile", path, key, data[key], digest)
            new_literal = hash_field(new_literal, key, digest)
            data[key] = digest
        text = text[:start] + new_literal + text[end:]
        digest = sha(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())
        expression = re.compile(r"(export const NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5 = ')[0-9a-f]{64}(';)")
        matches = list(expression.finditer(text))
        if len(matches) != 1:
            raise ValueError("Expected one mobile package catalog digest")
        original = matches[0].group()[len(matches[0][1]):-len(matches[0][2])]
        self.change("mobile", TARGETS["mobile"], "catalogSHA256", original, digest)
        return expression.sub(lambda match: match[1] + digest + match[2], text)

    def rows(self, profile, policy, text):
        platform = profile == "platform"
        parsed = rows_at(text, "const PINS=Object.freeze(" if platform else "const reviewedCallers = Object.freeze(", not platform)
        immutable = policy.get("dependencyPaths", [])
        mutable = policy["mutablePaths"]
        exact_paths([row for row, _, _ in parsed], mutable + immutable)
        if platform:
            packages = [dict(value, name=path[len("node_modules/"):]) for path, value in policy["packages"].items()]
            self.verify_packages("apps/platform", packages, exact=True)
            manifest = DECODER.decode(self.snapshot.read("apps/platform/package.json").decode())
            if manifest.get("dependencies", {}) != policy["dependencies"] or manifest.get("devDependencies", {}):
                raise ValueError("Platform public dependencies changed; explicit dependency review required")
        replacements = []
        for row, start, end in parsed:
            if set(row) != {"path", "bytes", "sha256"} or not HASH.fullmatch(row["sha256"]) or type(row["bytes"]) is not int:
                raise ValueError("Unexpected source pin fields")
            name = row["path"]
            if platform:
                allowed = name in immutable and name.startswith("node_modules/") or name in mutable and (
                    name.startswith(("src/", "migrations/")) or name in ("package.json", "package-lock.json"))
                path = "apps/platform/" + name
            else:
                allowed, path = name.startswith("apps/platform/src/") and name.endswith(".mjs"), name
            if not allowed:
                raise ValueError("Source outside the fixed public profile: " + name)
            value = self.source(path)
            changed = dict(row, bytes=len(value), sha256=sha(value))
            if name in immutable:
                if changed != row:
                    raise ValueError("Immutable public dependency bytes changed: " + path)
                self.immutable_checks += 1
            else:
                for key in ("bytes", "sha256"):
                    self.change(profile, path, key, row[key], changed[key])
                replacements.append((start, end, replace_row(text[start:end], changed)))
        for start, end, replacement in reversed(replacements):
            text = text[:start] + replacement + text[end:]
        return text

    def build(self):
        for profile in self.profiles:
            policy = self.policy["profiles"][profile]
            target = TARGETS[profile]
            if policy["target"] != target:
                raise ValueError("Only the three current pin tables may be updated")
            original = self.snapshot.read(target)
            text = original.decode()
            new = (self.mobile(policy, text) if profile == "mobile" else self.rows(profile, policy, text)).encode()
            if new != original:
                self.pending[target] = new
        self.snapshot.verify()
        return self

    def apply(self):
        """Stage all files, recheck every observed input, then replace only our targets.

        The policy file supplies the cross-process flock; a detected concurrent
        editor write aborts and restores only files still equal to our own write.
        """
        staged, written = {}, []
        try:
            for name, value in self.pending.items():
                path = self.snapshot.physical(name)
                with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".source-pins-", delete=False) as stream:
                    staged[name] = Path(stream.name)
                    os.fchmod(stream.fileno(), stat.S_IMODE(path.stat().st_mode))
                    stream.write(value)
                    stream.flush()
                    os.fsync(stream.fileno())
            self.snapshot.verify()
            for name, temporary in staged.items():
                self.snapshot.verify(exclude=written)
                os.replace(temporary, self.snapshot.physical(name))
                written.append(name)
            self.snapshot.verify(exclude=written)
            for name in written:
                if self.snapshot.read_now(name)[0] != self.pending[name]:
                    raise ValueError("Concurrent output change: " + name)
            return written
        except BaseException:
            for name in reversed(written):
                if self.snapshot.read_now(name)[0] == self.pending[name]:
                    path = self.snapshot.physical(name)
                    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".source-pins-", delete=False) as stream:
                        restore = Path(stream.name)
                        os.fchmod(stream.fileno(), stat.S_IMODE(path.stat().st_mode))
                        stream.write(self.snapshot.files[name][0])
                    os.replace(restore, path)
            raise
        finally:
            for path in staged.values():
                path.unlink(missing_ok=True)

    def report(self, action, written):
        diffs = []
        for path, value in self.pending.items():
            diff = "".join(difflib.unified_diff(self.snapshot.files[path][0].decode().splitlines(True),
                value.decode().splitlines(True), fromfile="a/" + path, tofile="b/" + path))
            diffs.append({"path": path, "diff": diff})
        return {"action": action, "status": "UPDATED" if written else "STALE" if self.pending else "CURRENT",
                "profiles": self.profiles, "changes": self.changes, "diffs": diffs, "written": written,
                "immutableDependencyChecks": self.immutable_checks, "published": False, "financialAcceptance": False}


def run(action="check", profile="all", root=ROOT):
    if action not in ("check", "update") or profile not in (*TARGETS, "all"):
        raise ValueError("Unknown pin action/profile")
    guard = Snapshot(root)
    path = guard.physical(POLICY)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX if action == "update" else fcntl.LOCK_SH)
        plan = Plan(root, profile).build()
        if fingerprint(os.fstat(fd)) != plan.snapshot.files[POLICY][1]:
            raise ValueError("Concurrent policy replacement")
        written = plan.apply() if action == "update" and plan.pending else []
        return plan.report(action, written)
    finally:
        os.close(fd)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("check", "update"), default="check")
    parser.add_argument("--profile", choices=(*TARGETS, "all"), default="all")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        report = run(args.action, args.profile)
    except (ValueError, OSError, KeyError, TypeError, IndexError) as error:
        report = {"action": args.action, "status": "BLOCKED", "error": str(error), "written": [],
                  "published": False, "financialAcceptance": False}
    if args.json:
        print(json.dumps(report, indent=2))
    elif report["status"] == "BLOCKED":
        print("Pins BLOCKED: " + report["error"], file=sys.stderr)
    else:
        print(f"Pins {report['status']}: {', '.join(report['profiles'])}; {len(report['changes'])} field changes; "
              f"{report['immutableDependencyChecks']} immutable dependency checks.")
        for change in report["changes"]:
            print(f"{change['profile']} {change['path']} {change['field']}: {change['before']} -> {change['after']}")
        if report["status"] == "STALE":
            print(f"Review changes, then run: ./dev pins update --profile {args.profile}")
        if report["written"]:
            print("Review the exact changes with git diff. Historical publications and financial acceptance are unchanged.")
    return 2 if report["status"] == "BLOCKED" else 1 if report["status"] == "STALE" else 0


if __name__ == "__main__":
    raise SystemExit(main())
