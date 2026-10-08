"""Fresh fixed BTC/SOL claim acceptance; never resumes a historical attempt."""
import fcntl
import hashlib
import json
import signal
import subprocess
import sys
import time
from workspace import ROOT, DEV, RUNTIME, build

NODE = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
PROFILE = "FRESH_BTC_SOL_CUSTODIAL_PRIVATE_CLAIM_ROUNDTRIPS_V1"
ENTRY = FLAT / "integration/claims/development/run-development-native-claim-flow.mjs"
DIRECTORY = FLAT / ".local/development-native-claim-roundtrip-v1"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
active = None
interrupted = False

def forward_signal(signum, _frame):
    global interrupted
    interrupted = True
    if active is not None and active.poll() is None:
        active.send_signal(signum)

def run(entry, observe=False):
    global active
    if interrupted:
        raise SystemExit(130)
    previous = set(DIRECTORY.glob("attempt-*")) if observe else set()
    active = subprocess.Popen([str(NODE), str(entry)], cwd=FLAT, env=CLEAN_ENV)
    seen = None
    while active.poll() is None:
        if observe:
            try:
                lock = json.loads((DIRECTORY / "active.lock").read_text())
                if lock["pid"] == active.pid:
                    result = json.loads((FLAT / lock["attempt"] / "result.json").read_text())
                    current = (result.get("phase"), len(result.get("proofs", [])))
                    if current != seen:
                        print(json.dumps({"stage": current[0], "realProofs": current[1]}), flush=True)
                        seen = current
            except (FileNotFoundError, KeyError, json.JSONDecodeError):
                pass
        time.sleep(1)
    code = active.returncode
    active = None
    if observe:
        new = set(DIRECTORY.glob("attempt-*")) - previous
        if len(new) != 1:
            raise SystemExit("Claims lab produced no single new attempt; earlier reports are not reused")
        retain_summary(new.pop())
    if code:
        raise SystemExit(code if code > 0 else 2)

def retain_summary(attempt):
    result_bytes = (attempt / "result.json").read_bytes()
    resources_bytes = (attempt / "resources.json").read_bytes()
    result = json.loads(result_bytes)
    resources = json.loads(resources_bytes)
    accepted = result.get("success") is True and result.get("profile") == PROFILE \
        and resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True
    summary = {"format": "LIANUM_DEVELOPMENT_NATIVE_CLAIMS_LAB_V1", "accepted": accepted,
        "runId": result.get("runId"), "attempt": str(attempt.relative_to(ROOT)),
        "scope": PROFILE, "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest(),
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest(),
        "sourcePinsSHA256": resources.get("sourcePinsSHA256"),
        "failure": resources.get("failure"), "workerFailure": result.get("errorCode"),
        "realProofCount": len(result.get("proofs", [])),
        "proofRelations": [row["relation"] for row in result.get("proofs", [])],
        "proofHashes": [{key: row.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")} for row in result.get("proofs", [])],
        "nativeEffects": result.get("nativeEffects"), "redemptions": result.get("redemptions"),
        "checks": result.get("checks"), "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"),
        "resourceSummary": resources.get("resourceSummary"),
        "nativeSelfCustody": False, "independentOperators": False, "nativeProcessRestartEstablished": False,
        "keeperLossRecoveryEstablished": False, "graphExecutionEstablished": False, "fullWalletAcceptance": False,
        "limitations": ["Fresh same-host fake-value BTC regtest, custom Solana validator and EVM only.",
            "Private balances are custodial native claims; native keys and original operator processes remain in this lab.",
            "Clean original keeper/controller and owner/coordinator restart with surviving original credentials.",
            "One admitted HTTP response is deliberately discarded; no physical network outage is simulated.",
            "No native process/key loss, independent operators, graph execution, public network or full wallet acceptance."]}
    destination = DEV / "reports/native-claims-lab.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(destination)
    print(json.dumps({"accepted": accepted, "realProofCount": summary["realProofCount"], "report": str(destination.relative_to(ROOT))}), flush=True)
    if not accepted:
        raise SystemExit(1)

def main():
    if len(sys.argv) != 1:
        raise SystemExit("Usage: ./dev lab claims")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    with (DEV / "native-claims-lab.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another native claims lab is active")
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, forward_signal)
        # Fixed bounded public build validates/reuses the same genuine CI51 and
        # CO42 circuits, program/VK and current public verifier compiler receipts.
        # Its own preflight and global proof lock reject concurrent heavy work.
        run(FLAT / "scripts/prepare-development-native-claims.mjs")
        run(ENTRY, observe=True)

if __name__ == "__main__":
    main()
