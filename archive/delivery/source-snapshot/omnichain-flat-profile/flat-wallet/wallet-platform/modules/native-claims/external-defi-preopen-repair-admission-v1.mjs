/** Coordinator-reviewed fixed pre-open repair permit. Closed until populated.
 * A new permit restores original actors only; it authorizes no economic effect. */
import assert from 'node:assert/strict';
const ADMISSION={
  "schema": "EXTERNAL_DEFI_PREOPEN_REPAIR_ADMISSION_V1",
  "originalInput": {
    "directory": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/.local/external-defi-owner-cycle-v1/attempt-1cc379f1-d793-45be-aca3-6acb3abe4fee/private-audit",
    "runId": "1cc379f1-d793-45be-aca3-6acb3abe4fee",
    "sourceSHA256": "83e5969a83dc66da903a54df1a531bd1e0d28ba824846ce73a9054f1901fc49e",
    "deadlineMs": 1791380234903
  },
  "originalInventorySHA256": "2fa4baa3d8bcc25e83cecdd9b7d53d41f034a4df672c8036c91dae55c63b89ce",
  "failedCheckpoint": {
    "revision": 12,
    "commitment": "6ba755e6b947c39a1f5d1bf8300a6d437a7a339f697393449a5de0420cc479d3"
  },
  "failedRecordSHA256": "859dcac5c7944301cbd4a503f140bcb2ea6f9699549a4d89db254e118c609333",
  "failedReceiverClaim": {
    "nonce": "3ab5371daa30a46633b78c6b5ca9403d80e3c17bd98538c6e8e8ef958cc7eeb6",
    "processId": 89
  },
  "evidence": {
    "terminal": {
      "path": "/workspace/scratch/770c47ebf757/lianum-restore-20261007-0839/external-defi-durable-bootstrap-v1/reopen-probe-terminal-v2.json",
      "sha256": "0024781b8c7891f33ca951670fda1bd441b80b230129f74630a675a320ea4264"
    },
    "status": {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/.local/external-defi-owner-cycle-v1/attempt-1cc379f1-d793-45be-aca3-6acb3abe4fee/private-audit/reopen-status.json",
      "sha256": "8cec6da5ac95429e00e20d31925b76094be94f54dd360cab87a635032d1dcbb1"
    },
    "error": {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/.local/external-defi-owner-cycle-v1/attempt-1cc379f1-d793-45be-aca3-6acb3abe4fee/private-audit/reopen-private-error.json",
      "sha256": "3823e55ca1c12f54f3abead3ac9ad39c93498c8acf2b758ea5e70fed1cf70cce"
    },
    "createTerminal": {
      "path": "/workspace/scratch/770c47ebf757/lianum-restore-20261007-0839/external-defi-durable-bootstrap-v1/create-probe-terminal-v2.json",
      "sha256": "d37a4d7c34f46dd838fc9bb6c53a97b7b943f5c95ea152fce73074ee3d8cc61c"
    },
    "createStatus": {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/.local/external-defi-owner-cycle-v1/attempt-1cc379f1-d793-45be-aca3-6acb3abe4fee/private-audit/create-status.json",
      "sha256": "dddf23e8d8d8cd3f3b4de8659361e6ce3e676b705e7e6b42206c26d65f24a6f7"
    },
    "probeSource": {
      "path": "/workspace/scratch/770c47ebf757/lianum-restore-20261007-0839/external-defi-durable-bootstrap-v1/probe-stage.mjs",
      "sha256": "f90bbac5820c2c8cc0fde8f8ab846531fcbb296e55392432e1b725068c82b8ad"
    }
  },
  "approvedSources": [
    {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/owned-evm-preopen-repair-v1.mjs",
      "sha256": "9a2203d62c60a5bf923d55b36c8bc0eb13b4335310a57f0ca32fb4ea9e37a9fa"
    },
    {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/owned-evm-state-file-v1.mjs",
      "sha256": "72f5d6588955f2d2e63c0e94cfa38e4c48cc3bbdbb3699113694aee1fbd3adab"
    },
    {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs",
      "sha256": "aa386781e40dcadb00e71e9954bd99514831c121288dd2c5220733960e5a3adb"
    },
    {
      "path": "/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/omnichain-flat-profile/flat-wallet/wallet-platform/modules/native-claims/wrapped-recovery-authority-v1.mjs",
      "sha256": "fa8dd809e9b7f70c0ad8319fcb4a9ab8984e9bd0686c85afe7f20314c2f8a447"
    }
  ],
  "permit": {
    "id": "dab4b7d3900ef2c146c0da76a5063781b27cc1277cb15ba640c016e6af16138a",
    "issuedAtMs": 1791380100000,
    "deadlineMs": 1791383700000,
    "scope": "RESTORE_ORIGINAL_UNFUNDED_ACTORS_ONLY",
    "effectAuthority": false
  },
  "native": {
    "repairOrdinal": 1,
    "capturedGeneration": 0,
    "captureSHA256": "78bc121be82727822f2fe3255c23917511b77eac735cae4e0e573d01045d0214",
    "predecessorClaim": {
      "path": "wrapped-runtime-open-0.json",
      "bytes": 150,
      "sha256": "a2e80770ad089fdcefca74895b261b1b6e2f883f27d6af574854c65f050f60c7"
    },
    "predecessorMnemonic": {
      "path": "reopen-mnemonic-1.txt",
      "bytes": 87,
      "sha256": "900f5a7ccd3dc35b9a6f1c0e1aa73092145da99b599881ae4b5e5fc57be295cb"
    }
  }
};
export function readExternalDefiPreopenRepairAdmissionV1(){assert.equal(arguments.length,0);assert.ok(ADMISSION,'EXTERNAL_PREOPEN_REPAIR_ADMISSION_CLOSED');return structuredClone(ADMISSION);}
