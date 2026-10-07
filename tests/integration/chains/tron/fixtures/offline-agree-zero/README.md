# Reviewed offline Args delta

The original public candidate is preserved unchanged. Its recovered Args source
SHA-256 is `d9181550791faa1fb502fe9dce705a79c5b279d631f8100a2f6ce603d4e61411`.
The source here applies only `0003-preserve-explicit-offline-agree-zero.patch`
and has SHA-256 `7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d`.
The original owned Java driver and every `assertOffline` condition remain intact.

The network default `NodeConfig.postProcess()` turns agreeNodeCount=0 into19.
This delta preserves the explicit zero only when the explicit offline CLI switch
p2pDisable is true and the configuration contains node.agreeNodeCount=0. Normal
network defaults still pass through the original postProcess behavior.

The diagnostic loads public configuration and prints only booleans and counts.
It constructs no application, consensus, ledger, witness or signing key.

After the native resource slot is free:

```sh
python3 tests/integration/chains/tron/fixtures/offline-agree-zero/build.py --build-reviewed-offline-args
```

The recipe authenticates the complete original JDK8 inventory, unchanged patched
JAR, reviewed source and original Lombok1.18.34 public dependency. Restoration
must place that dependency at the fixed ignored runtime path
`omnichain-product/.local/owned-tron-native-value-v1/build-dependencies/lombok-1.18.34.jar`;
its SHA-256 is `c27d6b2aff56241d1b07fcbcc6b183709e6b432c80f7374eeb1d823e86d4b81a`.
No dependency is downloaded by this recipe.

Compilation and original/reviewed diagnostics run in guarded child processes
with bounded memory, output and duration. Child socket creation is denied.
Fresh outputs are retained separately in reviewed-offline-agree-zero-v1; an
existing or incomplete build requires review and is never overwritten. The
report checks that only agreeNodeCount changed in the public offline diagnostic.

This build is new evidence. It does not regenerate historical receipts, activate
the canonical Tron release, authorize claims or establish a native transfer.
The new class hash must be reviewed and pinned before candidate acceptance.
