# Original public Tron candidate provenance

`candidate-artifacts-v3.json` and `jdk-acquisition.json` are byte-for-byte public
receipts from the restoration package, not regenerated acceptance evidence.
Their fixed hashes are checked by the runner. They inventory the original
patched Java-Tron candidate and the complete JDK8 file/mode/symlink closure.

The original runtime release remains null. The opt-in runner authenticates all
restored originals before creating a fresh private fixture. The seven original
compiled patch classes remain authenticated and unchanged. Their package overlay
uses one newly compiled, source-reviewed Args offline-zero delta before the
unchanged duplicate-entry JAR. Its class/source hashes are literal runner pins;
this delta is new build evidence and never changes the original receipts.

`tron-candidate-seccomp.py` installs a Linux x64 filter in the child before Java
exec: `socket()` is denied in every family, as are network `socketpair()` calls.
Only anonymous AF_UNIX pairs required by JDK8 FileDispatcher remain available;
the host checks every socket inode belongs to an unnamed UNIX socket. The
launcher inherits only local stdio pipes or unnamed UNIX channels, changes no host policy, and permits no caller
binary, Java argument, endpoint, key or classpath. The sole opt-in runs native
consensus, original signing/broadcast, native finality, containing-block owner
permission prestate and the existing read-only observer. An unknown result never
triggers a second economic command.

The original NodeConfig.postProcess turns explicit agreeNodeCount=0 into19.
The reviewed delta preserves zero only with the explicit offline CLI profile,
retaining all original assertOffline conditions. The separate public diagnostic
confirmed that no other public configuration field changed.

The jdk.inventory array contains public paths, modes, hashes and symlink targets;
it contains no wallet, witness or signing keys.

The new candidate produced native blocks, signed the original transaction and
broadcast once. It still failed: original finality remained pending60s and
shutdown ended SIGABRT. A failure report and private diagnostics are retained;
keys/ledger were removed only after verifying the original child was gone.
Canonical release, registered graph authority, private claims/credit,
independent operators and public-network acceptance remain unestablished.
