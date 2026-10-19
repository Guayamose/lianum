# Lianum mobile wallet

The React Native/Expo application brings the native wallet, PAEG plan review, private-account recovery and persistent agent into one interface. The delivery UI is English, including biometric prompts, validation messages and financial review labels.

## Product paths

- **Home:** total observed value, available/reserved amounts, asset allocation and active operations. Unknown amounts remain unknown.
- **Wallet:** native Ethereum, Bitcoin and Solana accounts, receiving addresses, reviewed transfers and recovery words.
- **Agent:** persistent conversation, streamed responses, proposals, explicit preferences, followups, voice and notification settings.
- **Operations and approvals:** inspect pending work, review concrete financial terms and reconcile the original operation after a lost response.
- **Investments:** supported private/DeFi connection and position flows, with network and custody context kept explicit.
- **Security and recovery:** device authentication, session locking, encrypted private-account backups and advanced connection tools.

Mainnet and Testnet are separate environments. The financial acceptance recorded for this delivery is on testnets and local laboratories; an available mainnet profile is not a production acceptance claim for every route.

## Prepare and run

From the repository root:

```sh
./dev prepare host
./dev prepare mobile
./dev npm --prefix apps/mobile run typecheck
./dev npm --prefix apps/mobile start
```

Use the pinned dependencies and the existing lockfile. Native modules, biometric storage and WebRTC require a development build or standalone APK; a generic browser preview does not validate them. Public network configuration lives in [`src/native-wallet/native-wallet-public-configuration-v1.ts`](src/native-wallet/native-wallet-public-configuration-v1.ts). Follow [device setup](../../docs/USB-MOBILE.md) for ADB and connection details.

## Build a standalone local APK

```sh
./dev node apps/mobile/scripts/build-android-debug.mjs --preflight
./dev node apps/mobile/scripts/build-android-debug.mjs --standalone-local
```

The checked build script requires the declared Android SDK/NDK, Java and resource limits. The resulting local release-variant APK includes its JavaScript bundle and does not need Metro. This is a local test artifact, not a production-signed store release. Android build output is under `android/app/build/outputs/apk/` and remains outside Git.

Firebase client configuration is supplied locally at `.local/firebase/google-services.json` when building notification support. Server credentials and OpenAI keys never belong in the APK. Configuration examples document the intended inputs without committing secrets.

## Verify a change

```sh
./dev test --component mobile
./dev npm --prefix apps/mobile run typecheck
./dev check
```

Choose additional focused tests for the affected behavior. A copy or layout change does not require restarting the financial engine. A successful build does not replace physical checks of biometric access, native back navigation, voice, notifications or financial approval.

## Important source boundaries

| Directory | Responsibility |
| --- | --- |
| `src/screens`, `src/components`, `src/design` | UI, navigation, presentation and accessible motion |
| `src/agent` | Conversation, streaming, context, voice and notifications |
| `src/custody` | Protected local identities, notes and recovery |
| `src/api` | Typed/signed requests and preparation boundaries |
| `src/native-wallet` | Native account and transfer orchestration |
| `src/portfolio`, `src/state` | Observed balances, valuation and recoverable UI state |
| `tests` | Focused host regressions; not a blanket phone-acceptance claim |

The full [implementation record](../../docs/reference/mobile/implementation-record.md) preserves detailed authorization, custody, recovery and generation notes from the earlier guide. The [architecture](../../docs/ARCHITECTURE.md), [API reference](../../docs/reference/product-api.md) and [validation record](../../docs/VALIDATION.md) provide the current cross-service explanation.
