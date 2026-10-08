"""Prepare reviewed public artifacts and run one fresh fake-value EVM wallet lab."""
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from workspace import ROOT, DEV, RUNTIME, build

NODE = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
active = None
interrupted = False
pending_signal = None
last_lab_attempt = None

def forward_signal(signum, _frame):
    global interrupted, pending_signal
    interrupted = True
    pending_signal = signum
    if active is not None and active.poll() is None:
        active.send_signal(signum)

def run(entry, *arguments, observe=False, flow="manual-wallet-acceptance"):
    global active, last_lab_attempt
    if interrupted:
        raise SystemExit(130)
    print(f"Lab EVM: {entry}", flush=True)
    directory = FLAT / ".local" / flow
    previous_attempts = set(directory.glob("attempt-*")) if observe else set()
    if observe:
        last_lab_attempt = None
    owner_pid = os.getpid()
    def guard_parent():
        if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
            os._exit(125)
    active = subprocess.Popen([str(NODE), str(FLAT / entry), *arguments], cwd=FLAT, env=CLEAN_ENV, preexec_fn=guard_parent)
    # A signal may arrive while Popen has not yet returned the owned child.
    if interrupted and active.poll() is None:
        active.send_signal(pending_signal or signal.SIGTERM)
    seen = None
    while active.poll() is None:
        if observe:
            try:
                lock = json.loads((directory / "active.lock").read_text())
                if lock["pid"] == active.pid:
                    result = json.loads((FLAT / lock["attempt"] / "result.json").read_text())
                    current = (result.get("phase"), len(result.get("proofs", [])))
                    if current != seen:
                        print(json.dumps({"stage": current[0], "realProofs": current[1]}), flush=True)
                        seen = current
            except (FileNotFoundError, json.JSONDecodeError, KeyError):
                pass
        time.sleep(1)
    code = active.returncode
    active = None
    if observe:
        new_attempts = set(directory.glob("attempt-*")) - previous_attempts
        if len(new_attempts) == 1:
            last_lab_attempt = new_attempts.pop()
    if code:
        raise SystemExit(code)

def retain_summary(recovery=False, browser=False):
    directory = FLAT / ".local" / ("manual-wallet-browser-acceptance" if browser else "manual-wallet-timeout-recovery" if recovery else "manual-wallet-acceptance")
    if last_lab_attempt is None or last_lab_attempt.parent != directory:
        raise SystemExit("Lab EVM produced no single new attempt; earlier reports are not reused")
    attempt = last_lab_attempt
    result_bytes = (attempt / "result.json").read_bytes() if (attempt / "result.json").exists() else b"{}"
    resources_bytes = (attempt / "resources.json").read_bytes()
    result = json.loads(result_bytes)
    resources = json.loads(resources_bytes)
    completion = "walletBrowserEvmFlowCompleted" if browser else "actualTimeoutFRecoveryAcceptance" if recovery else "walletSdkEvmFlowCompleted"
    accepted = result.get("success") is True and result.get(completion) is True \
        and resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True
    summary = {"format": "LIANUM_DEVELOPMENT_EVM_BROWSER_ACCEPTANCE_V1" if browser else "LIANUM_DEVELOPMENT_EVM_TIMEOUT_RECOVERY_V1" if recovery else "LIANUM_DEVELOPMENT_EVM_WALLET_ACCEPTANCE_V1", "accepted": accepted,
        "runId": result.get("runId", resources.get("runId")), "attempt": str(attempt.relative_to(ROOT)),
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "startedAt": result.get("startedAt"), "finishedAt": result.get("finishedAt"),
        "milliseconds": result.get("milliseconds"), "failure": resources.get("failure"),
        "workerFailure": result.get("errorCode"), "realProofCount": len(result.get("proofs", [])),
        "proofRelations": [proof["relation"] for proof in result.get("proofs", [])],
        "proofHashes": [{key: proof.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")}
                        for proof in result.get("proofs", [])],
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest(),
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest(),
        "sourcePinsSHA256": resources.get("sourcePinsSHA256"),
        "walletSdkEvmFlowCompleted": result.get("walletSdkEvmFlowCompleted", False),
        "walletBrowserEvmFlowCompleted": result.get("walletBrowserEvmFlowCompleted", False),
        "manualConsentContractVerified": result.get("manualConsentContractVerified", False),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"),
        "resourceSummary": resources.get("resourceSummary"),
        "responseLoss": result.get("responseLoss"), "listenerRestart": result.get("listenerRestart"),
        "offlineOriginalRecovery": result.get("offlineOriginalRecovery"),
        "finalRecipients": result.get("finalRecipients"), "finalVault": result.get("finalVault"),
        "finalCapacity": result.get("finalCapacity"),
        "fullWalletAcceptance": False, "browserVisualAcceptance": accepted if browser else False,
        "systemicPrivacyAcceptance": False, "independentOperators": False,
        "actualTimeoutFRecoveryAcceptance": result.get("actualTimeoutFRecoveryAcceptance", False),
        "limitations": ["Local synthetic EVM and fake PALT/BLTV only; no public-chain acceptance.",
            "Client deliberately discards one actual HTTP admission reply; no physical network outage claimed.",
            "Owners restart as processes; catalogue coordinator reopens its same journal in process.",
            "Recovery here observes an already fulfilled graph; timed-out F recovery needs its own acceptance.",
            "Amounts/timing/router actions and common-host operators remain observable; no privacy certification."]}
    if recovery:
        summary.update({"originalFRecovery": result.get("originalFRecovery"),
            "recoveryBalances": result.get("recoveryBalances"),
            "expectedInterruptionCode": result.get("expectedInterruptionCode"),
            "actualAdmissionFailureCode": result.get("actualAdmissionFailureCode"),
            "originalFailedAdmission": result.get("originalFailedAdmission"),
            "expectedInterruptionPreserved": result.get("expectedInterruptionPreserved", False),
            "failureRecovery": {key: result.get("failureRecovery", {}).get(key) for key in
                ("ownerAbsentAtIssuance", "recoveryThroughExactSDK", "originalFailurePreserved", "solverPayoutIssued",
                 "solverUnderlyingLoss", "nativeVaultEffects", "ownerExitsAttempted", "catalogueAdmissionsFenced")},
            "limitations": ["Local synthetic EVM and fake PALT/BLTV only; no public-chain acceptance.",
                "Controlled interruption after one real native delivery, before global settlement; signed LOCAL cutoff advanced explicitly.",
                "Real original F refunds120 to available500; recovery120 labels a subset and is not another spendable amount.",
                "Solver loses its100 underlying; target private100 shares remain. Catalogue admission fence is retained; no new exits attempted.",
                "Owners restart as processes; coordinator reopens its same authenticated journal in process and listener is replaced.",
                "No browser, physical network outage, independent operators or privacy certification accepted."]})
    if browser:
        summary.update({"browserClosures": result.get("browserClosures"),
            "originalExitReviewStateUnchanged": result.get("originalExitReviewStateUnchanged", False),
            "walletApplicationHttpAcceptance": result.get("walletApplicationHttpAcceptance"),
            "limitations": ["Local owned EVM and fake PALT/BLTV only; no public-chain acceptance.",
                "Scripted real production DOM checks each original term and checkbox before importing one-use authority from the original local host.",
                "Owner amount/destination/witness preparation remains in the separate original Linux custody process; browser is not self-contained mobile custody.",
                "One actual admitted HTTP reply is discarded; no physical network outage is claimed.",
                "Owners restart as processes; coordinator reopens its same authenticated journal and listener is replaced.",
                "Amounts, timing and router actions remain observable; no independent-operator or privacy/performance certification."]})
    destination = DEV / "reports" / ("evm-browser-lab.json" if browser else "evm-recovery-lab.json" if recovery else "evm-lab.json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(destination)
    print(json.dumps({"accepted": accepted, "realProofCount": summary["realProofCount"],
                      "report": str(destination.relative_to(ROOT))}), flush=True)
    if not accepted:
        raise SystemExit(1)

def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else "run" if len(sys.argv) == 1 else None
    if mode not in {"prepare", "run", "recovery", "browser"}:
        raise SystemExit("Usage: ./dev lab [prepare|run|recovery|browser]")
    if sys.platform != "linux":
        raise SystemExit("The fixed EVM wallet laboratory requires Linux/WSL")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    with (DEV / "evm-lab.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another EVM lab preparation/run is active")
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, forward_signal)
        if not (FLAT / ".local/backed-assets/v1/manifest.json").exists():
            run("scripts/prepare-backed-assets.mjs")
        # Bounded original workers validate/reuse each completed public artifact.
        # The missing admission key is generated once with the real circuit/CRS.
        for operation in ("compile", "stats", "prepare-key"):
            run("proof-workers/run-bounded.mjs", "admission", operation)
        run("scripts/prepare-development-evm.mjs")
        if mode in {"run", "recovery", "browser"}:
            recovery = mode == "recovery"
            browser = mode == "browser"
            flow = "manual-wallet-browser-acceptance" if browser else "manual-wallet-timeout-recovery" if recovery else "manual-wallet-acceptance"
            try:
                run("integration/run-" + flow + ".mjs", observe=True, flow=flow)
            except SystemExit as error:
                try:
                    retain_summary(recovery, browser)
                except (SystemExit, FileNotFoundError):
                    pass
                raise error
            retain_summary(recovery, browser)

if __name__ == "__main__":
    main()
