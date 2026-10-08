"""Read-only raw D26/W39 Native12 receipt joins, never proof/account authority.

The financial reader separately joins its original attempt/public-proofs bytes.
This leaf joins those row hashes to the original persisted telemetry, exact
lineage, closed Native12 child and subsequent independent Wasm1 verification.
No Node execution, path/backend selector, receipt rewrite or legacy fallback.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from workspace import RUNTIME
from osaka_lab import private_evidence

_FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
_GOLDEN = RUNTIME / "omnichain-product"
_TELEMETRY = _GOLDEN / "evidence/paeg-proof-attempts"
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
_SHA = re.compile(r"[0-9a-f]{64}")
_RSS = 3221225472
_PROFILE = "LIANUM_ECONOMIC_D26_W39_NATIVE_UNIX_SOCKET_V1"
_BINARY = "5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b"
_LINEAGE = {
    "deposit_balance": {"mode": "deposit_balance", "target": "evm", "statementWords": 26,
        "provenanceSHA256": "7aa7dacf33baec14b1d98bb48a0bdeb6115c1204b42bd970e87a5c8c23a8630e",
        "artifactSHA256": "42c9dadc3194592249b5e86c047eba8969e7624669474f68a91aca6554fd9238",
        "compiledFileSHA256": "42c9dadc3194592249b5e86c047eba8969e7624669474f68a91aca6554fd9238",
        "circuitSHA256": "e02b8d05c4cad3e8fc00d6d5b8714292bfdf2b9d81d5617145114486e6d3b4ba",
        "keySHA256": "e8b8b1d20c9c7618e799599ccc54dcada8043ee0bf23fd8f3c15c0a800e68767",
        "sourceTreeSHA256": "f7b1e2611965d908ece5df618ae95b76763f697671b3dea9bb38886e71236868",
        "soliditySHA256": "47ab7388f52b695fc33b8d71a3fbc0f022b8d50f8007967aa0e4b335ab71ea93"},
    "withdraw_balance": {"mode": "withdraw_balance", "target": "evm", "statementWords": 39,
        "provenanceSHA256": "b155829f4a17d17ad516074d0e0a896fdc1f6f35ef0a129bdee9f936850744da",
        "artifactSHA256": "99383985b10fcbd786d0d186a7bd02d139741877fe897d682dc1272c937b638b",
        "compiledFileSHA256": "99383985b10fcbd786d0d186a7bd02d139741877fe897d682dc1272c937b638b",
        "circuitSHA256": "e45e6e24f2738ae20b1b46ee95a5c9126becff6830ee8439d3b8901ab40b3370",
        "keySHA256": "edb16c5329479e04b026ac4b80216291b7d830f6e0815b4d5d9297fa55fecf8a",
        "sourceTreeSHA256": "e6194c6aeeb46051062a87eb8e77229c65cd5dc7d6f5613707ab408b6c2ecf77",
        "soliditySHA256": "d1d06f9b3689f6d531b19775131cc91700772ffa0bcc5e72b083b9f7393b1824"},
}
_TOOLCHAIN = {"node": "v24.19.0", "noir": "1.0.0-beta.25", "barretenberg": "5.2.0",
    "auditSHA256": "81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6"}
_CRS = {"points": 2097152, "provenanceSHA256": "e24f63bcea7cc9d1430c3696c109569015fc38c6e44d5a46ebab3a64013939e3",
    "records": [{"file": "bn254_g1_compressed.dat", "bytes": 67108864,
        "sha256": "3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37"},
        {"file": "bn254_g2.dat", "bytes": 128, "sha256": "01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f"}]}
_POLICY = {"profile": "PC26_MEASURED_WORKER_BUDGET_V2", "floors": {"availableRAM": 2684354560, "freeDisk": 5368709120},
    "proofWorkerRSSLimit": _RSS, "externalSampleMilliseconds": 250, "strictKernelLimit": False}
_VERIFY = {"backend": "Wasm", "threads": 1, "maximumPages": 32768, "originalPreparedKeyRequired": True,
    "verifierCRSOnly": True, "backendDestroyed": True, "nativeProducerClosedBeforeVerification": True}
_CODE_FILES = {"worker": _GOLDEN / "src/paeg/proof-worker.mjs", "parent": _GOLDEN / "src/paeg/proof-process.mjs",
    "nativeNoteRunner": _GOLDEN / "src/paeg/note-native-execution-v1.mjs", "resourcePolicy": _GOLDEN / "src/private-resource-policy.mjs",
    "proofResourcePolicy": _GOLDEN / "src/paeg/proof-resource-policy.mjs", "verifierCRS": _GOLDEN / "src/private-verifier-crs.mjs"}
_ENTRY_FILES = {mode: _GOLDEN / ("src/paeg/note-" + ("deposit" if mode == "deposit_balance" else "withdraw") + "-native-worker-v1.mjs") for mode in _LINEAGE}


def _need(value):
    if value is not True:
        raise ValueError("NATIVE_ECONOMIC_NOTE_RAW_JOIN")


def _same(left, right):
    # Strict JSON-type equality, including bool/int. Raw files remain untouched.
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(right, sort_keys=True, allow_nan=False)


def _integer(value, minimum=0, maximum=9007199254740991):
    return type(value) is int and minimum <= value <= maximum


def _sha(value):
    return type(value) is str and _SHA.fullmatch(value) is not None


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("NATIVE_ECONOMIC_NOTE_DUPLICATE_JSON")
        result[key] = value
    return result


def _parse(data):
    return json.loads(data, object_pairs_hook=_object_pairs,
        parse_constant=lambda _value: (_ for _ in ()).throw(ValueError("NATIVE_ECONOMIC_NOTE_NONFINITE_JSON")))


def _file_pin(path):
    before = path.lstat()
    _need(path.resolve() == path and stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and 0 < before.st_size <= 2097152)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        opened = os.fstat(stream.fileno())
        _need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino))
        digest = hashlib.sha256()
        while block := stream.read(65536):
            digest.update(block)
        after = os.fstat(stream.fileno())
    _need(all(getattr(before, key) == getattr(after, key) for key in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")))
    return {"bytes": before.st_size, "sha256": digest.hexdigest()}


def _code_pins(pins):
    _need(type(pins) is dict and set(pins) == set(_CODE_FILES) | {"nativeNoteEntries"})
    for name, path in _CODE_FILES.items():
        _need(_same(pins[name], _file_pin(path)))
    _need(type(pins["nativeNoteEntries"]) is dict and set(pins["nativeNoteEntries"]) == set(_ENTRY_FILES))
    for mode, path in _ENTRY_FILES.items():
        _need(_same(pins["nativeNoteEntries"][mode], _file_pin(path)))


def assert_native_economic_note_row(row, note_keys, runtime):
    """True only for fixed Native12 D26/W39, rereading raw original telemetry.

    Runtime must be the actual fixed FLAT constant. It never selects a path.
    Caller note_keys must equal the original literals; they grant no authority.
    The parent reader owns proof/input byte joins and original attempt closure.
    """
    try:
        _need(runtime == _FLAT and type(row) is dict and type(note_keys) is dict)
        # An owned metadata snapshot across file reads, without changing raw JSON.
        row = _parse(json.dumps(row, allow_nan=False))
        mode = row.get("relation")
        _need(type(mode) is str and mode in _LINEAGE)
        pins = _LINEAGE[mode]
        _need(note_keys.get(mode) == pins["keySHA256"] and _integer(row.get("publicWords")) and row["publicWords"] == pins["statementWords"])
        _need(_sha(row.get("proofSHA256")) and _sha(row.get("publicInputsSHA256")))
        evidence = row.get("evidence")
        _need(type(evidence) is dict and type(evidence.get("id")) is str and _UUID.fullmatch(evidence["id"]) is not None)
        path = _TELEMETRY / (evidence["id"] + ".json")
        data = private_evidence(path)
        original = _parse(data)
        _need(type(original) is dict and _sha(evidence.get("telemetrySHA256")))
        _need(hashlib.sha256(data).hexdigest() == evidence["telemetrySHA256"])
        expected = {**original, "telemetrySHA256": evidence["telemetrySHA256"], "resourceReceiptCompleted": True}
        _need(_same(evidence, expected))
        for name, value in {"classification": "ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY", "id": evidence["id"],
            "mode": mode, "operation": "prove", "purpose": "owner", "phase": "completed", "acceptedResult": True,
            "exit": {"code": 0, "signal": None}, "lockPreserved": False, "zeroKnowledgeEnabled": True,
            "policy": _POLICY, "threads": 12, "maximumPages": None, "preparedMaximumPages": 32768}.items():
            _need(name in original and _same(original[name], value))
        _need(all(name not in original for name in ("failureCode", "telemetryWriteFailed", "fallbackTelemetryWriteFailed")))
        worker = original.get("worker")
        _need(type(worker) is dict)
        for name, value in pins.items():
            _need(_same(original.get(name), value) and _same(worker.get(name), value))
        for name, value in {"threads": 12, "maximumPages": None, "preparedMaximumPages": 32768, "zeroKnowledgeEnabled": True,
            "verified": True, "toolchain": _TOOLCHAIN, "crs": _CRS, "independentVerification": _VERIFY,
            "proofSHA256": row["proofSHA256"], "publicInputsSHA256": row["publicInputsSHA256"], "publicInputCount": pins["statementWords"]}.items():
            _need(name in worker and _same(worker[name], value))
        native = worker.get("nativeBackendExecution")
        identity_keys = {"pid", "ppid", "pgrp", "session", "startTimeTicks"}
        fixed = {"profile": _PROFILE, "backend": "NativeUnixSocket", "threads": 12, "bbVersion": "5.2.0", "binarySHA256": _BINARY,
            "originalPreparedKeyRequired": True, "oneEphemeralJob": True, "memoryScope": "COORDINATOR_PLUS_NATIVE_CHILD", "rssLimitBytes": _RSS,
            "outputByteAccounting": "RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND", "outputStreamsClosed": True, "socketClosed": True, "socketRemoved": True}
        _need(type(native) is dict and set(native) == set(fixed) | {"childIdentity", "childClose", "outputBytes"})
        for name, value in fixed.items():
            _need(_same(native.get(name), value))
        identity = native.get("childIdentity")
        _need(type(identity) is dict and set(identity) == identity_keys)
        _need(all(_integer(identity[name], 2) for name in ("pid", "ppid", "pgrp", "session")))
        _need(_integer(original.get("childPID"), 2) and identity["ppid"] == original["childPID"])
        _need(type(identity["startTimeTicks"]) is str and re.fullmatch(r"[0-9]+", identity["startTimeTicks"]) is not None)
        _need(_same(native.get("childClose"), {"code": 0, "signal": None}) or _same(native.get("childClose"), {"code": None, "signal": "SIGTERM"}))
        _need(_integer(native.get("outputBytes"), maximum=1048576))
        _need(original.get("nativeChildrenGone") is True and _same(original.get("nativeBackendExecution"), native))
        identities = original.get("nativeChildIdentities")
        _need(type(identities) is list and any(type(value) is dict and all(_same(value.get(name), identity[name]) for name in identity_keys) for value in identities))
        _need(original.get("nativeMemoryScope") == "COORDINATOR_PLUS_NATIVE_CHILD" and _integer(original.get("peakWorkerRSS"), maximum=_RSS))
        samples = original.get("resourceSamples")
        _need(type(samples) is list and len(samples) > 0)
        for sample in samples:
            _need(type(sample) is dict and _integer(sample.get("availableRAM"), minimum=_POLICY["floors"]["availableRAM"]))
            _need(_integer(sample.get("freeDisk"), minimum=_POLICY["floors"]["freeDisk"]) and _integer(sample.get("workerRSS"), maximum=_RSS))
        _code_pins(original.get("codePins"))
        _need(private_evidence(path) == data)
        return True
    except (OSError, ValueError, TypeError, KeyError, RecursionError, OverflowError):
        return False
