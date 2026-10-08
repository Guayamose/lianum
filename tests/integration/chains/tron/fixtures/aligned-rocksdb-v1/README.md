# Aligned genesis / RocksDB candidate

This is a new local candidate, initially blocked by the null source gate in
`tron-aligned-rocksdb-profile.mjs`. Neither historical artifacts nor the canonical
Tron release are changed. No public chain, private credit, graph or process-loss
recovery is established.

The new Java source differs from the original by exactly two string literals:
LEVELDB to ROCKSDB and genesis 1750000000000 to 1749999999000. Reversing them must
produce the original SHA256 02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f.
No runtime/compiler result is included in this source fixture.

After source review, the fixed Python preparer may be run once:

`python3 tests/integration/chains/tron/fixtures/aligned-rocksdb-v1/build.py --build-reviewed-aligned-rocksdb`

It refuses an existing namespace, checks 407 JDK entries, all 7 original classes,
the original JAR and the current reviewed Args overlay. It compiles only the two
new driver classes, with javac heap 256 MiB / RSS 384 MiB / deadline 60 s / log 1 MiB. The reviewed `ledger_owned_processes.py` is reused intact: the original birth pipe, four UIDs, retained pidfd, process ancestry and subreaper closure remain authoritative. A new fixed Python bootstrap waits for exactly one grant byte followed by EOF within 2 s; unknown birth, missing pidfd, identity change, EOF/error/extra byte or cancellation prevent javac. Before writing the grant, the child acknowledges its open FIFO reader; the parent checks that actual read-only FD/inode through /proc and rechecks its original pidfd/UID4 identity. Thus closing the writer cannot discard a grant before the reader opens. The signal handler only latches. Compiler startup shares the 60 s deadline; cleanup uses one 10 s budget from the first failure, without renewal. Signals, compiler peak RSS and closure are retained; an uncertain closure preserves rejection and the lock. It never starts a node or creates keys/witnesses. The build receipt and
outputs remain new evidence even on rejection; none overwrite originals.

Review the real build receipt and both class bytes independently before replacing
the null literal by a **single-line JSON object** with format
`REVIEWED_LOCAL_TRON_ALIGNED_ROCKSDB_CANDIDATE_V1` and sourceSHA256,
buildReportSHA256,classSHA256,innerClassSHA256. The Python launcher parses that
same fixed source literal as data and checks it independently. There are no
caller-selected pins or future class hashes in this fixture. The JS module
freezes a non-null reviewed object. The canonical runtime gate remains null.

Only after that separate review, the new zero-options entry is:

`./dev node tests/integration/chains/tron/run-reviewed-aligned-rocksdb-candidate.mjs`

It reuses the same private acceptance body and original native authorities. Both
profiles share the existing candidate active.lock; no profile/callback/address/
key/config/RPC override is exported. The legacy command and authority checks are preserved in the shared runner.
The previous Python helper, original driver source/classes7, JDK/JAR/Args and
their historical reports remain byte intact. The child-only original socket
seccomp guard is imported byte-pinned; the new launcher declares only an own
java.io.tmpdir for JNI extraction and a parent-death guard. Only the new profile also requires one fixed G octet from its original Node parent within 2 s, after UID4/birth/group/session/executable rechecks. That octet is consumed separately; the remaining stdin is the unchanged Java driver protocol. Listeners and cleanup already own the ChildProcess if startup capture throws or returns no identity; an unknown PID is never signalled. Shutdown hooks,
consensus deadlines, transaction TTL and finality checks are unchanged.

In the authentic original Java PID, retain live maps and hash the mapped RocksDB
JNI bytes against the original Linux64 library. Read engine.properties created
by the original account/properties/tmp stores; config alone is insufficient.
The real config values must match the two fixed literals. Inclusion/receipt/raw/
solid ancestry/balance/fee/replay must all pass with exactly one broadcast.
Close must return exit0, no signal, no force and no fatal error; otherwise the
candidate remains rejected. Preserve bounded private packing/shutdown logs before
removing every synthetic key/config/ledger/JNI scratch and releasing the lock.

Host checks are separate metadata/OS-guard regressions, never native acceptance:
`node --max-old-space-size=384 --test-concurrency=1 --test tests/integration/chains/tron/tron-aligned-rocksdb-profile.test.mjs`
and Python `test_build.py` (eight cases) plus `test_parent_death.py` (one kernel test covering actual parent death, actual Popen with failed capture/enrollment, and an actual FIFO reader whose opening is delayed). The latter uses only disposable Python fixtures with no JDK/JAR/compiler; it verifies EOF rejection and preserves unknown-birth rejection. Node has four metadata/source cases including the real startup body under synthetic IO. Neither proves Java cleanup or native finality. Source-only delivery does
not claim those tests or the real kernel probe have run.
