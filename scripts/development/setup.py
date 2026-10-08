#!/usr/bin/env python3
"""Restore public development dependencies without changing frozen source files."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / ".internal/runtime"
DEV = ROOT / ".internal/dev"
DOWNLOADS = DEV / "downloads"
REPORTS = DEV / "reports"
OBJECTS = DEV / "public-objects"
NODE_VERSION = "24.14.0"
NODE_ARCHIVE_HASH = "41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df"
NODE_ROOT = DEV / "toolchains" / f"node-v{NODE_VERSION}-linux-x64"
PACKAGE_AUDIT_HASH = "81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6"
PROOF_LOCK_HASH = "03d180659e066007b0add05f6bbe7f1c846e19d8c913645ac1cae3f5fe6104ba"
CRS_PROVENANCE_HASH = "e24f63bcea7cc9d1430c3696c109569015fc38c6e44d5a46ebab3a64013939e3"


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked(path, expected, size=None):
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        raise RuntimeError(f"Expected a regular file: {path}")
    if size is not None and path.stat().st_size != size:
        raise RuntimeError(f"Size mismatch: {path}")
    if digest(path) != expected:
        raise RuntimeError(f"SHA256 mismatch: {path}")
    return path


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def relative_path(raw):
    path = Path(raw)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise RuntimeError("Invalid restoration path")
    return path


def download(url, filename, expected, size=None, byte_range=None):
    destination = DOWNLOADS / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return checked(destination, expected, size)
    part = destination.with_name(destination.name + ".part")
    print(f"Downloading {filename}", flush=True)
    headers = {"User-Agent": "Lianum-development-restoration/1"}
    if byte_range:
        headers["Range"] = byte_range
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != (206 if byte_range else 200):
            raise RuntimeError(f"Unexpected HTTP status for {filename}: {response.status}")
        if byte_range and response.headers.get("Content-Range", "").split("/")[0] != "bytes 0-67108863":
            raise RuntimeError("Unexpected CRS Content-Range")
        with part.open("wb") as stream:
            shutil.copyfileobj(response, stream, length=1024 * 1024)
    checked(part, expected, size)
    part.replace(destination)
    return destination


def extract(archive, target, top_level=None):
    if target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="extract-", dir=target.parent) as temporary:
        staging = Path(temporary)
        with tarfile.open(archive) as source:
            source.extractall(staging, filter="data")
        if top_level:
            (staging / top_level).rename(target)
        else:
            staging.rename(target)


def source_index():
    index = {}
    for directory, dirs, files in os.walk(ROOT):
        parent = Path(directory)
        dirs[:] = [name for name in dirs if name not in [".internal", "node_modules", ".git", "__pycache__"]
                   and not (parent / name).is_symlink()]
        for name in files:
            path = parent / name
            if path.is_file() and not path.is_symlink():
                index.setdefault(digest(path), path)
    for path in OBJECTS.iterdir():
        if path.is_file() and not path.is_symlink() and len(path.name) == 64:
            checked(path, path.name)
            index.setdefault(path.name, path)
    return index


def restoration_rows():
    canonical = json.loads((ROOT / "archive/restoration/recipes/canonical-root-restoration.json").read_text())
    rows = [row for row in canonical["files"] if row["kind"] == "public-dependency"]
    recipes = ["public-proof-dependency-restoration.json", "stage-dependency-restoration.json",
               "retained-reader-dependency-restoration.json", "flat-lineage-restoration.json",
               "i84-reader-restoration.json", "node-component-restoration.json",
               "w39-original-restoration.json"]
    for name in recipes:
        data = json.loads((ROOT / "archive/restoration/recipes" / name).read_text())
        rows.extend(data["files"])
    rows.extend(json.loads((ROOT / "archive/restoration/recipes/legacy-verifier-restoration.json").read_text()))
    rows.extend([
        {"path": "omnichain-product/evidence/m15-linux-package-provenance.json", "sha256": PACKAGE_AUDIT_HASH},
        {"path": "golden-overlay-v17/development-evidence/supervision/restored-crs.json", "sha256": CRS_PROVENANCE_HASH},
    ])
    return rows


def restoration_inventory():
    wanted = {}
    ambiguous = []
    for row in restoration_rows():
        rel = str(relative_path(row["path"]))
        if rel.endswith("/active.lock"):
            continue
        if rel in wanted and wanted[rel]["sha256"] != row["sha256"]:
            ambiguous.append(rel)
            continue
        wanted.setdefault(rel, row)
    return wanted, sorted(set(ambiguous))


def restore_public():
    index = source_index()
    wanted, ambiguous = restoration_inventory()
    result = {"copied": [], "alreadyPresent": [], "missing": [], "conflicts": [],
              "historicalRecipeDisagreements": ambiguous, "frozenSourcesOverwritten": False,
              "privateStateRestored": False, "executionGatesChanged": False}
    for rel, row in wanted.items():
        target = PROJECT / relative_path(rel)
        if any(parent.is_symlink() for parent in [target, *target.parents] if parent != ROOT.parent):
            raise RuntimeError(f"Restoration destination contains a symlink: {rel}")
        if target.exists():
            if target.is_file() and not target.is_symlink() and digest(target) == row["sha256"]:
                result["alreadyPresent"].append(rel)
            else:
                result["conflicts"].append({"path": rel, "expectedHistoricalSHA256": row["sha256"],
                                            "currentSHA256": digest(target) if target.is_file() else None})
            continue
        source = index.get(row["sha256"])
        if source is None:
            result["missing"].append({"path": rel, "sha256": row["sha256"], "bytes": row.get("bytes")})
            continue
        checked(source, row["sha256"], row.get("bytes"))
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(0o644)
        checked(target, row["sha256"], row.get("bytes"))
        result["copied"].append(rel)
    write_json(REPORTS / "public-restoration.json", result)
    print(json.dumps({key: len(result[key]) for key in ["copied", "alreadyPresent", "missing", "conflicts"]}), flush=True)


def prepare_node():
    archive = download(f"https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-linux-x64.tar.xz",
                       f"node-v{NODE_VERSION}-linux-x64.tar.xz", NODE_ARCHIVE_HASH)
    extract(archive, NODE_ROOT, NODE_ROOT.name)
    version = subprocess.check_output([str(NODE_ROOT / "bin/node"), "--version"], text=True).strip()
    if version != "v" + NODE_VERSION:
        raise RuntimeError("Wrong project Node version")
    write_json(REPORTS / "node.json", {"version": version, "archiveSHA256": NODE_ARCHIVE_HASH,
                                      "path": str(NODE_ROOT), "globalRuntimeChanged": False})
    print(f"Node {version} ready", flush=True)


def prepare_proof_node():
    version = "24.19.0"
    expected = "14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
    target = DEV / "toolchains" / f"node-v{version}-linux-x64"
    archive = download(f"https://nodejs.org/dist/v{version}/node-v{version}-linux-x64.tar.xz",
                       target.name + ".tar.xz", expected)
    extract(archive, target, target.name)
    actual = subprocess.check_output([str(target / "bin/node"), "--version"], text=True).strip()
    audit = json.loads(checked(OBJECTS / PACKAGE_AUDIT_HASH, PACKAGE_AUDIT_HASH).read_text())
    if actual != audit["node"]:
        raise RuntimeError("Original proof evidence requires a different Node")
    write_json(REPORTS / "proof-node.json", {"version": actual, "archiveSHA256": expected,
                                             "path": str(target), "globalRuntimeChanged": False})
    print(f"Original proof-evidence Node {actual} ready", flush=True)


def npm_environment():
    env = dict(os.environ)
    for key in list(env):
        if key.upper().startswith("NPM_CONFIG_") or key in ["NODE_OPTIONS", "NODE_PATH"]:
            env.pop(key)
    env["PATH"] = str(NODE_ROOT / "bin") + os.pathsep + "/usr/bin:/bin"
    configs = DEV / "npm-config"
    configs.mkdir(exist_ok=True)
    for name in ["user", "global"]:
        path = configs / name
        if not path.exists():
            path.write_text("")
        if path.read_bytes():
            raise RuntimeError("Project npm configuration must remain empty")
    env.update({"NPM_CONFIG_USERCONFIG": str(configs / "user"),
                "NPM_CONFIG_GLOBALCONFIG": str(configs / "global"),
                "NPM_CONFIG_CACHE": str(DEV / "npm-cache")})
    return env


def materialize_modules(source, targets):
    for target in targets:
        if target.exists():
            # Restoration may have populated only part of a dependency tree.
            # Authenticate existing files first, then fill strictly absent files.
            absent = []
            for path in source.rglob("*"):
                if not path.is_file() or ".bin" in path.parts:
                    continue
                other = target / path.relative_to(source)
                if other.exists():
                    checked(other, digest(path), path.stat().st_size)
                else:
                    absent.append((path, other))
            for path, other in absent:
                other.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, other)
            continue
        shutil.copytree(source, target, ignore=shutil.ignore_patterns(".bin"))


def prepare_packages():
    audit = json.loads(checked(OBJECTS / PACKAGE_AUDIT_HASH, PACKAGE_AUDIT_HASH).read_text())
    proof = DEV / "npm-proof"
    proof.mkdir(exist_ok=True)
    lock = checked(PROJECT / "omnichain-product/experiments/pc5-proof-probe/package-lock.json", PROOF_LOCK_HASH)
    root_package = json.loads(lock.read_text())["packages"][""]
    (proof / "package.json").write_text(json.dumps(root_package, indent=2) + "\n")
    shutil.copyfile(lock, proof / "package-lock.json")
    env = npm_environment()
    command = [str(NODE_ROOT / "bin/node"), str(NODE_ROOT / "lib/node_modules/npm/bin/npm-cli.js"),
               "ci", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund",
               "--registry=https://registry.npmjs.org/"]
    print("Installing original proof lock with lifecycle scripts disabled", flush=True)
    subprocess.run(command, cwd=proof, env=env, check=True)
    package_pins = []
    for row in audit["packages"]:
        if not row["installed"]:
            if (proof / row["path"]).exists():
                raise RuntimeError("An excluded optional package was installed")
            continue
        checked(proof / row["path"] / "package.json", row["packageJSONSHA256"])
        package_pins.append({"path": row["path"], "version": row["version"], "sha256": row["packageJSONSHA256"]})
    for row in audit["wasm"]:
        checked(proof / row["path"], row["sha256"], row["bytes"])
    materialize_modules(proof / "node_modules", [
        PROJECT / "omnichain-product/experiments/private-core-proof/node_modules",
        PROJECT / "omnichain-product/experiments/pc5-proof-probe/node_modules",
        PROJECT / "golden-overlay-v17/experiments/private-core-proof/node_modules",
    ])
    compiler = DEV / "npm-solc"
    compiler.mkdir(exist_ok=True)
    original = PROJECT / "golden-overlay-v17/tools/solidity-js"
    for name in ["package.json", "package-lock.json"]:
        shutil.copyfile(original / name, compiler / name)
    print("Installing original Solidity compiler lock", flush=True)
    subprocess.run(command, cwd=compiler, env=env, check=True)
    soljson_hash = "221d7a667378b5068d913e75fe092507e061363cd1d23b64c49ae82febabad4c"
    checked(compiler / "node_modules/solc/soljson.js", soljson_hash)
    materialize_modules(compiler / "node_modules", [original / "node_modules",
                                                   PROJECT / "omnichain-product/tools/solidity-js/node_modules"])
    write_json(REPORTS / "packages.json", {"originalLockSHA256": PROOF_LOCK_HASH, "packagePins": package_pins,
                                           "wasmPins": audit["wasm"], "soljsonSHA256": soljson_hash,
                                           "lifecycleScriptsExecuted": False, "optionalPackagesInstalled": False})


def prepare_crs():
    g1 = download("https://crs.aztec-cdn.foundation/g1_compressed.dat", "bn254_g1_compressed.dat",
                  "3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37", 67108864,
                  "bytes=0-67108863")
    g2 = download("https://crs.aztec-cdn.foundation/g2.dat", "bn254_g2.dat",
                  "01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f", 128)
    provenance = checked(OBJECTS / CRS_PROVENANCE_HASH, CRS_PROVENANCE_HASH)
    for name in ["omnichain-product", "golden-overlay-v17"]:
        target = PROJECT / name / "experiments/private-core-proof/native-notes/.local/crs/2097152"
        target.mkdir(parents=True, exist_ok=True)
        for source, filename in [(g1, g1.name), (g2, g2.name), (provenance, "provenance.json")]:
            destination = target / filename
            if destination.exists():
                checked(destination, digest(source), source.stat().st_size)
            else:
                shutil.copyfile(source, destination)
    write_json(REPORTS / "crs.json", {"g1SHA256": digest(g1), "g1Bytes": g1.stat().st_size,
                                      "g2SHA256": digest(g2), "g2Bytes": g2.stat().st_size,
                                      "historicalProvenanceSHA256": CRS_PROVENANCE_HASH,
                                      "proofGenerated": False})
    print("Public CRS verified", flush=True)


def prepare_native_bb():
    """Restore execution permission for the exact original BB5.2 binary."""
    binary = PROJECT / "omnichain-product/experiments/private-core-proof/node_modules/@aztec/bb.js/build/amd64-linux/bb"
    expected = "5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b"
    checked(binary, expected, 38240512)
    if binary.resolve() != binary.absolute():
        raise RuntimeError("Native BB must use its physical original path")
    flat = PROJECT / "omnichain-flat-profile/flat-wallet"
    if (flat / ".local/proof-workers/active.lock").exists() or Path("/tmp/lianum-paeg-proof-host.lock").exists():
        raise RuntimeError("Review and retain the original proof lock before changing native BB permissions")
    for lock in (flat / ".local").glob("*/active.lock"):
        raise RuntimeError("Native BB permissions cannot change during an original supervised run")
    previous = binary.stat().st_mode & 0o777
    binary.chmod(0o755)
    checked(binary, expected, 38240512)
    write_json(REPORTS / "native-bb-permissions.json", {
        "path": str(binary), "sha256": expected, "bytes": 38240512,
        "previousMode": oct(previous), "mode": "0o755", "originalBytesUnchanged": True,
        "proofGenerated": False, "nativeProcessStarted": False})
    print("Original native BB execution permission restored; bytes unchanged", flush=True)


def prepare_native():
    native = PROJECT / "omnichain-product/.local/linux-runtimes"
    native.mkdir(parents=True, exist_ok=True)
    artifacts = [
        ("foundry_v1.8.4_linux_amd64.tar.gz",
         "https://github.com/foundry-rs/foundry/releases/download/v1.8.4/foundry_v1.8.4_linux_amd64.tar.gz",
         "699e2207a6a9b27ca17c48c81e56f1677ed9c58b623b59128b4e15ec9da0625e", "foundry-v1.8.4"),
        ("bitcoin-31.1-x86_64-linux-gnu.tar.gz",
         "https://bitcoincore.org/bin/bitcoin-core-31.1/bitcoin-31.1-x86_64-linux-gnu.tar.gz",
         "b80d9c3e04da78fb6f0569685673418cf686fadba9042d926d13fb87ff503f9e", "bitcoin-v31.1"),
        ("solc-linux-amd64-v0.8.37+commit.f401782d",
         "https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.37+commit.f401782d",
         "5de843c2c93563cc66425c99a4fb13fdbf32b4c4ae07469480faaf126e14404a", None),
    ]
    for filename, url, expected, folder in artifacts:
        artifact = download(url, filename, expected)
        target = native / (folder or filename)
        if folder:
            extract(artifact, target)
        elif not target.exists():
            shutil.copyfile(artifact, target)
            target.chmod(0o755)
        checked(target, expected) if not folder else None
    pins = {
        "anvil": ("foundry-v1.8.4/anvil", "be5129d636ea18440d43908536f13ba6578859b695f2ca33f1f09a00aa9dc176"),
        "bitcoind": ("bitcoin-v31.1/bitcoin-31.1/bin/bitcoind", "986e63b3c8770f08d0059820ad3dd085d1ab9e1bea23946c243f858a06888a08"),
        "bitcoin-cli": ("bitcoin-v31.1/bitcoin-31.1/bin/bitcoin-cli", "4e3a0fde23ec768a61cdd193602be937b29b6e8f21bcb614af87a2786bf86034"),
        "solc": ("solc-linux-amd64-v0.8.37+commit.f401782d", "5de843c2c93563cc66425c99a4fb13fdbf32b4c4ae07469480faaf126e14404a"),
    }
    results = {}
    for name, (relative, expected) in pins.items():
        binary = checked(native / relative, expected)
        flag = "-version" if name.startswith("bitcoin") else "--version"
        proc = subprocess.run([str(binary), flag], capture_output=True, text=True, timeout=20, check=True)
        results[name] = {"path": str(binary), "sha256": expected, "version": (proc.stdout + proc.stderr).strip()}
    write_json(REPORTS / "native-tools.json", {"binaries": results, "chainNodesStarted": False,
                                               "solanaCustomBinaryRestored": False, "tronPatchedRuntimeRestored": False})
    print("EVM, Bitcoin and native Solidity tools verified", flush=True)


def prepare_solana():
    native = PROJECT / "omnichain-product/.local/linux-runtimes"
    archive_hash = "c43539ebdf6942472e8b87635d6ea55f428a51e3d0219f7b6f720fc6b19fade0"
    archive = download("https://github.com/anza-xyz/agave/releases/download/v2.3.13/solana-release-x86_64-unknown-linux-gnu.tar.bz2",
                       "solana-release-v2.3.13-x86_64-unknown-linux-gnu.tar.bz2", archive_hash)
    extract(archive, native / "agave-v2.3.13")
    pins = {
        "validator": ("agave-validator", "5024f1b59afed531d4de067159084bf6ec7f20ab4b5424a61f8da3a23a4646dd"),
        "genesis": ("solana-genesis", "19bb6f182cc67d7238457a358a95ba4c075fcc28ec0363397e13711d6e3b93cb"),
        "cli": ("solana", "ad7ae4b1dcb5cc1bb3395e0fd578d0827fd506451f3497a275de5413a6f3ccd5"),
        "keygen": ("solana-keygen", "7560bd13a8d21124ed89969dac0e1f798e7d22d6d241e1eb8c1f2c029f430705"),
        "stock-test-validator": ("solana-test-validator", "d1825e82b9bb65752f6adfe03881077686eaf7b9e153a4530a1496eece744df4"),
        "poh-library": ("perf-libs/libpoh-simd.so", "e43a4b70fa85f49463fc872fd6a735317f3468010d1e656e68f4801e7998e9f9"),
    }
    results = {}
    for name, (filename, expected) in pins.items():
        path = checked(native / "agave-v2.3.13/solana-release/bin" / filename, expected)
        row = {"path": str(path), "sha256": expected}
        if name in ["cli", "genesis", "keygen"]:
            row["version"] = subprocess.check_output([str(path), "--version"], text=True, timeout=20).strip()
        results[name] = row
    write_json(REPORTS / "solana-tools.json", {"archiveSHA256": archive_hash, "binaries": results,
                                               "nodeStarted": False, "customCandidateSubstituted": False})
    print("Pinned official Solana CLI/genesis tools verified; custom candidate remains separate", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("steps", nargs="*", choices=["public", "node", "proof-node", "packages", "crs", "native", "native-bb", "solana"])
    args = parser.parse_args()
    for path in [DEV, DOWNLOADS, REPORTS, OBJECTS, DEV / "toolchains"]:
        path.mkdir(parents=True, exist_ok=True)
    steps = args.steps or ["public", "node", "proof-node", "packages", "crs", "native", "native-bb", "solana"]
    functions = {"public": restore_public, "node": prepare_node, "packages": prepare_packages,
                 "crs": prepare_crs, "native": prepare_native, "solana": prepare_solana,
                 "proof-node": prepare_proof_node, "native-bb": prepare_native_bb}
    for step in steps:
        functions[step]()


if __name__ == "__main__":
    main()
