#!/usr/bin/env python3
"""Read-only inventory of historical artifacts needed by the encoding tests."""
import hashlib
import json
from workspace import RUNTIME, DEV

ARTIFACTS = [
    {
        "path": "omnichain-flat-profile/candidate-poseidon/.local/component/attempts/prove-2/public-inputs.json",
        "consumer": "packages/backend/tests/execution/encoding/statements.test.mjs",
        "expectedSHA256": None,
        "recovery": "Original retained node proof public inputs; no original digest is pinned by this test. A new diagnostic cannot be labelled the original proof.",
    },
    {
        "path": "omnichain-flat-profile/flat-wallet/.local/contracts/2e02620a-404c-4c27-9ac2-4132713e083b/compiled.json",
        "consumer": "packages/backend/tests/execution/encoding/transaction-codec.test.mjs",
        "expectedSHA256": "002f75913819548845ebce0928a40b09fdf07b370d104f0a4dd17b2bd051cb58",
        "recovery": "Requires the exact historical compilation bytes. A fresh reproducible compilation is a separate artifact and needs its own explicit test/reference.",
    },
]


def main():
    rows = []
    for spec in ARTIFACTS:
        path = RUNTIME / spec["path"]
        actual = hashlib.file_digest(path.open("rb"), "sha256").hexdigest() if path.is_file() else None
        status = "MISSING" if actual is None else "HASH_MISMATCH" if spec["expectedSHA256"] and actual != spec["expectedSHA256"] else "PRESENT"
        rows.append({**spec, "status": status, "actualSHA256": actual})
        print(f"{status:14} {spec['consumer']}")
    report = {"schema": "LIANUM_HISTORICAL_ENCODING_ARTIFACTS_V1", "artifacts": rows,
              "scope": "These two historical tests only; not a complete inventory of all integration requirements",
              "generated": False, "testsSkipped": False}
    target = DEV / "reports/artifact-inventory.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Inventory: {target}")


if __name__ == "__main__":
    main()
