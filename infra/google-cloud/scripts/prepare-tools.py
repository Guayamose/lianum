#!/usr/bin/env python3
"""Install the pinned Terraform CLI locally; never authenticate or deploy.

Requires Python 3.12+ and Linux amd64 (the repository's WSL/Linux profile).
The immutable hash is checked against both downloaded bytes and HashiCorp's
published checksum list. Google provider signatures are checked by terraform
init using the committed .terraform.lock.hcl.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
import urllib.request
import zipfile

VERSION = "1.16.5"
SHA256 = "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4"
NAME = f"terraform_{VERSION}_linux_amd64.zip"
BASE = f"https://releases.hashicorp.com/terraform/{VERSION}/"


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "lianum-local-tools/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200 or response.url != url:
            raise RuntimeError("Terraform download must use the exact official HTTPS URL")
        return response.read(80 * 1024 * 1024)


def main():
    if sys.version_info < (3, 12) or platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise SystemExit("Use Python 3.12+ on Linux/WSL amd64; no other binary is installed.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    root = parser.parse_args().root.resolve()
    downloads = root / ".internal/dev/downloads"
    destination = root / f".internal/dev/toolchains/terraform-{VERSION}-linux-amd64"
    downloads.mkdir(parents=True, exist_ok=True)
    destination.mkdir(parents=True, exist_ok=True)
    archive = downloads / NAME
    sums = download(BASE + f"terraform_{VERSION}_SHA256SUMS").decode("ascii")
    published = dict((line.split()[1].lstrip("*"), line.split()[0]) for line in sums.splitlines() if line.strip())
    if published.get(NAME) != SHA256:
        raise RuntimeError("Official Terraform checksum differs from the reviewed pin")
    data = archive.read_bytes() if archive.exists() else download(BASE + NAME)
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise RuntimeError("Terraform archive checksum mismatch; installation aborted")
    if not archive.exists():
        archive.write_bytes(data)
    with zipfile.ZipFile(archive) as bundle:
        binary = bundle.read("terraform")
    output = destination / "terraform"
    temporary = destination / "terraform.pending"
    temporary.write_bytes(binary)
    temporary.chmod(0o755)
    os.replace(temporary, output)
    provenance = {"version": VERSION, "source": BASE + NAME, "sha256": SHA256,
                  "binarySha256": hashlib.sha256(binary).hexdigest(),
                  "checksumSource": BASE + f"terraform_{VERSION}_SHA256SUMS"}
    (destination / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(output.relative_to(root))


if __name__ == "__main__":
    main()
