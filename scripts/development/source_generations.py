#!/usr/bin/env python3
"""Prepare and explicitly adopt current sources without rebuilding original proofs.

The published release remains authoritative. Development snapshots use a shared
content-addressed store; repeated preparation never clones the laboratory.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import stat
import subprocess
import sys
import tempfile

from import_paths import map_path, translate
from workspace import layout as workspace_layout, build as workspace_build
from source_pins import run as check_current_pins

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ".internal/runtime/"
FLAT = RUNTIME + "omnichain-flat-profile/flat-wallet/"
RELEASE = "packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs"
CATALOGS = {
    "native-paged": "archive/source-evidence/paged-source-catalogues/0f0b25053fab8aa1de09585680325604700e68f1c69c71fe9a95867a8371b1f7.source",
    "graph-paged": "archive/source-evidence/paged-source-catalogues/d38c5f6c7e31445f28cdc2d3a15396fd125482968cf084e2e6e8fb643ee583b8.source",
}
PREFIXES = (
    ("development-tooling/", "scripts/development/"), ("development-config/", "scripts/"),
    ("golden/", RUNTIME + "omnichain-product/"),
    ("candidate/", RUNTIME + "omnichain-flat-profile/candidate-poseidon/"),
    ("mobile-protocol/", RUNTIME + "mobile-protocol/"),
    ("mobile-app/", "apps/mobile/"), ("mobile-protocol-workspace/", "packages/mobile-protocol/"),
    ("flat/", RUNTIME + "omnichain-flat-profile/"),
    ("workspace-package/", "packages/"),
    ("workspace-module/", ""), ("development-root/", ""),
)
MAX_BYTES = 128 * 1024 * 1024
CURRENT_SOURCE_INPUTS = (
    "packages/backend/src/operations/local/funded-paged-public-testnet-native-graph-operator-v4.mjs",
    "contracts/wallet/v2/PrivateFlatAssetNotePoolV3.sol",
    "archive/source-evidence/tron-original-builder-v1/provenance.json",
    "archive/source-evidence/tron-original-builder-v1/88bfed03dc18587fe2282479d6e36316047ae68e1fb9086f1caac6d8e3079c09.source",
    "apps/platform/src/paged-native-bootstrap-v3.mjs",
    "apps/platform/src/gateway-pairing.mjs",
    "apps/platform/src/diagnostics.mjs",
    "packages/backend/src/providers/paged-native-quote-v4.mjs",
    "packages/mobile-protocol/src/device-paged-provider-quote-v4.mjs",
    "packages/mobile-protocol/src/device-paged-provider-quote-v4.d.mts",
    "packages/mobile-protocol/src/device-paged-payment-list-v3.mjs",
    "packages/mobile-protocol/src/device-paged-payment-list-v3.d.mts",
    "experiments/engine/private-core-proof/funded-graph-paged-v3/.local/exact-payouts-v4/consumer.json",
    "experiments/engine/private-core-proof/funded-graph-paged-v3/.local/exact-payouts-v4/manifest.json",
    "scripts/development/active-paged-generation.json",
    "archive/source-evidence/paged-original-compiler-v4/provenance.json",
    "apps/mobile/src/screens/NativeWalletScreen.tsx",
    "apps/mobile/src/native-wallet/native-wallet-ui-port.ts",
    "apps/mobile/src/native-wallet/native-wallet-controller.ts",
    "apps/mobile/src/native-wallet/native-wallet-public-configuration-v1.ts",
    "apps/mobile/src/native-wallet/native-wallet-form-v1.mjs",
    "apps/mobile/src/native-wallet/native-wallet-form-v1.d.mts",
    "apps/mobile/src/native-wallet/NativeWalletQr.tsx",
    "apps/mobile/src/custody/native-wallet-custody-v1.ts",
    "packages/crypto/src/native-wallet-v1.d.mts",
    "packages/crypto/src/native-wallet-auth-v1.d.mts",
    "packages/backend/src/public-wallet/entry-v1.mjs",
    "packages/backend/src/public-wallet/http-service-v1.mjs",
    "packages/backend/src/public-wallet/auth-v1.mjs",
    "packages/backend/src/native-wallet/index.mjs",
    "packages/backend/src/fiat/moonpay-gateway-v1.mjs",
    "packages/backend/src/fiat/moonpay-http-v1.mjs",
    "packages/crypto/src/native-wallet-v1.mjs",
    "packages/crypto/src/native-wallet-auth-v1.mjs",
    "tests/integration/wallet/native/device-paged-mixed-backend-process-v3.mjs",
    "tests/integration/wallet/native/device-paged-mixed-backend-client-v3.mjs",
    "tests/integration/wallet/native/device-paged-mixed-backend-transport-v3.mjs",
    "tests/integration/wallet/native/run-device-paged-mixed-cold-operation-v3.mjs",
    "packages/mobile-protocol/src/device-paged-wallet-portfolio-v3.mjs",
    "packages/mobile-protocol/src/device-paged-wallet-portfolio-v3.d.mts",
    "packages/mobile-protocol/src/device-paged-owner-v3.d.mts",
    "packages/backend/src/operations/local/device-paged-wallet-portfolio-channel-v3.mjs",
    "apps/mobile/src/state/wallet-observation-window-v1.mjs",
    "apps/mobile/src/state/wallet-observation-window-v1.d.mts",
    "apps/mobile/src/state/wallet-portfolio-v1.mjs",
    "apps/mobile/src/state/wallet-portfolio-v1.d.mts",
    "scripts/development/static-bindings.json",
    "packages/backend/src/operations/local/device-paged-native-economic-channel-v3.mjs",
    "packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs",
    "packages/mobile-protocol/src/device-paged-economic-view-v3.mjs",
    "packages/mobile-protocol/src/device-paged-economic-view-v3.d.mts",
    "packages/backend/src/providers/paged-native-economic-balance-v3.mjs",
    "packages/mobile-protocol/src/device-paged-payout-settlement-v3.mjs",
    "packages/mobile-protocol/src/device-paged-payout-settlement-v3.d.mts",
    "tests/integration/wallet/native/device-paged-backend-process-v3.mjs",
    "tests/integration/wallet/native/device-paged-backend-client-v3.mjs",
    "tests/integration/wallet/native/device-paged-three-network-cold-operation-v3.mjs",
    "tests/integration/wallet/native/run-device-paged-cold-operation-v3.mjs",
    "tests/integration/wallet/native/run-device-paged-mixed-operation-v3.mjs",
    "tests/integration/wallet/native/device-paged-uniswap-mobile-flow-v3.mjs",
    "packages/backend/src/api/mobile/device-paged-platform-application-v3.mjs",
    "packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs",
    "packages/backend/src/providers/paged-uniswap-provider-v3.mjs",
    "packages/backend/src/chains/evm/dispatch/paged-uniswap-dispatch-gate-v3.mjs",
    "packages/mobile-protocol/src/device-paged-operation-runner-v3.mjs",
    "packages/mobile-protocol/src/device-paged-operation-runner-v3.d.mts",
    "packages/mobile-protocol/src/device-paged-uniswap-v3.mjs",
    "packages/mobile-protocol/src/device-paged-uniswap-v3.d.mts",
    "apps/mobile/src/state/wallet-connection-read-plan-v1.mjs",
    "apps/mobile/src/state/wallet-connection-read-plan-v1.d.mts",
    "apps/mobile/src/custody/wallet-recovery-package-v1.mjs",
    "apps/mobile/src/custody/wallet-recovery-package-v1.d.mts",
    "apps/mobile/src/custody/wallet-recovery-native-v1.ts",
    "apps/mobile/src/api/device-paged-uniswap-preparation-v3.ts",
    "apps/mobile/src/api/device-external-flat-reception-observer-v1.mjs",
    "apps/mobile/src/api/device-external-flat-reception-observer-v1.d.mts",
    "tests/integration/wallet/native/run-device-paged-three-network-continuity-v3.mjs",
    "tests/integration/wallet/native/device-paged-three-network-operation-v3.mjs",
    "apps/mobile/src/custody/device-paged-custody-views-v3.mjs",
    "apps/mobile/src/custody/device-paged-custody-views-v3.d.mts",
    "apps/mobile/src/state/public-connection-registry-v1.mjs",
    "apps/mobile/src/state/public-connection-registry-v1.d.mts",
    "apps/mobile/src/state/public-connection-store-v1.ts",
    "apps/mobile/src/api/device-paged-operation-runner-v3.mjs",
    "apps/mobile/src/api/device-paged-operation-runner-v3.d.mts",
    "apps/mobile/scripts/owned-build-process.mjs",
    "packages/backend/src/api/accounts/native-manual-session-contract-v1.mjs",
    "packages/backend/src/api/mobile/paired-original-account-actor-contract-v2.mjs",
    "tests/integration/proofs/source-generation-financial-readback.mjs",
    "tests/integration/proofs/source-generation-portable-readback.mjs",
    "packages/components/src/verification/current-source-generation.mjs",
    "package.json", "package-lock.json", "scripts/layout.json", "scripts/module-boundaries.json",
    "scripts/development/source-pins.json", "scripts/development/source-generation-inspect.mjs",
    "scripts/development/source_generations.py", "scripts/development/source_pins.py",
    "scripts/development/module_boundaries.py", "scripts/development/import_paths.py",
    "scripts/development/workspace.py", "apps/mobile/package.json", "apps/mobile/package-lock.json",
    "archive/source-evidence/paged-original-host-v4/provenance.json",
    "archive/source-evidence/paged-original-host-v4/compiler-provenance-v1.json",
    "archive/source-evidence/paged-original-host-v4/214068d85598663c86bcd76873cda7add4a6f86a4f820511c9dd18cb407eb813.source",
    "packages/backend/src/operations/local/funded-paged-native-source-v3.mjs",
    "packages/backend/src/operations/local/funded-graph-paged-device-graph-source-v3.mjs",
    "apps/platform/src/run-original-arbitrum-private-native-mobile-v1.mjs",
    "apps/platform/src/run-original-base-private-native-mobile-v1.mjs",
    "apps/platform/src/run-original-bsc-private-native-mobile-v3.mjs",
    "apps/platform/src/run-original-tron-private-native-mobile-v1.mjs",
    "scripts/development/bsc_original_genesis_v3.py",
    "scripts/development/original-network-mobile-private-diagnostic-v1.mjs",
    "scripts/development/owned-arbitrum-native-value-dispatch-v1.mjs",
    "scripts/development/owned-arbitrum-nitro-v1.mjs",
    "scripts/development/owned-arbitrum-private-native-mobile-v1.mjs",
    "scripts/development/owned-base-native-value-dispatch-v1.mjs",
    "scripts/development/owned-base-private-native-mobile-v1.mjs",
    "scripts/development/owned-base-rollup-v1.mjs",
    "scripts/development/owned-bsc-native-value-dispatch-v3.mjs",
    "scripts/development/owned-bsc-original-source-profile-v3.mjs",
    "scripts/development/owned-bsc-posa-v1.mjs",
    "scripts/development/owned-bsc-private-native-mobile-v3.mjs",
    "scripts/development/owned-rollup-original-source-profile-v1.mjs",
    "scripts/development/owned-tron-original-mobile-source-v1.mjs",
    "scripts/development/owned-tron-private-native-mobile-v1.mjs",
    "scripts/development/owned_arbitrum_nitro_v1.py",
    "scripts/development/owned_base_rollup_v1.py",
    "scripts/development/owned_bsc_posa_v1.py",
    "tests/integration/wallet/native/native-device-economic-private-error-v1.mjs",
    "tests/integration/wallet/manual/run-manual-wallet-acceptance.mjs",
    "tests/integration/wallet/manual/run-manual-wallet-timeout-recovery.mjs",
    "tests/integration/wallet/manual/run-manual-wallet-browser-acceptance.mjs",
    "tests/integration/wallet/manual/run-manual-wallet-browser-timeout-recovery.mjs",
    "tests/integration/wallet/manual/manual-wallet-acceptance.mjs",
    "tests/integration/wallet/manual/manual-wallet-timeout-recovery.mjs",
    "tests/integration/wallet/manual/manual-wallet-browser-acceptance.mjs",
    "tests/integration/wallet/manual/manual-wallet-browser-timeout-recovery.mjs",
    "scripts/development/evm_lab.py",
    "scripts/wallet/preparation/prepare-development-evm.mjs",
    "scripts/wallet/preparation/prepare-development-native-claims.mjs",
    "scripts/wallet/preparation/prepare-backed-assets.mjs",
    "packages/proofs/src/native-ingress/tooling/native-claims-parent-death.py",
    "apps/wallet/src/client/app.mjs",
    "apps/wallet/src/client/index.html",
    "apps/wallet/src/client/style.css",
    "apps/mobile/src/custody/device-graph-string-table-v5.ts",
    "apps/mobile/tsconfig.json", "apps/platform/package.json", "apps/platform/package-lock.json",
    "apps/mobile/src/api/device-external-flat-graph-api-v1.mjs",
    "apps/mobile/src/api/device-external-flat-note-api-v1.mjs",
    "apps/mobile/src/api/device-morpho-blue-redemption-api-v1.mjs",
    "apps/mobile/src/api/device-private-graph-proof-transit-v2.mjs",
    "apps/mobile/src/api/device-private-proof-transit-v2.mjs",
    "apps/mobile/src/custody/balance-note-codec-v1.mjs",
    "apps/mobile/src/custody/device-balance-withdrawal-codec-v1.mjs",
    "apps/mobile/src/custody/device-external-flat-note-vault-v1.ts",
    "apps/mobile/src/custody/funded-balance-owner-codec-v1.mjs",
    "apps/mobile/src/custody/key-store.ts",
    "apps/mobile/src/custody/wallet-session-v1.ts",
    "apps/mobile/src/custody/native-claim-pending-store-v1.ts",
    "apps/mobile/src/custody/native-claim-pending-v1.d.mts",
    "apps/mobile/src/custody/native-claim-pending-v1.mjs",
    "apps/mobile/src/custody/sealed-custody-backup-v1.d.mts",
    "apps/mobile/src/custody/sealed-custody-backup-v1.mjs",
    "apps/mobile/src/custody/signing.mjs",
    "apps/platform/src/run-device-external-flat-local-v1.mjs",
    "apps/platform/src/run-device-external-flat-ordered-local-v1.mjs",
    "dev",
    "packages/backend/src/accounts/authority/device-external-flat-note-authority-v1.mjs",
    "packages/backend/src/accounts/authority/device-external-flat-source-graph-v1.mjs",
    "packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs",
    "packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs",
    "packages/backend/src/accounts/authority/device-owner-reservation-bridge-v1.mjs",
    "packages/backend/src/accounts/authority/flat-account-authority.mjs",
    "packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs",
    "packages/backend/src/accounts/recovery/device-external-flat-ordered-observation-recovery-v1.mjs",
    "packages/backend/src/api/accounts/flat-account-http.mjs",
    "packages/backend/src/api/accounts/flat-account-session.mjs",
    "packages/backend/src/api/mobile/device-external-flat-note-http-v1.mjs",
    "packages/backend/src/api/mobile/original-device-durable-dispatch-v1.mjs",
    "packages/backend/src/api/mobile/paired-original-account-http-v2.mjs",
    "packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs",
    "packages/backend/src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs",
    "packages/backend/src/claims/wrapped/recovery/external-bootstrap-recovery-backend-v1.mjs",
    "packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs",
    "packages/backend/src/claims/wrapped/recovery/wrapped-terminal-baseline-v1.mjs",
    "packages/backend/src/custody/processes/flat-owner-process.mjs",
    "packages/backend/src/custody/processes/native-value-owner-process-v2.mjs",
    "packages/backend/src/custody/processes/wrapped-claim-owner-process-v1.mjs",
    "packages/backend/src/defi/vaults/morpho-vault-redemption-accounting-v1.mjs",
    "packages/backend/src/defi/vaults/owned-metamorpho-vault.mjs",
    "packages/backend/src/defi/withdrawals/device-morpho-blue-private-exit-v1.mjs",
    "packages/backend/src/execution/account/execution/flat-native-execution.mjs",
    "packages/backend/src/execution/encoding/terminal-calldata-codec.mjs",
    "packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs",
    "packages/backend/src/execution/native-value/preparation/native-value-graph-admission-v2.mjs",
    "packages/backend/src/execution/native/recipients/native-recipient-process.mjs",
    "packages/backend/src/operations/deployments/claims/native-spl-claim-v1-compilation.mjs",
    "packages/backend/src/operations/deployments/defi/deploy-morpho-blue-position-v1.mjs",
    "packages/backend/src/operations/deployments/defi/deploy-private-external-router-v1.mjs",
    "packages/backend/src/operations/deployments/defi/morpho-blue-position-compilation-v1.mjs",
    "packages/backend/src/operations/local/device-external-flat-local-operator-v1.mjs",
    "packages/backend/src/operations/local/device-external-flat-note-service-v1.mjs",
    "packages/backend/src/operations/local/device-external-flat-ordered-local-operator-v1.mjs",
    "packages/backend/src/operations/local/device-external-flat-ordered-observation-service-v1.mjs",
    "packages/backend/src/operations/local/device-external-flat-source-graph-service-v1.mjs",
    "packages/backend/src/operations/local/wrapped-wallet-runtime-v1.mjs",
    "packages/backend/src/operations/recovery/native-device-economic-service-v1.mjs",
    "packages/backend/src/operations/recovery/native-device-local-operator-v1.mjs",
    "packages/backend/src/operations/recovery/native-value-economic-successor-v1.mjs",
    "packages/backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs",
    "packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs",
    "packages/backend/src/operations/releases/wrapped/wrapped-wallet-fixed-policy-v1.mjs",
    "packages/backend/src/operations/releases/wrapped/wrapped-wallet-fixed-source-pins-v1.mjs",
    "packages/backend/src/operations/wallet/wrapped-wallet-composition-v1.mjs",
    "packages/backend/src/proving/native-ingress/runtime/native-claims-build-worker.mjs",
    "packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-role-process.mjs",
    "packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-worker.mjs",
    "packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-role-process.mjs",
    "packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-worker.mjs",
    "packages/backend/src/proving/native-value/runtime/native-value-live-v2-role-process.mjs",
    "packages/backend/src/proving/native-value/runtime/native-value-live-v2-worker.mjs",
    "packages/backend/src/proving/native-value/tooling/native-value-live-v2-run-bounded.mjs",
    "packages/backend/src/proving/roles/role-client.mjs",
    "packages/backend/src/proving/wrapped-claims/runtime/wrapped-claim-role-process-v1.mjs",
    "packages/backend/src/proving/wrapped-claims/runtime/wrapped-claim-worker-v1.mjs",
    "packages/components/src/resources/private-resource-policy.mjs",
    "packages/components/src/resources/private-verifier-crs.mjs",
    "packages/components/src/resources/wallet-resources.mjs",
    "packages/components/src/verification/wrapped-installation-source-inspector-v2.mjs",
    "packages/crypto/src/portable/poseidon2-bn254-v1.mjs",
    "packages/custody/src/signing/flat-owner-custody.mjs",
    "packages/engine/src/chains/shared/linux-runtime-pins.mjs",
    "packages/engine/src/crypto/private-proof-transit-v1.mjs",
    "packages/engine/src/execution/accounts/generic-account-child.mjs",
    "packages/engine/src/execution/accounts/generic-account-coordinator.mjs",
    "packages/engine/src/execution/accounts/generic-account-process.mjs",
    "packages/engine/src/execution/balances/generic-balance-owner-child.mjs",
    "packages/mobile-protocol/src/authorization.mjs",
    "packages/mobile-protocol/src/device-defi-position-read-v1.mjs",
    "packages/mobile-protocol/src/device-deposit-consent-v1.mjs",
    "packages/mobile-protocol/src/device-execution-consent-v1.mjs",
    "packages/mobile-protocol/src/device-exit-consent-v1.mjs",
    "packages/mobile-protocol/src/device-external-flat-graph-v1.mjs",
    "packages/mobile-protocol/src/device-external-flat-note-v1.mjs",
    "packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs",
    "packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs",
    "packages/mobile-protocol/src/device-reservation-consent-v1.mjs",
    "packages/mobile-protocol/src/original-account-private-state-v1.mjs",
    "packages/mobile-protocol/src/original-account-review-v2.mjs",
    "packages/mobile-protocol/src/wallet/contracts/generation-position-state-v2.mjs",
    "packages/proofs/src/execution/proof-worker.mjs",
    "packages/proofs/src/jobs/native-device-private-deposit-client-v2.mjs",
    "packages/proofs/src/jobs/native-device-private-deposit-recipient-v2.mjs",
    "packages/proofs/src/jobs/native-device-private-deposit-recipient-v3.mjs",
    "packages/proofs/src/jobs/native-device-private-exit-client-v2.mjs",
    "packages/proofs/src/jobs/native-device-private-exit-recipient-v2.mjs",
    "packages/proofs/src/jobs/native-device-private-exit-recipient-v3.mjs",
    "packages/proofs/src/jobs/native-private-note-deposit-worker-v3.mjs",
    "packages/proofs/src/jobs/native-private-note-execution-v3.mjs",
    "packages/proofs/src/jobs/native-private-note-process-v3.mjs",
    "packages/proofs/src/jobs/native-private-note-withdraw-worker-v3.mjs",
    "packages/proofs/src/jobs/private-device-wallet-note-input-v3.mjs",
    "packages/proofs/src/jobs/private-native-device-authorization-input-v2.mjs",
    "packages/proofs/src/jobs/private-native-device-deposit-input-v2.mjs",
    "packages/proofs/src/jobs/private-native-device-exit-input-v2.mjs",
    "packages/proofs/src/jobs/role-process.mjs",
    "packages/proofs/src/jobs/run-bounded.mjs",
    "packages/proofs/src/jobs/trusted-jobs.mjs",
    "packages/proofs/src/jobs/wallet-note-private-client-v3.mjs",
    "packages/proofs/src/jobs/wallet-note-private-prover-v4.mjs",
    "packages/proofs/src/jobs/wallet-note-private-recipient-v3.mjs",
    "packages/proofs/src/jobs/wallet-note-private-worker-v4.mjs",
    "packages/proofs/src/jobs/worker.mjs",
    "packages/proofs/src/toolchain/wallet-prover.mjs",
    "packages/proofs/src/verification/pinned-verifier.mjs",
    "scripts/development/aave_material.py",
    "scripts/development/dev",
    "scripts/development/empty_audit_lab.py",
    "scripts/development/jupiter_material.py",
    "scripts/development/native_economic_note_receipts.py",
    "scripts/development/osaka_lab.py",
    "scripts/development/paired_original_account_lab.py",
    "tests/integration/accounts/recovery/account-recovery.mjs",
    "tests/integration/accounts/recovery/run-account-recovery.mjs",
    "tests/integration/chains/evm/aave-compilation-policy-v1.mjs",
    "tests/integration/chains/evm/aave-compilation-source-pins-v1.mjs",
    "tests/integration/chains/evm/aave-compilation-worker-v1.mjs",
    "tests/integration/chains/evm/aave-private-graph-policy-v1.mjs",
    "tests/integration/chains/evm/aave-private-graph-source-pins-v1.mjs",
    "tests/integration/chains/evm/evm-metamorpho-recovery-policy-v1.mjs",
    "tests/integration/chains/evm/evm-metamorpho-recovery-source-pins-v1.mjs",
    "tests/integration/chains/evm/evm-vault-flow.mjs",
    "tests/integration/chains/evm/external-defi-vault-exit-lifetime-v1.mjs",
    "tests/integration/chains/evm/external-defi-vault-exit-policy-v1.mjs",
    "tests/integration/chains/evm/external-defi-vault-exit-source-pins-v1.mjs",
    "tests/integration/chains/evm/external-defi-vault-exit-successor-v1.mjs",
    "tests/integration/chains/evm/native-spl-claim-token-compilation-policy-v1.mjs",
    "tests/integration/chains/evm/native-spl-claim-token-compilation-source-pins-v1.mjs",
    "tests/integration/chains/evm/native-spl-claim-token-compilation-worker-v1.mjs",
    "tests/integration/chains/evm/native-spl-claim-v1-compilation-policy.mjs",
    "tests/integration/chains/evm/native-spl-claim-v1-compilation-source-pins.mjs",
    "tests/integration/chains/evm/native-spl-claim-v1-compilation-worker.mjs",
    "tests/integration/chains/evm/native-spl-claim-validation-compilation-policy-v1.mjs",
    "tests/integration/chains/evm/native-spl-claim-validation-compilation-source-pins-v1.mjs",
    "tests/integration/chains/evm/native-spl-claim-validation-compilation-worker-v1.mjs",
    "tests/integration/chains/evm/run-evm-aave-compilation-v1.mjs",
    "tests/integration/chains/evm/run-evm-aave-exit-recovery-v1.mjs",
    "tests/integration/chains/evm/run-evm-aave-flow.mjs",
    "tests/integration/chains/evm/run-evm-metamorpho-exit-recovery-v1.mjs",
    "tests/integration/chains/evm/run-evm-metamorpho-recovery-flow-v1.mjs",
    "tests/integration/chains/evm/run-evm-uniswap-flow.mjs",
    "tests/integration/chains/evm/run-evm-uniswap-recovery-flow.mjs",
    "tests/integration/chains/evm/run-evm-vault-flow.mjs",
    "tests/integration/chains/evm/run-native-spl-claim-token-compilation-v1.mjs",
    "tests/integration/chains/evm/run-native-spl-claim-v1-compilation.mjs",
    "tests/integration/chains/evm/run-native-spl-claim-validation-compilation-v1.mjs",
    "tests/integration/chains/solana/jupiter-orca-public-swap-policy-v1.mjs",
    "tests/integration/chains/solana/jupiter-orca-public-swap-source-pins-v1.mjs",
    "tests/integration/chains/solana/jupiter-orca-public-swap-worker-v1.mjs",
    "tests/integration/chains/solana/native-spl-compilation-material-v1.mjs",
    "tests/integration/chains/solana/native-spl-compilation-policy-v1.mjs",
    "tests/integration/chains/solana/native-spl-compilation-source-pins-v1.mjs",
    "tests/integration/chains/solana/native-spl-compilation-worker-v1.mjs",
    "tests/integration/chains/solana/run-jupiter-orca-public-swap-v1.mjs",
    "tests/integration/chains/solana/run-native-spl-compilation-v1.mjs",
    "tests/integration/claims/development/development-btc-sol-graph-flow.mjs",
    "tests/integration/claims/development/development-btc-sol-graph-policy.mjs",
    "tests/integration/claims/development/development-btc-sol-graph-source-pins.mjs",
    "tests/integration/claims/development/development-btc-spl-jupiter-flow-v1.mjs",
    "tests/integration/claims/development/development-btc-spl-jupiter-policy-v1.mjs",
    "tests/integration/claims/development/development-btc-spl-jupiter-source-pins-v1.mjs",
    "tests/integration/claims/development/development-native-claim-flow.mjs",
    "tests/integration/claims/development/development-native-claim-policy.mjs",
    "tests/integration/claims/development/development-native-claim-source-pins.mjs",
    "tests/integration/claims/development/run-development-btc-sol-graph-flow.mjs",
    "tests/integration/claims/development/run-development-btc-spl-jupiter-flow-v1.mjs",
    "tests/integration/claims/development/run-development-native-claim-flow.mjs",
    "tests/integration/claims/graph/flows/run-native-claim-graph-flow.mjs",
    "tests/integration/claims/graph/flows/run-native-claim-graph-v3-flow.mjs",
    "tests/integration/claims/health/native-claim-unfunded-health-worker.mjs",
    "tests/integration/claims/health/run-native-claim-unfunded-health.mjs",
    "tests/integration/claims/ingress/native-claim-ingress-v3-production-proof.mjs",
    "tests/integration/claims/ingress/native-ingress-v3-preflight-policy.mjs",
    "tests/integration/claims/ingress/native-ingress-v3-preflight-worker.mjs",
    "tests/integration/claims/ingress/native-ingress-v3-preflight.mjs",
    "tests/integration/claims/ingress/native-ingress-v3-production-preflight-worker.mjs",
    "tests/integration/claims/ingress/run-native-ingress-v3-preflight.mjs",
    "tests/integration/claims/ingress/run-native-ingress-v3-production-preflight.mjs",
    "tests/integration/claims/inventory/run-native-claim-loaded-facts-probe.mjs",
    "tests/integration/claims/inventory/run-native-claim-loaded-v3-flow.mjs",
    "tests/integration/claims/lifecycle/check-native-claim-artifacts.mjs",
    "tests/integration/claims/lifecycle/native-claim-flow.mjs",
    "tests/integration/claims/lifecycle/native-claim-source-pins.mjs",
    "tests/integration/claims/lifecycle/run-native-claim-flow.mjs",
    "tests/integration/claims/metrics/native-claim-empty-audit-policy-v1.mjs",
    "tests/integration/claims/metrics/native-claim-empty-audit-source-pins-v1.mjs",
    "tests/integration/claims/metrics/native-claim-empty-audit-v1.mjs",
    "tests/integration/claims/metrics/run-native-claim-empty-audit-v1.mjs",
    "tests/integration/claims/payouts/run-native-claim-begin-payout-audit-v1.mjs",
    "tests/integration/defi/entry/development-defi-entry-flow.mjs",
    "tests/integration/defi/entry/development-defi-entry-source-pins.mjs",
    "tests/integration/defi/entry/run-development-defi-entry-flow.mjs",
    "tests/integration/defi/private-metamorpho-flow.mjs",
    "tests/integration/defi/private-metamorpho-source-pins.mjs",
    "tests/integration/defi/run-private-metamorpho-flow.mjs",
    "tests/integration/deployments/wrapped/run-wrapped-deployment-only-v1.mjs",
    "tests/integration/deployments/wrapped/wrapped-deployment-only-v1.mjs",
    "tests/integration/evm/osaka/development-osaka-smoke-source-pins.mjs",
    "tests/integration/evm/osaka/development-osaka-smoke.mjs",
    "tests/integration/evm/osaka/run-development-osaka-smoke.mjs",
    "tests/integration/fixtures/claims/ingress/owned-native-ingress-v3-preflight-fixture.mjs",
    "tests/integration/fixtures/pools/pool-generation-fixture.mjs",
    "tests/integration/native/native-flow-supervisor.mjs",
    "tests/integration/native/native-flow.mjs",
    "tests/integration/native/run-native-flow.mjs",
    "tests/integration/pools/pool-generation-acceptance.mjs",
    "tests/integration/pools/pool-generation-checks.mjs",
    "tests/integration/pools/pool-generation-phase1.mjs",
    "tests/integration/pools/pool-generation-phase2.mjs",
    "tests/integration/pools/pool-generation-source-pins.mjs",
    "tests/integration/pools/run-pool-generation-phase1.mjs",
    "tests/integration/pools/run-pool-generation-phase2.mjs",
    "tests/integration/portfolio/asset-portfolio.mjs",
    "tests/integration/portfolio/run-asset-portfolio.mjs",
    "tests/integration/runners/source-pins.mjs",
    "tests/integration/wallet/native/device-confirmed-source-backend-v2.mjs",
    "tests/integration/wallet/native/device-confirmed-source-channel-v2.mjs",
    "tests/integration/wallet/native/device-confirmed-source-cleanup-v2.mjs",
    "tests/integration/wallet/native/device-external-flat-erc20-flow-v1.mjs",
    "tests/integration/wallet/native/device-external-flat-erc20-host-vault-v1.mjs",
    "tests/integration/wallet/native/device-external-flat-erc20-policy-v1.mjs",
    "tests/integration/wallet/native/device-external-flat-erc20-source-pins-v1.mjs",
    "tests/integration/wallet/native/device-external-flat-ordered-restart-v1.mjs",
    "tests/integration/wallet/native/device-external-flat-ordered-successor-v1.mjs",
    "tests/integration/wallet/native/device-external-flat-private-error-v1.mjs",
    "tests/integration/wallet/native/device-owner-deposit-flow-v1.mjs",
    "tests/integration/wallet/native/device-owner-deposit-original-step-v1.mjs",
    "tests/integration/wallet/native/device-owner-execution-flow-v1.mjs",
    "tests/integration/wallet/native/device-owner-execution-native-checks-v1.mjs",
    "tests/integration/wallet/native/device-owner-execution-original-continuation-v1.mjs",
    "tests/integration/wallet/native/device-owner-execution-policy-v1.mjs",
    "tests/integration/wallet/native/device-owner-execution-source-pins-v1.mjs",
    "tests/integration/wallet/native/device-owner-original-f-reorg-flow-v1.mjs",
    "tests/integration/wallet/native/device-owner-recovery-flow-v1.mjs",
    "tests/integration/wallet/native/device-owner-recovery-policy-v1.mjs",
    "tests/integration/wallet/native/device-owner-recovery-source-pins-v1.mjs",
    "tests/integration/wallet/native/device-owner-reservation-flow-v1.mjs",
    "tests/integration/wallet/native/device-owner-reservation-host-vault-v1.mjs",
    "tests/integration/wallet/native/device-owner-reservation-original-continuation-v1.mjs",
    "tests/integration/wallet/native/device-owner-reservation-original-preparation-v1.mjs",
    "tests/integration/wallet/native/device-owner-reservation-policy-v1.mjs",
    "tests/integration/wallet/native/device-owner-reservation-source-pins-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-launcher-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-note-policy-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-note-process-scope-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-note-source-pins-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-note-successor-worker-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-original-continuation-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-policy-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-source-pins-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-successor-audit-v1.mjs",
    "tests/integration/wallet/native/native-device-economic-successor-worker-v1.mjs",
    "tests/integration/wallet/native/native-device-live-armed-short-audit-v1.mjs",
    "tests/integration/wallet/native/native-device-live-armed-short-continuation-v1.mjs",
    "tests/integration/wallet/native/native-device-live-armed-short-policy-v1.mjs",
    "tests/integration/wallet/native/native-device-live-armed-short-process-scope-v1.mjs",
    "tests/integration/wallet/native/native-device-live-armed-short-source-pins-v1.mjs",
    "tests/integration/wallet/native/native-device-live-armed-short-successor-v1.mjs",
    "tests/integration/wallet/native/native-device-private-authorized-durable-note-policy-v2.mjs",
    "tests/integration/wallet/native/native-device-private-durable-note-policy-v2.mjs",
    "tests/integration/wallet/native/native-device-private-worker-durable-note-policy-v3.mjs",
    "tests/integration/wallet/native/native-original-source-abrupt-backend-v1.mjs",
    "tests/integration/wallet/native/native-original-source-abrupt-flow-v1.mjs",
    "tests/integration/wallet/native/native-original-source-abrupt-policy-v1.mjs",
    "tests/integration/wallet/native/native-original-source-abrupt-process-scope-v1.mjs",
    "tests/integration/wallet/native/native-original-source-abrupt-source-pins-v1.mjs",
    "tests/integration/wallet/native/native-value-economic-note-recovery-flow-v1.mjs",
    "tests/integration/wallet/native/native-value-economic-recovery-flow-v1.mjs",
    "tests/integration/wallet/native/native-value-live-armed-short-restart-flow-v1.mjs",
    "tests/integration/wallet/native/native-value-private-authorized-durable-note-flow-v2.mjs",
    "tests/integration/wallet/native/native-value-private-durable-note-flow-v2.mjs",
    "tests/integration/wallet/native/native-value-private-worker-durable-note-flow-v3.mjs",
    "tests/integration/wallet/native/native-wallet-real-acceptance-v1.mjs",
    "tests/integration/wallet/native/native-wallet-real-driver-v1.mjs",
    "tests/integration/wallet/native/native-wallet-real-preflight-v1.mjs",
    "tests/integration/wallet/native/native-wallet-real-source-pins-v1.mjs",
    "tests/integration/wallet/native/native-wallet-tron-dev-v5.mjs",
    "tests/integration/wallet/native/paired-native-note-flow-v2.mjs",
    "tests/integration/wallet/native/run-device-aave-static-private-position-v1.mjs",
    "tests/integration/wallet/native/run-device-external-flat-erc20-v1.mjs",
    "tests/integration/wallet/native/run-device-external-flat-meta-four-deliveries-v1.mjs",
    "tests/integration/wallet/native/run-device-external-flat-source-graph-v1.mjs",
    "tests/integration/wallet/native/run-device-morpho-blue-private-position-v1.mjs",
    "tests/integration/wallet/native/run-device-owner-deposit-v1.mjs",
    "tests/integration/wallet/native/run-device-owner-execution-v1.mjs",
    "tests/integration/wallet/native/run-device-owner-original-f-reorg-v1.mjs",
    "tests/integration/wallet/native/run-device-owner-recovery-v1.mjs",
    "tests/integration/wallet/native/run-device-owner-reservation-v1.mjs",
    "tests/integration/wallet/native/run-device-uniswap-v3-private-note-v1.mjs",
    "tests/integration/wallet/native/run-native-original-source-abrupt-v1.mjs",
    "tests/integration/wallet/native/run-native-value-durable-economic-note-recovery-v1.mjs",
    "tests/integration/wallet/native/run-native-value-durable-economic-note-successor-v1.mjs",
    "tests/integration/wallet/native/run-native-value-economic-note-recovery-v1.mjs",
    "tests/integration/wallet/native/run-native-value-economic-recovery-v1.mjs",
    "tests/integration/wallet/native/run-native-value-live-armed-short-restart-v1.mjs",
    "tests/integration/wallet/native/run-native-value-private-authorized-durable-note-recovery-v2.mjs",
    "tests/integration/wallet/native/run-native-value-private-authorized-durable-note-successor-v2.mjs",
    "tests/integration/wallet/native/run-native-value-private-durable-note-recovery-v2.mjs",
    "tests/integration/wallet/native/run-native-value-private-durable-note-successor-v2.mjs",
    "tests/integration/wallet/native/run-native-value-private-worker-durable-note-recovery-v3.mjs",
    "tests/integration/wallet/native/run-native-value-private-worker-durable-note-successor-v3.mjs",
    "tests/integration/wallet/native/run-native-wallet-real-acceptance-v1.mjs",
    "tests/integration/wallet/native/run-native-wallet-real-preflight-v1.mjs",
    "tests/integration/wallet/native/run-native-wallet-tron-dev-v5.mjs",
    "tests/integration/wallet/native/run-paired-native-note-v2.mjs",
    "tests/integration/wallet/wrapped/flows/run-wrapped-wallet-fixed-acceptance-v1.mjs",
    "tests/integration/wallet/wrapped/flows/wrapped-wallet-fixed-acceptance-v1.mjs",
    "tests/integration/wallet/wrapped/flows/wrapped-wallet-fixed-driver-v1.mjs",
    "tests/integration/wallet/wrapped/flows/wrapped-wallet-fixed-steps-v1.mjs",
    "tests/integration/wallet/wrapped/validation/run-wrapped-wallet-fixed-preflight-v1.mjs",
    "tests/integration/wallet/wrapped/validation/wrapped-wallet-fixed-preflight-v1.mjs",
    'packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-client.mjs',
    'packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-native-execution.mjs',
    'packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-public-crs.mjs',
    'packages/backend/src/proving/native-value/tooling/native-value-dev-live-v5-run-bounded.mjs',
    'packages/backend/src/proving/native-value/tooling/native-value-dev-live-v5-tooling.mjs',
    'packages/proofs/src/host/process-files.mjs',
    'packages/proofs/src/jobs/standard-proof-resources-v1.mjs',
    'tests/integration/native/native-flow-owned-rss-v1.mjs',
    'apps/mobile/src/custody/device-recovery-copy-gate-v1.ts',
    'apps/mobile/src/custody/device-note-stored-state-v1.ts',
    'packages/backend/src/operations/operators/native-value/original-current-round-v4.mjs',
    'scripts/development/source_bundle.py',
    'packages/backend/src/operations/operators/native-value/original-inventory-round-v4.mjs',
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def relative(name):
    if (not isinstance(name, str) or not name or name.startswith("/") or "\\" in name
            or any(ord(char) < 32 or ord(char) == 127 for char in name)):
        raise ValueError("Expected a repository-relative path")
    if any(not part or part in (".", "..", ".git") or part.startswith(".env") for part in name.split("/")):
        raise ValueError("Refusing non-public or escaping path")
    return name


def physical(name):
    path = ROOT / relative(name)
    if path.resolve() != path.absolute():
        raise ValueError("Refusing an aliased path: " + name)
    return path


def read(name):
    path = physical(name)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_BYTES:
            raise ValueError("Expected bounded regular file: " + name)
        with os.fdopen(fd, "rb", closefd=False) as stream:
            value = stream.read(MAX_BYTES + 1)
        after = os.fstat(fd)
        named = path.lstat()
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if len(value) != before.st_size or any(getattr(before, key) != getattr(after, key)
                or getattr(before, key) != getattr(named, key) for key in fields):
            raise ValueError("Source changed while reading: " + name)
        return value
    finally:
        os.close(fd)


def literal(data, marker):
    text = data.decode("utf8")
    if text.count(marker) != 1:
        raise ValueError("Expected one fixed data declaration: " + marker)
    return json.JSONDecoder().raw_decode(text.split(marker, 1)[1].lstrip())[0]


def label_path(name):
    relative(name)
    for prefix, root in PREFIXES:
        if name.startswith(prefix):
            return relative(root + name[len(prefix):])
    return relative(FLAT + name)


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate layout field: " + key)
        value[key] = item
    return value


def retained_source_evidence(path):
    """Retired collector/facade bytes; never an executable replacement."""
    return re.fullmatch(r"archive/source-evidence/(retired-source-collectors|retired-facades)/[0-9a-f]{64}\.source", path) is not None


def source_relocations(definition):
    """Explicit one-to-one historical source names, never filesystem aliases.

    Only an absent old public source may resolve to a present physical source.
    Chains and merged destinations require a new explicit review rather than
    silently choosing an implementation for an old publication.
    """
    relocations = definition.get("sourceRelocations", {})
    if not isinstance(relocations, dict):
        raise ValueError("Source relocations must be an explicit path map")
    destinations = set()
    for old, new in relocations.items():
        for name in (old, new):
            relative(name)
            if name == new and retained_source_evidence(name):
                if sha(read(name)) != Path(name).stem:
                    raise ValueError("Retired source evidence was modified: " + name)
                continue
            if (name.split("/", 1)[0] not in {"packages", "apps", "scripts", "tests", "experiments", "contracts"}
                    or any(part.startswith(".") or part in {"node_modules", "secrets"} for part in name.split("/"))
                    or name.endswith((".pem", ".key", ".p12", ".pfx"))):
                raise ValueError("Source relocation requires a public source path: " + name)
        if new in relocations:
            raise ValueError("Chained or cyclic source relocation: " + old)
        if new in destinations:
            raise ValueError("Ambiguous source relocation destination: " + new)
        destinations.add(new)
        if physical(old).exists():
            raise ValueError("Source relocation would hide an existing source: " + old)
        if not physical(new).is_file():
            raise ValueError("Source relocation target is missing or not a file: " + new)
    return dict(relocations)


class Capture:
    """Resolve published paths to editable sources without building the runtime."""
    def __init__(self):
        self.layout_bytes = read("scripts/layout.json")
        definition = json.loads(self.layout_bytes, object_pairs_hook=unique_object)
        self.layout = workspace_layout(ROOT)
        if read("scripts/layout.json") != self.layout_bytes:
            raise ValueError("Layout changed while resolving current sources")
        self.relocations = source_relocations(definition)
        self.files = {}
        self.objects = {}
        # Forward-map today's real files. Several domain directories share one
        # historical flat directory, so reversing a directory rule is ambiguous
        # for modules added after the frozen layout inventory.
        self.reverse = {row["path"]: row["source"] for row in self.layout["files"]}
        # Retired execution paths remain labels in frozen publications. Resolve
        # only their reviewed source relocations; never read or recreate a copy.
        self.retired_runtime_sources = definition.get("retiredRuntimeSources", {})
        if not isinstance(self.retired_runtime_sources, dict):
            raise ValueError("Retired runtime sources must be an explicit path map")
        for runtime, old in self.retired_runtime_sources.items():
            relative(runtime)
            if runtime in self.reverse or old not in self.relocations:
                raise ValueError("Retired runtime mapping requires an absent relocated source: " + runtime)
        self.canonical_runtime_sources = definition.get('canonicalRuntimeSources', {})
        if not isinstance(self.canonical_runtime_sources, dict):
            raise ValueError('Canonical runtime sources must be an explicit path map')
        for runtime, source in self.canonical_runtime_sources.items():
            relative(runtime)
            relative(source)
            if (runtime in self.reverse or runtime in self.retired_runtime_sources
                    or source in self.relocations or not physical(source).is_file()):
                raise ValueError('Canonical runtime source must have one live owner: ' + runtime)
        if len(set(self.canonical_runtime_sources.values())) != len(self.canonical_runtime_sources):
            raise ValueError('Canonical runtime source owner must be unique')
        seen = {}
        ignored = {"node_modules", ".local", ".git", "__pycache__", ".DS_Store"}
        for name in self.layout.get("sourceRoots", []):
            base = ROOT / name
            paths = []
            if base.is_file():
                paths = [base]
            elif base.is_dir():
                for parent, dirs, names in os.walk(base, followlinks=False):
                    dirs[:] = [entry for entry in dirs if entry not in ignored]
                    paths.extend(Path(parent) / entry for entry in names
                                 if entry not in ignored and not entry.startswith(".env"))
            for path in paths:
                source = path.relative_to(ROOT).as_posix()
                if source in self.canonical_runtime_sources.values():
                    continue
                target = map_path(source, self.layout, "runtime")
                if target is None or path.name in {"README.md", "package.json", "package-lock.json"}:
                    continue
                if target in seen and seen[target] != source:
                    raise ValueError("Ambiguous current source mapping: " + target)
                seen[target] = source
                self.reverse[target] = source

    def observe(self, target):
        relative(target)
        if target in self.files:
            return self.files[target]
        source = target
        mapped = None
        retired = False
        if target.startswith(RUNTIME):
            runtime = target[len(RUNTIME):]
            mapped = self.reverse.get(runtime)
            canonical = runtime in self.canonical_runtime_sources
            if canonical:
                mapped = self.canonical_runtime_sources[runtime]
            retired = canonical or mapped is None and runtime in self.retired_runtime_sources
            if retired and not canonical:
                mapped = self.retired_runtime_sources[runtime]
            if mapped is not None:
                relative(mapped)
                if not retired and map_path(mapped, self.layout, "runtime") != runtime:
                    raise ValueError("Non-reversible source mapping: " + target)
                source = mapped
        original_source = source
        if source in self.relocations:
            # Recheck absence at observation time: a restored file must never be
            # shadowed by a candidate mapping captured earlier in this process.
            if physical(source).exists():
                raise ValueError("Source relocation would hide an existing source: " + source)
            source = self.relocations[source]
        try:
            value = read(source)
        except FileNotFoundError:
            row = {"path": target, "source": source, "status": "MISSING"}
        else:
            canonical_sha = sha(value)
            self.objects[canonical_sha] = value
            generated = value
            if mapped is not None and source.endswith(".mjs"):
                generated = translate(value.decode(), source, target[len(RUNTIME):], self.layout,
                    "runtime", self.layout.get("importSpellings", {}).get(source))[0].encode()
            generated_sha = sha(generated)
            self.objects[generated_sha] = generated
            row = {"path": target, "source": source, "sourceSHA256": canonical_sha,
                   "sha256": generated_sha, "bytes": len(generated), "status": "PRESENT"}
            if retired:
                row["runtimeDisposition"] = "RETIRED_PUBLICATION_LABEL"
            elif mapped is not None:
                try:
                    row["runtimeMatchesSource"] = sha(read(target)) == generated_sha
                except FileNotFoundError:
                    row["runtimeMatchesSource"] = False
        if source != original_source:
            row["sourceRelocation"] = {"from": original_source, "to": source}
        self.files[target] = row
        return row

    def compare(self, path, expected):
        row = dict(self.observe(path))
        row["expectedSHA256"] = expected
        if row["status"] == "PRESENT":
            row["status"] = "UNCHANGED" if row["sha256"] == expected else "CHANGED"
        return row


NATIVE_WALLET_NPM_PATHS = frozenset("node_modules/" + name for name in (
    "@noble/ciphers", "@noble/curves", "@noble/hashes", "@scure/base", "@scure/bip32",
    "@scure/bip39", "@scure/btc-signer", "micro-eth-signer", "micro-key-producer",
    "micro-packed", "micro-sol-signer", "micro-sol-signer/node_modules/@scure/base",
    "micro-sol-signer/node_modules/micro-packed"))


class ReviewedNativeWalletNpm:
    """A closed installed dependency boundary, independent of legacy mobile pins.

    The policy seals bytes of all public package files, not just metadata/version.
    Node's nearest package resolution is reproduced only within this exact set;
    nested Solana dependencies must not silently resolve to the newer root copy.
    """
    def __init__(self, policy, capture):
        self.files, self.packages, self.metadata = {}, {}, {}
        self.manifests, self.consumers = set(), ()
        if policy is None:
            return
        if (not isinstance(policy, dict) or set(policy) != {"schema", "manifest", "lock",
                "consumerPrefixes", "directDependencies", "packages"}
                or policy["schema"] != "LIANUM_REVIEWED_NATIVE_WALLET_NPM_V1"
                or policy["manifest"] != "packages/crypto/package.json"
                or policy["lock"] != "package-lock.json"
                or policy["consumerPrefixes"] != ["packages/crypto/src/"]
                or not isinstance(policy["packages"], list)
                or {row.get("path") for row in policy["packages"]} != NATIVE_WALLET_NPM_PATHS
                or len(policy["packages"]) != len(NATIVE_WALLET_NPM_PATHS)):
            raise ValueError("Unknown reviewed native wallet npm policy")
        self.consumers = tuple(policy["consumerPrefixes"])
        self.manifests = {policy["manifest"], policy["lock"]}

        def json_source(path):
            row = capture.observe(path)
            if row["status"] != "PRESENT":
                raise ValueError("Reviewed npm input is missing: " + path)
            return json.loads(capture.objects[row["sha256"]].decode("utf8"), object_pairs_hook=unique_object)

        manifest, lock = json_source(policy["manifest"]), json_source(policy["lock"])
        dependencies = {name: version for name, version in manifest.get("dependencies", {}).items()
                        if not name.startswith("@lianum/")}
        if (dependencies != policy["directDependencies"]
                or lock.get("packages", {}).get("packages/crypto", {}).get("dependencies")
                    != manifest.get("dependencies")):
            raise ValueError("Native wallet manifest/lock dependencies differ from reviewed policy")
        for package in policy["packages"]:
            if (set(package) != {"path", "name", "version", "resolved", "integrity", "dependencies", "files"}
                    or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", package["version"])
                    or not package["resolved"].startswith("https://registry.npmjs.org/")
                    or not re.fullmatch(r"sha512-[A-Za-z0-9+/]+={0,2}", package["integrity"])
                    or not isinstance(package["dependencies"], dict)
                    or not isinstance(package["files"], list) or len(package["files"]) > 256):
                raise ValueError("Invalid reviewed npm package record")
            path = relative(package["path"])
            record = lock["packages"].get(path, {})
            if (any(record.get(key) != package[key] for key in ("version", "resolved", "integrity"))
                    or record.get("dependencies", {}) != package["dependencies"]):
                raise ValueError("Reviewed npm lock record changed: " + path)
            installed = json_source(path + "/package.json")
            if (installed.get("name") != package["name"] or installed.get("version") != package["version"]
                    or installed.get("type") != "module"
                    or installed.get("dependencies", {}) != package["dependencies"]):
                raise ValueError("Reviewed installed npm package changed: " + path)
            self.packages[path], self.metadata[path] = package, installed
            paths = set()
            for entry in package["files"]:
                if (set(entry) != {"path", "bytes", "sha256"} or type(entry["bytes"]) is not int
                        or entry["bytes"] < 0 or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])):
                    raise ValueError("Invalid reviewed npm public file")
                local = relative(entry["path"])
                if "node_modules" in local.split("/") or local in paths:
                    raise ValueError("Nested/duplicate reviewed npm file: " + local)
                paths.add(local)
                target = path + "/" + local
                row = capture.observe(target)
                if row["status"] != "PRESENT" or row["bytes"] != entry["bytes"] or row["sha256"] != entry["sha256"]:
                    raise ValueError("Reviewed npm public bytes changed: " + target)
                self.files[target] = entry
            if "package.json" not in paths:
                raise ValueError("Reviewed npm manifest is not byte-pinned: " + path)
            actual = set()
            for parent, directories, names in os.walk(physical(path), followlinks=False):
                directories[:] = [name for name in directories if name != "node_modules"]
                for name in names:
                    child = Path(parent) / name
                    actual.add(child.relative_to(physical(path)).as_posix())
            if actual != paths:
                raise ValueError("Reviewed npm public file inventory changed: " + path)
        for name, version in dependencies.items():
            if self.packages.get("node_modules/" + name, {}).get("version") != version:
                raise ValueError("Native wallet direct dependency version changed: " + name)

    def owner(self, path):
        candidates = [package for package in self.packages if path.startswith(package + "/")]
        return max(candidates, key=len) if candidates else None

    def applies(self, path, name):
        return bool(self.packages) and (self.owner(path) is not None or path.startswith(self.consumers))

    def resolve(self, source, specifier):
        parts = specifier.split("/")
        name = "/".join(parts[:2]) if specifier.startswith("@") else parts[0]
        subpath = specifier[len(name):]
        if not name or any(part in {"", ".", ".."} for part in parts):
            raise ValueError("Invalid reviewed npm specifier: " + specifier)
        source_owner = self.owner(source)
        if source_owner:
            package_dependencies = self.packages[source_owner]["dependencies"]
            if name != self.packages[source_owner]["name"] and name not in package_dependencies:
                raise ValueError("Undeclared reviewed npm dependency: " + specifier + " in " + source)
        else:
            declared = {self.packages[path]["name"] for path in self.packages
                        if path.count("node_modules/") == 1}
            if name not in declared:
                raise ValueError("Unreviewed native wallet npm dependency: " + specifier)
        package_path = None
        if source_owner and self.packages[source_owner]["name"] == name and self.metadata[source_owner].get("exports"):
            package_path = source_owner
        parent = posixpath.dirname(source)
        while package_path is None:
            candidate = (parent + "/" if parent else "") + "node_modules/" + name
            if candidate in self.packages:
                package_path = candidate
                break
            if physical(candidate).exists():
                raise ValueError("Unreviewed closer npm installation: " + candidate)
            if not parent:
                break
            parent = posixpath.dirname(parent)
        if package_path is None:
            raise ValueError("Reviewed npm package cannot be resolved: " + specifier)
        package = self.packages[package_path]
        exports = self.metadata[package_path].get("exports")
        if exports is not None:
            if not isinstance(exports, dict) or not isinstance(exports.get("." + subpath), str):
                raise ValueError("Reviewed npm requires an explicit ESM export: " + specifier)
            entry = exports["." + subpath]
        else:
            entry = subpath.lstrip("/") if subpath else self.metadata[package_path].get("main")
        if not isinstance(entry, str) or not entry:
            raise ValueError("Reviewed npm entry is missing: " + specifier)
        entry = entry[2:] if entry.startswith("./") else entry
        target = package_path + "/" + relative(entry)
        if target not in self.files or not target.endswith(".js"):
            raise ValueError("Reviewed npm entry is outside its public JS inventory: " + specifier)
        return package, target


def inventory():
    capture = Capture()
    publication_bytes = read(RELEASE)
    publication = literal(publication_bytes, "export const NATIVE_VALUE_DEV_RELEASE_V5 = Object.freeze(")
    if publication.get("schema") != "LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5":
        raise ValueError("Unsupported published release schema")
    groups = [{"name": "native-release", "manifest": RELEASE, "dependsOn": [],
               "manifestSHA256": sha(publication_bytes), "files": [capture.compare(label_path(row["path"]),
               row["sha256"]) | {"label": row["path"]} for row in publication["sourceFiles"]]}]
    for name, path in CATALOGS.items():
        raw = read(path)
        if path.endswith(".source") and sha(raw) != Path(path).stem:
            raise ValueError("Original source catalogue evidence was modified")
        rows = literal(raw, "const rows=Object.freeze(")
        files = []
        for row in rows:
            for kind in ("canonical", "generated"):
                if row[kind] is not None:
                    files.append(capture.compare(row[kind]["path"], row[kind]["sha256"]) | {"kind": kind})
        groups.append({"name": name, "manifest": path, "manifestSHA256": sha(raw),
                       "dependsOn": ["native-release"] + (["native-paged"] if name == "graph-paged" else []), "files": files})
    artifacts = []
    for name, pins in (("ledger-v5", [publication["producedLedger"][key] for key in ("compiled", "receipt")]),
                       ("w39-v9", list(publication["producedW39"]["files"].values()))):
        files = []
        for pin in pins:
            target = label_path(pin["path"])
            try:
                value = read(target)
                status = "UNCHANGED" if sha(value) == pin["sha256"] else "CHANGED"
                files.append({"path": target, "sha256": sha(value), "expectedSHA256": pin["sha256"],
                              "bytes": len(value), "status": status})
            except FileNotFoundError:
                files.append({"path": target, "expectedSHA256": pin["sha256"], "status": "MISSING"})
        artifacts.append({"name": name, "files": files,
                          "rawPinsMatch": all(row["status"] == "UNCHANGED" for row in files),
                          "semanticValidation": "NOT_RUN", "action": "CHECK_REUSE_WITH_ORIGINAL_VALIDATOR"})
    report = {"schema": "LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1", "layoutSHA256": sha(capture.layout_bytes),
              "groups": groups, "artifacts": artifacts, "publicationChanged": False,
              "financialAcceptance": False, "compilationRequested": False}
    report["compilerDependencies"] = compiler_dependencies(capture, publication)
    report["currentSourceContract"] = current_source_contract(report, capture)
    return report, capture


def current_source_contract(report, capture):
    """Capture the current closure under its real names, separately from V5.

    Fixed published inventories determine the initial review scope. Explicit
    relocations select today's names; current ESM literal imports and public
    exports are followed. Historical inventories and mobile bundler dependencies
    remain explicit boundaries. A legacy entry that loads a generated
    module retains that generated identity instead of pretending it ran source.
    """
    from module_boundaries import imports as module_imports, TOKEN
    roots = {row["source"] for group in report["groups"] for row in group["files"]}
    # Fixed inventory inputs may still name an old reviewed owner. Publish its
    # current name in this contract; retain the old label only in the original
    # inventory report. Imports are checked below and cannot use this mapping
    # to keep executing a removed source.
    roots.update(capture.observe(path)["source"]
                 for path in {RELEASE, *CATALOGS.values(), *CURRENT_SOURCE_INPUTS})
    selected = {}
    expanded = set()
    external = set()
    resource_bindings = set()
    mobile_bindings = set()
    platform_bindings = set()
    imported_by = {}
    mobile_dependencies = json.loads(read("apps/mobile/package.json")).get("dependencies", {})
    platform_dependencies = json.loads(read("apps/platform/package.json")).get("dependencies", {})
    source_policy = json.loads(read("scripts/development/source-pins.json"), object_pairs_hook=unique_object)
    platform_policy = source_policy["profiles"]["platform"]
    reviewed_npm = ReviewedNativeWalletNpm(source_policy.get("nativeWalletNpm"), capture)
    roots.update(reviewed_npm.files)
    roots.update(reviewed_npm.manifests)
    npm_bindings = set()
    url_pattern = re.compile(r"\bnew\s+URL\s*\(\s*(['\"])([^'\"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)")
    def evidence_only(path):
        return (retained_source_evidence(path) or path.startswith(("experiments/", "packages/protocol/"))
                or path == "packages/crypto/src/component-tooling.mjs")
    queue = [(path, not evidence_only(path)) for path in sorted(roots)]
    while queue:
        path, follow = queue.pop()
        relative(path)
        if path in selected and (not follow or path in expanded):
            continue
        if len(selected) >= 8192:
            raise ValueError("Current source closure exceeded its fixed file bound")
        row = dict(capture.observe(path))
        if row["status"] != "PRESENT":
            raise ValueError("Current source dependency is missing: " + path)
        if row.get('runtimeDisposition') == 'RETIRED_PUBLICATION_LABEL':
            chain, parent = [], path
            while parent in imported_by and parent not in chain and len(chain) < 12:
                chain.append(parent)
                parent = imported_by[parent]
            raise ValueError('Current import names a retired runtime copy: ' + path
                             + ' imported through ' + ' <- '.join([*chain[1:], parent]))
        if path not in roots and row.get("sourceRelocation"):
            chain, parent = [], path
            while parent in imported_by and parent not in chain and len(chain) < 8:
                chain.append(parent)
                parent = imported_by[parent]
            raise ValueError("Current import still names a relocated source: " + path
                             + " imported through " + " <- ".join([*chain[1:], parent]))
        row.pop("runtimeMatchesSource", None)
        selected[path] = row
        # Public package manifests are included whether a module was reached
        # by a relative import, a package export or an original inventory root.
        parts = path.split("/")
        if parts[0] in {"apps", "packages"} and len(parts) > 2:
            manifest = "/".join(parts[:2]) + "/package.json"
            if physical(manifest).is_file():
                queue.append((manifest, False))
        if retained_source_evidence(row["source"]):
            row["sourceDisposition"] = "RETAINED_SOURCE_EVIDENCE"
        if not follow or retained_source_evidence(row["source"]) or not (path.endswith(".mjs")
                or path in reviewed_npm.files and path.endswith(".js")):
            continue
        expanded.add(path)
        content = capture.objects[row["sha256"]].decode("utf8")
        # createRequire bindings use their consumers' fixed resource roots and
        # retained manifests; do not pretend Node resolves them beside source.
        # Record these boundaries explicitly rather than silently accepting them
        # as part of the ESM closure or executing a fixture to discover them.
        tokens = [(match.lastgroup, match.group()) for match in TOKEN.finditer(content)
                  if match.lastgroup != "comment"]
        required = set()
        for i, (kind, word) in enumerate(tokens[:-3]):
            if kind == "word" and word == "require" and tokens[i+1][1] == "(" and tokens[i+2][0] == "string":
                required.add(tokens[i+2][1][1:-1])
        allowed_resources = {"ethers", "solc", "@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"}
        for name in required:
            if name.startswith("node:"):
                continue
            if name not in allowed_resources:
                raise ValueError("Undeclared fixed runtime package binding: " + name + " in " + path)
            resource_bindings.add((path, name))
        names = {(name, True) for name in set(module_imports(content)) - required}
        for match in url_pattern.finditer(content):
            value = match.group(2)
            if value.startswith("/") or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", value):
                raise ValueError("Current source URL must be local: " + value)
            names.add((value if value.startswith(".") else "./" + value, False))
        for name, code_import in sorted(names):
            if name.startswith("node:"):
                continue
            if name.startswith("."):
                target = posixpath.normpath(posixpath.join(posixpath.dirname(path), name))
                relative(target)
                if path in reviewed_npm.files and target not in reviewed_npm.files:
                    raise ValueError("Reviewed npm relative import escaped its inventory: " + target)
                imported_by[target] = path
                queue.append((target, code_import or not evidence_only(target)))
            elif name.startswith("@lianum/"):
                package = name.split("/")[1]
                target = capture.layout.get("_workspaceExports", {}).get(name)
                if not isinstance(target, str):
                    raise ValueError("Current dependency requires an explicit package export: " + name)
                queue.extend([("packages/" + package + "/package.json", False), (relative(target), True)])
            elif name in {"@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"}:
                # Their actual entrypoints/Wasm/toolchain and CRS are checked by
                # the original artifact inspector, never resolved from a caller.
                external.add(name)
            elif reviewed_npm.applies(path, name):
                package, target = reviewed_npm.resolve(path, name)
                imported_by[target] = path
                queue.append((target, True))
                npm_bindings.add((path, name, package["path"], package["version"]))
            elif name.startswith(("@noble/curves/", "@noble/hashes/")):
                target = "apps/mobile/node_modules/" + name
                if target not in roots:
                    raise ValueError("Current npm import is outside the pinned public inventory: " + name)
                queue.append((target, True))
            elif path.startswith("apps/platform/") and name == "pg" and name in platform_dependencies:
                # Platform's existing reviewed public inventory covers the CJS
                # dependency tree; do not treat arbitrary npm imports as code.
                package_path = "apps/platform/node_modules/pg/package.json"
                package = json.loads(read(package_path))
                locked = json.loads(read("apps/platform/package-lock.json"))["packages"]["node_modules/pg"]
                if package.get("name") != "pg" or package.get("version") != platform_dependencies[name] \
                        or locked.get("version") != package.get("version"):
                    raise ValueError("Platform PostgreSQL package differs from its exact manifest and lock")
                for dependency in platform_policy["dependencyPaths"]:
                    queue.append(("apps/platform/" + relative(dependency), False))
                queue.extend([("apps/platform/package.json", False),
                              ("apps/platform/package-lock.json", False),
                              (platform_policy["target"], False)])
                platform_bindings.add((path, name, package["version"]))
            elif path.startswith("apps/mobile/") and name in mobile_dependencies:
                # Native Expo/React packages are resolved by the mobile bundler,
                # whose package manifest/lock are byte-pinned and checked by
                # `sources prepare/verify`; they are not server ESM imports.
                mobile_bindings.add((path, name))
            else:
                raise ValueError("Current source dependency requires review: " + name + " in " + path)
    sources = [selected[path] for path in sorted(selected)]
    return {"schema": "LIANUM_CURRENT_SOURCE_CONTRACT_V2", "roots": sorted(roots), "files": sources,
            "scope": "Current ESM imports and fixed module URLs plus immutable publication inventories; TS/TSX are byte-pinned inventory entries, not a bundler dependency closure",
            "retainedEvidenceRoots": sorted(path for path in roots if evidence_only(path)),
            "sourceClosureSHA256": sha(encoded(sources)), "externallyValidatedPackages": sorted(external),
            "fixedRuntimeResourceBindings": [{"source": path, "specifier": name,
                "acceptance": "FIXED_CONSUMER_VALIDATION_REQUIRED"} for path, name in sorted(resource_bindings)],
            "mobileBundlerBindings": [{"source": path, "specifier": name,
                "acceptance": "MOBILE_BUNDLER_VALIDATION_REQUIRED"} for path, name in sorted(mobile_bindings)],
            "platformPackageBindings": [{"source": path, "specifier": name, "version": version,
                "inventory": platform_policy["target"],
                "acceptance": "EXACT_MANIFEST_LOCK_AND_REVIEWED_PUBLIC_FILES"}
                for path, name, version in sorted(platform_bindings)],
            "nativeWalletNpmBindings": [{"source": path, "specifier": name,
                "packagePath": package, "version": version,
                "acceptance": "EXACT_MANIFEST_LOCK_AND_REVIEWED_INSTALLED_FILES"}
                for path, name, package, version in sorted(npm_bindings)],
            "runtimeResourceAcceptanceEstablished": False,
            "historicalInventoriesModified": False, "financialAcceptance": False}

def compiler_dependencies(capture, publication):
    """New development boundary; original compilation receipts stay immutable.

    Follow the compilation entry, including public package export declarations.
    Shell/Python launchers are not compiler module imports. This slice plans work;
    semantic artifact authentication still belongs to the genuine inspector.
    """
    receipt_pin = publication["producedW39"]["files"]["source-pins.json"]
    try:
        original = read(label_path(receipt_pin["path"]))
    except FileNotFoundError:
        return {"status": "BLOCKED", "code": "ORIGINAL_COMPILER_RECEIPT_MISSING", "files": []}
    if sha(original) != receipt_pin["sha256"]:
        return {"status": "BLOCKED", "code": "ORIGINAL_COMPILER_RECEIPT_CHANGED", "files": []}
    historical = {label_path(row["path"]): row["sha256"] for row in json.loads(original)}
    selected = {}
    patterns = (
        r"\b(?:import|export)\s+(?:[^;'\"\n]*?\s+from\s*)?(['\"])([^'\"]+)\1",
        r"^\s*(?:import|export)\s+(?:[^;'\"]*?\s+from\s*)?(['\"])([^'\"]+)\1",
        r"\bimport\s*\(\s*(['\"])([^'\"]+)\1\s*\)",
        r"\bnew\s+URL\s*\(\s*(['\"])([^'\"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)",
    )

    def visit(source):
        relative(source)
        if source in selected:
            return
        target = None if Path(source).name in {"package.json", "package-lock.json"} else map_path(source, capture.layout, "runtime")
        target = RUNTIME + target if target is not None else source
        row = capture.compare(target, historical.get(target))
        if row["status"] == "CHANGED" and target not in historical:
            row["status"] = "ADDED"
        selected[source] = row
        if row["status"] == "MISSING" or not source.endswith(".mjs"):
            return
        text = read(source).decode()
        imports = {match.group(2) for pattern in patterns for match in re.finditer(pattern, text, re.M)}
        for name in sorted(imports):
            if name.startswith("node:") or name in ("@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"):
                continue
            if name.startswith("."):
                visit(posixpath.normpath(posixpath.join(posixpath.dirname(source), name)))
            elif name.startswith("@lianum/"):
                package, _, _ = name[len("@lianum/"):].partition("/")
                manifest = "packages/" + package + "/package.json"
                visit(manifest)
                value = capture.layout.get("_workspaceExports", {}).get(name)
                if not isinstance(value, str):
                    raise ValueError("Compiler dependency requires an explicit public export: " + name)
                visit(relative(value))
            else:
                raise ValueError("Compiler dependency requires review: " + name)

    try:
        visit("scripts/wallet/preparation/prepare-development-native-value-w39-v5.mjs")
    except (OSError, ValueError) as error:
        return {"status": "BLOCKED", "code": str(error), "files": list(selected.values())}
    changed = any(row["status"] != "UNCHANGED" for row in selected.values())
    return {"status": "REVIEW_REQUIRED" if changed else "UNCHANGED", "entry": "scripts/wallet/preparation/prepare-development-native-value-w39-v5.mjs",
            "scope": "Static compiler module dependencies; raw compiler packages, circuits, CRS and artifact semantics remain separately validated",
            "originalSourcePinsSHA256": receipt_pin["sha256"], "files": [selected[name] for name in sorted(selected)],
            "historicalReceiptModified": False}


def summary(report):
    lines = []
    for group in report["groups"]:
        changed = sum(row["status"] == "CHANGED" for row in group["files"])
        missing = sum(row["status"] == "MISSING" for row in group["files"])
        stale = sum(row.get("runtimeMatchesSource") is False for row in group["files"])
        lines.append(f"{group['name']}: {changed} changed, {missing} missing, {stale} stale runtime copies")
    for group in report["artifacts"]:
        lines.append(f"{group['name']}: " + ("published artifact bytes intact" if group["rawPinsMatch"] else "missing or changed artifacts"))
    compiler = report.get("compilerDependencies")
    if compiler:
        lines.append(f"compiler dependencies: {compiler['status']} ({len(compiler['files'])} files)")
    return "\n".join(lines)


def create_once(path, value):
    """Atomic immutable file; an existing object must have exactly these bytes."""
    physical(path.relative_to(ROOT).as_posix())
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        if read(path.relative_to(ROOT).as_posix()) != value:
            raise ValueError("Existing generation/object was modified: " + str(path))
        return False
    with tempfile.NamedTemporaryFile(prefix=".prepare-", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
            os.link(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    return True


def inspect_candidate():
    node = ROOT / ".internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node"
    if not node.is_file():
        return {"status": "BLOCKED", "code": "PINNED_NODE_MISSING"}
    env = dict(os.environ)
    env.pop("NODE_OPTIONS", None)
    env.pop("NODE_PATH", None)
    try:
        result = subprocess.run([str(node), "--max-old-space-size=384", str(ROOT / "scripts/development/source-generation-inspect.mjs")],
            cwd=ROOT, env=env, capture_output=True, timeout=45, check=False)
    except subprocess.TimeoutExpired:
        return {"status": "BLOCKED", "code": "INSPECTION_TIME_LIMIT_45_SECONDS"}
    if result.returncode or len(result.stdout) > 8 * 1024 * 1024:
        return {"status": "BLOCKED", "code": "INSPECTION_PROCESS_FAILED"}
    return json.loads(result.stdout)


def current_runtime_matches(identity):
    if any(row.get("runtimeMatchesSource") is False for group in identity["groups"] for row in group["files"]):
        return False
    for row in identity["currentSourceContract"]["files"]:
        if row["path"].startswith(RUNTIME):
            try:
                if sha(read(row["path"])) != row["sha256"]:
                    return False
            except FileNotFoundError:
                return False
    return True


def retained_compiler_files(inspection):
    """Byte evidence authenticated by the fixed inspectors, never executable roots."""
    paged = inspection["paged"]
    result = [dict(row, source=row.get("source", row["path"]))
              for row in [*paged.get("compilerInputs", []), *paged.get("hostSources", [])]]
    archive_roots = {"candidate": "omnichain-flat-profile/candidate-poseidon",
                     "flat-reference": "omnichain-flat-profile", "golden": "omnichain-product"}
    for row in inspection["nativeValue"]["nodeReuseReceipt"].get("compilerSources", []):
        source = "archive/delivery/source-snapshot/" + archive_roots[row["root"]] + "/" + relative(row["path"])
        result.append(dict(row, source=source))
    return result


def prepare(report, capture):
    if any(row["status"] == "MISSING" for group in report["groups"] for row in group["files"]):
        raise ValueError("Restore missing source files before preparing a complete generation")
    directory = physical(".local/generations")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = physical(".local/generations/.prepare.lock")
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        fresh, _ = inventory()
        if fresh != report:
            raise ValueError("Source/artifact files changed while preparing; retry after edits finish")
        stale = (any(row.get("runtimeMatchesSource") is False for group in report["groups"] for row in group["files"])
                 or not current_runtime_matches(report))
        inspection = ({"status": "BLOCKED", "code": "LEGACY_RUNTIME_STALE", "next": "./dev sources prepare"}
                      if stale else inspect_candidate())
        if inspection.get("status") == "VERIFIED_RETAINED_ARTIFACTS":
            for row in retained_compiler_files(inspection):
                value = read(row["source"])
                if sha(value) != row["sha256"] or len(value) != row["bytes"]:
                    raise ValueError("Retained compiler evidence changed after inspection: " + row["source"])
                capture.objects[row["sha256"]] = value
        final, _ = inventory()
        if final != report:
            raise ValueError("Source/artifact files changed during inspection; candidate discarded")
        if not stale and not current_runtime_matches(report):
            raise ValueError("Generated executable changed during inspection; candidate discarded")
        # Source identity deliberately excludes runtime freshness: copying the
        # same sources cannot produce another development generation.
        identity = source_identity(report)
        generation = sha(encoded(identity))
        target = directory / generation
        objects = directory / "objects"
        created = 0
        for digest, value in capture.objects.items():
            created += create_once(objects / digest, value)
        manifest = target / "sources.json"
        new_generation = create_once(manifest, encoded(identity))
        # Separate inspection records are themselves addressed by content. A
        # retry after installing prerequisites cannot overwrite earlier evidence.
        inspection_bytes = encoded(inspection)
        create_once(target / ("inspection-" + sha(inspection_bytes) + ".json"), inspection_bytes)
        validated = inspection.get("status") == "VERIFIED_RETAINED_ARTIFACTS"
        if validated:
            candidate = source_candidate(identity, generation, inspection)
            create_once(target / "candidate-release.json", encoded(candidate))
            create_once(target / "reuse-receipt.json", encoded(candidate["reuseReceipt"]))
        return {"generation": str(target.relative_to(ROOT)), "reusedGeneration": not new_generation,
                "newSourceObjects": created, "sourceObjectBytes": sum(map(len, capture.objects.values())),
                "inspection": "VALIDATED_CANDIDATE" if validated else inspection.get("status"), "code": inspection.get("code"),
                "currentSources": len(identity.get("currentSourceContract", {}).get("files", [])),
                "verifiedArtifactRoles": inspection.get("nativeValue", {}).get("verifierRoles", []) if inspection.get("nativeValue") else [],
                "verifiedPagedArtifactRoles": list(inspection.get("paged", {}).get("roles", {})) if inspection.get("paged") else [],
                "sourceAcceptance": "PREPARED_FOR_REVIEW" if validated else "BLOCKED",
                "readback": "./dev sources verify --generation " + generation,
                "published": False, "compiled": False, "financialAcceptance": False}



def source_candidate(identity, generation, inspection):
    """A new source contract; never a V5 publication with substituted paths."""
    if (inspection.get("status") != "VERIFIED_RETAINED_ARTIFACTS"
            or inspection.get("published") is not False or inspection.get("compiled") is not False
            or inspection.get("financialAcceptance") is not False):
        raise ValueError("Retained artifact inspection did not authenticate a preparation candidate")
    native = inspection.get("nativeValue") or {}
    paged = inspection.get("paged") or {}
    if (native.get("artifactBundleIssued") is not False
            or native.get("reuseReceipt", {}).get("schema") != "LIANUM_W39_EXACT_PUBLISHED_REUSE_V6"
            or native.get("nodeReuseReceipt", {}).get("schema") != "RETAINED_NODE_COMPILER_REUSE_V1"
            or paged.get("schema") != "LIANUM_PAGED_EXACT_RETAINED_REUSE_V4"
            or paged.get("artifactBundleIssued") is not False):
        raise ValueError("Complete original W39, N32 and paged reuse receipts are required")
    contract = identity["currentSourceContract"]
    if contract["sourceClosureSHA256"] != sha(encoded(contract["files"])):
        raise ValueError("Current source contract digest does not match its files")
    return {"schema": "LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V7", "sourceGeneration": generation,
            "currentSourceClosureSHA256": contract["sourceClosureSHA256"],
            "priorPublications": [{"path": group["manifest"], "sha256": group["manifestSHA256"]}
                                  for group in identity["groups"]],
            "artifactInspection": inspection, "reuseReceipt": native["reuseReceipt"],
            "nodeReuseReceipt": native["nodeReuseReceipt"], "pagedReuseReceipt": paged,
            "verifiedArtifactRoles": native["verifierRoles"],
            "sourceAcceptance": "PREPARED_FOR_REVIEW", "published": False, "compiledNow": False,
            "artifactBundleIssued": False, "financialAcceptance": False}


def source_identity(report):
    identity = json.loads(json.dumps(report))
    for group in identity["groups"]:
        for row in group["files"]:
            row.pop("runtimeMatchesSource", None)
    for row in identity.get("compilerDependencies", {}).get("files", []):
        row.pop("runtimeMatchesSource", None)
    return identity


def verify_generation(generation):
    """Read back the source candidate against immutable objects and actual files.

    This consumes only the preparation contract. Financial loaders still require
    their own published release and process-local capabilities.
    """
    if not isinstance(generation, str) or not re.fullmatch(r"[0-9a-f]{64}", generation):
        raise ValueError("Expected the exact source-generation digest")
    base = ".local/generations/" + generation
    raw = read(base + "/sources.json")
    identity = json.loads(raw)
    if raw != encoded(identity) or sha(raw) != generation:
        raise ValueError("Source generation identity was modified")
    candidate_raw = read(base + "/candidate-release.json")
    candidate = json.loads(candidate_raw)
    expected = source_candidate(identity, generation, candidate["artifactInspection"])
    if candidate_raw != encoded(expected):
        raise ValueError("Source candidate metadata was modified")
    inspection_bytes = encoded(candidate["artifactInspection"])
    if read(base + "/inspection-" + sha(inspection_bytes) + ".json") != inspection_bytes:
        raise ValueError("Source candidate inspection record was modified")
    if read(base + "/reuse-receipt.json") != encoded(candidate["reuseReceipt"]):
        raise ValueError("Source candidate reuse receipt was modified")
    digests = set()
    rows = [row for group in identity["groups"] for row in group["files"]]
    rows += identity.get("compilerDependencies", {}).get("files", [])
    rows += identity["currentSourceContract"]["files"]
    rows += retained_compiler_files(candidate["artifactInspection"])
    for row in rows:
        digests.update(row[key] for key in ("sourceSHA256", "sha256") if key in row)
    for digest in sorted(digests):
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or sha(read(".local/generations/objects/" + digest)) != digest:
            raise ValueError("Source generation object was modified")
    fresh, _ = inventory()
    if source_identity(fresh) != identity:
        raise ValueError("Current sources, exports, relocation rules or original publications differ from the candidate")
    if not current_runtime_matches(fresh):
        raise ValueError("Generated executable differs from the source candidate")
    inspection = inspect_candidate()
    final, _ = inventory()
    if source_identity(final) != identity:
        raise ValueError("Source candidate changed during readback inspection")
    if not current_runtime_matches(final):
        raise ValueError("Generated executable changed during readback inspection")
    if encoded(source_candidate(identity, generation, inspection)) != candidate_raw:
        raise ValueError("Retained artifact inspection differs from the candidate")
    return {"generation": base, "verification": "READBACK_VERIFIED", "inspection": "VALIDATED_CANDIDATE",
            "currentSources": len(identity["currentSourceContract"]["files"]),
            "verifiedArtifactRoles": candidate["verifiedArtifactRoles"],
            "verifiedPagedArtifactRoles": list(candidate["pagedReuseReceipt"]["roles"]),
            "sourceAcceptance": "PREPARED_FOR_REVIEW", "published": False, "compiled": False,
            "artifactBundleIssued": False, "financialAcceptance": False}


def adopt_generation(generation):
    """Select verified current host sources; original artifact pins stay separate."""
    result = verify_generation(generation)
    candidate = read(".local/generations/" + generation + "/candidate-release.json")
    record = {"schema": "LIANUM_ADOPTED_SOURCE_GENERATION_V1", "generation": generation,
              "candidateSHA256": sha(candidate)}
    target = ROOT / "scripts/development/adopted-generation.json"
    value = encoded(record)
    if target.exists() and read("scripts/development/adopted-generation.json") == value:
        return result | {"sourceAcceptance": "ADOPTED_CURRENT_HOST_SOURCES", "written": []}
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".source-adoption-", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return result | {"sourceAcceptance": "ADOPTED_CURRENT_HOST_SOURCES",
                     "written": ["scripts/development/adopted-generation.json"]}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("status", "check", "prepare", "verify", "adopt"), default="status")
    parser.add_argument("--json", action="store_true", help="Return machine-readable details")
    parser.add_argument("--generation", help="Exact digest for a read-only candidate verification")
    parser.add_argument("--adopt", dest="adopt_prepared", action="store_true",
                        help="After preparation, verify and adopt this exact current host candidate")
    args = parser.parse_args()
    if args.adopt_prepared and args.action != "prepare":
        parser.error("--adopt is only valid with sources prepare")
    if args.action in {"prepare", "verify", "adopt"}:
        # The native producer already depends on these mobile packages. Do not
        # require the separate Cloud installation or approve hashes implicitly.
        try:
            pins = check_current_pins("check", "mobile", ROOT)
        except (ValueError, OSError, KeyError, TypeError, IndexError) as error:
            pins = {"status": "BLOCKED", "error": str(error)}
        if pins["status"] != "CURRENT":
            result = {"inspection": "BLOCKED", "code": "CURRENT_MOBILE_PINS_" + pins["status"],
                      "next": "./dev pins check --profile mobile --json", "pins": pins,
                      "published": False, "compiled": False, "financialAcceptance": False}
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                print("Source preparation blocked: " + result["code"])
                print(pins.get("error", "Current mobile manifests differ from the reviewed pin table."))
                print("Inspect: " + result["next"])
                if pins["status"] == "STALE":
                    print("After reviewing that diff: ./dev pins update --profile mobile")
            return 2
    if args.action in {"verify", "adopt"}:
        result = adopt_generation(args.generation) if args.action == "adopt" else verify_generation(args.generation)
        print(json.dumps(result, indent=2) if args.json else result["sourceAcceptance"] + ": " + result["generation"])
        return 0
    if args.generation is not None:
        raise ValueError("--generation is only valid with sources verify/adopt")
    if args.action == "prepare":
        # Explicit preparation is the only action that updates compatibility
        # copies. The content-aware builder never compiles circuits or starts a
        # laboratory, and status/check remain entirely read-only.
        workspace_build(quiet=True)
    report, capture = inventory()
    result = prepare(report, capture) if args.action == "prepare" else report
    if args.adopt_prepared and result["inspection"] == "VALIDATED_CANDIDATE":
        # Adoption rechecks the exact prepared digest and atomically writes only
        # the host selection. Concurrent changes still fail before that write.
        result["adoption"] = adopt_generation(Path(result["generation"]).name)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(summary(report))
        if args.action == "prepare":
            print(f"Generation: {result['generation']} ({result['newSourceObjects']} new source objects)")
            print(f"Artifact reuse inspection: {result['inspection']}" + (f" — {result['code']}" if result['code'] else ""))
            print("Prepared for review; the published release and financial acceptance are unchanged.")
            if args.adopt_prepared and "adoption" in result:
                adopted = result["adoption"]
                print(adopted["sourceAcceptance"] + ": " + adopted["generation"])
    if args.action == "check":
        return int(any(row["status"] != "UNCHANGED" or row.get("runtimeMatchesSource") is False
                       for group in report["groups"] + report["artifacts"] for row in group["files"]))
    if args.action == "prepare":
        return 0 if result["inspection"] == "VALIDATED_CANDIDATE" else 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print("Source preparation failed: " + str(error), file=sys.stderr)
        sys.exit(1)
