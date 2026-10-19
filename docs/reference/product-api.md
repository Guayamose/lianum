# Product API and SDK

This reference describes the implemented wallet and financial contracts. Versioned DTO names do not imply a new URL with the same version suffix. For the conversational service's separate chat, streaming, voice, memory and notification API, see [the agent service](../../services/agent/README.md).

## SDK entry points

`@lianum/sdk/agent`, `@lianum/sdk/agent/operation`, `@lianum/sdk/agent/preparation` and `@lianum/sdk/contracts` expose the existing proposal and read implementations. They depend on protocol/cryptography, not `apps/mobile`. Older mobile paths re-export the same instance so private SDK brands retain their identity. The SDK is a private workspace package, not a published universal financial SDK.

```js
import {createDevicePagedAgentNativeProposalV4, createDevicePagedAgentApiV4}
  from '@lianum/sdk/agent';
import {createDevicePagedAgentProposalLinkV4} from '@lianum/sdk/agent/operation';

// The agent owns agentKey; the wallet shared the authenticated descriptor.
const proposal = createDevicePagedAgentNativeProposalV4(agentKey, descriptor, terms, nodes);
const link = createDevicePagedAgentProposalLinkV4(proposal);
// Receiving this link neither starts nor authorizes a payment.

// After approval, the wallet shares a finite readerGrant.
// pinnedFetch verifies the original endpoint certificate.
const reader = createDevicePagedAgentApiV4({descriptor, agentKey, grant: readerGrant, fetchImpl: pinnedFetch});
try { const progress = await reader.observe(); } finally { reader.close(); }
```

Wallet DTOs describe routes; importing them does not grant an agent wallet permissions. `@lianum/engine/api/sdk` explicitly declares **SIMULATION_ONLY** and is not the entry point for real financial submission.

## Roles and authority

| Role | Capabilities | Authority |
| --- | --- | --- |
| User wallet | Read, prepare, review, sign exact terms and recover its operation | Original device custody and signed recipient, amount, deadline and budget limits |
| External agent | Sign a data proposal and observe approved progress | Its own key plus a wallet-signed read grant |
| Remote engine | Continue an approved graph and check results | Original START_AUTOMATION and its limits |
| Future MoonPay integration | Checkout, eligibility and provider status | Merchant configuration and verified webhooks; separate on-chain confirmation |

Personal wallet keys stay on the phone. The external SDK does not import mobile custody or accept generic callbacks that mint spending authority. The agent key signs proposals and proof of possession for its read grant. Agent `revoke()` revokes **reading**; stopping a graph requires the owner's existing STOP_AUTOMATION path.

## Authentication and transport

1. **Public wallet API:** HTTPS, `POST /v1/auth/challenge`, exact body `{origin,path,bodySHA256,devicePublicKey}`. The next request carries `{challenge,signature,body}`, where `body` is the exact JSON string whose hash was signed. The one-use challenge lasts 60 seconds and binds origin, route, body and identity.
2. **Paired engine:** the descriptor fixes identity, genesis, expiry, pairing and certificate. A proposal cannot replace the endpoint, certificate or pairing. Graph/agent requests use `x-lianum-paged-pairing-id`; DeFi uses `x-lianum-defi-pairing-id`.
3. **Private graph commands:** the signed challenge binds action, graphId, jobId, rootId, revision, command hash and reply recipient. Commands and private responses use the existing encrypted transport. Copying JSON does not restore an original SDK object's capabilities.
4. **External observation:** a wallet-signed V4/V5 grant plus a 15-second proof of possession signed by the agent key. The transport verifies the original certificate. Wallet keys are never shared.

Sources: `packages/crypto/src/native-wallet-auth-v1.mjs`, `packages/backend/src/public-wallet/http-service-v1.mjs`, `apps/mobile/src/api/device-paged-graph-api-v3.mjs`, `packages/backend/src/api/mobile/device-paged-agent-read-v4.mjs`.

## Routes

Paths abbreviated after the first entry in a row use that row's prefix.

| Group | Routes | Consumer |
| --- | --- | --- |
| Service | GET `/health`, GET `/v1/fiat/capabilities` | Limited public reads |
| Discovery | POST `/v1/wallet/connections` | Authenticated wallet; returns profiles for that identity |
| Native wallet | POST `/v1/native/account`, `/prepare`, `/submit`, `/status`, `/cancel` | Authenticated wallet; submission requires a locally signed transaction |
| Graph | POST `/v1/mobile/paged-owner/graph/pairing`, `/challenges`, `/operations` | Original paired wallet |
| Financial agent reader | POST `/v1/mobile/paged-owner/agent/challenges`, `/observations`, `/revocations` | Agent with a read grant |
| Private Uniswap output | POST `/v1/mobile/external-flat-share/challenges`, `/status`; the original active listener accepts `/operations` only for OBSERVE_D27 | Paired wallet; captured recovery exposes challenges/status only |
| DeFi | POST `/v1/mobile/sepolia-defi-shares/challenges`, `/defi-proposals`, `/defi-reviews`, `/defi-read-review`, `/defi-authorizations`, `/reviews`, `/private-operations`, `/operations`, `/status` | Original DeFi wallet; proposals need signed ACCESS |
| Financial DeFi | Same prefix plus `/financial-submit`, `/financial-observe`, `/withdrawal-review`, `/withdrawal-arm`, `/redeem-submit` | Reviewed wallet/job and original server continuation |
| Fiat/MoonPay scaffolding | POST `/v1/fiat/sessions`, `/v1/fiat/orders/read`, `/v1/fiat/orders/reconcile`, `/v1/fiat/moonpay/webhook` | Authenticated wallet, except the raw provider-signed webhook |

The internal MoonPay dispatcher contains `GET /v1/fiat/orders/:id`; the current public server accepts POST for order reads. Use `/v1/fiat/orders/read`, not that internal GET as a published contract.

Route owners: `packages/backend/src/public-wallet/http-service-v1.mjs`, `packages/backend/src/api/mobile/device-paged-agent-transport-v4.mjs`, `packages/backend/src/accounts/authority/device-sepolia-defi-shares-http-v4.mjs`, `packages/backend/src/accounts/authority/device-sepolia-defi-financial-http-v8.mjs`, `packages/backend/src/fiat/moonpay-http-v1.mjs`.

## A native transfer

1. `/native/account` takes a validated public wallet account and returns observed balance, available/reserved amounts and the network block.
2. `/native/prepare` takes `{operationId?,account,recipient,amountAtomic}` and returns an exact quote with a maximum fee and 120-second expiry. Retain the operation UUID before requesting it.
3. The wallet displays the terms and signs with its real custody.
4. `/native/submit` takes `{quoteId,rawTransaction}`. The server persists the bytes and hash before broadcasting. Repeating identical bytes observes the original; different bytes for that quote are rejected.
5. `/native/status` takes `{id}`, accepting the retained operation identifier or hash. `/native/cancel` cancels only an unsigned quote.

API states are PREPARED, EXPIRED, SUBMITTED, UNKNOWN, CONFIRMED, FINALIZED and FAILED. `terminal` identifies a definitive observation. Internal CANCELLED projects to FAILED with its cancellation code. The UI's smaller projection does not replace these API states. Source: `packages/backend/src/native-wallet/index.mjs`.

## A private plan and its agent

The flow is: signed data proposal → local preparation and real quote → original economic review → user authorization → SIGN_GRAPH → START_AUTOMATION → server execution, payment and observation → result or original recovery. BEGIN/PREPARE/APPEND/SEAL do not authorize spending.

The V4 wire proposal supports `ethereum-sepolia`, `bitcoin-testnet` and `solana-devnet`, up to 256 ordered nodes whose dependencies refer to earlier nodes. Each node fixes its recipient, delivered asset amount and agreed provider payout. The deployed conversational tool applies a smaller bounded proposal profile; the wire maximum is not a promise of unlimited agent execution.

The server obtains the quote and the user reviews the full budget, deadlines, destinations, amounts, dependencies and quotes. Settlement pays the provider under the original terms. Confirmed delivery on another chain is not reversible; the note budget and delivered asset must not be added as if they were one unit.

The read grant binds descriptor, graphId, rootId, revision and automation terms. Changing those terms requires another review/authorization. The agent cannot append payments to an already approved operation.

Graph commands include BEGIN_GRAPH, PREPARE_NATIVE_PAGE, APPEND_PAGE, SEAL_GRAPH, SIGN_GRAPH, OBSERVE_GRAPH, START_AUTOMATION, STOP_AUTOMATION and original proof/reservation/recovery/economic-read commands. The external SDK does not expose an arbitrary wallet-impersonating `submit(action, arbitraryBody)`.

External progress includes PREPARED, RESERVED, FULFILLED, RECOVERED, `pending`, automation and completed/total steps. It neither returns every receipt nor grants recovery authority. `snapshot()` is historical data with computed `current` and `financialPermission:false`; saving it does not renew its validity. An expired read or transport error does not mean the operation failed.

The wallet saves its signed source association **before BEGIN**. On reopening it compares proposal, root/revision and original pages, observes the server and continues the cursor. A lost BEGIN/APPEND/SEAL response does not create another operation. START is not automatically signed again. Original observation and review remain required; a public record cannot restore keys or permissions. Host orchestration tests retain their stated scope rather than becoming public-network acceptance.

Sources: `packages/mobile-protocol/src/device-paged-agent-v4.mjs`, `apps/mobile/src/api/device-paged-agent-owner-v4.ts`, `apps/mobile/src/api/device-paged-agent-ui-controller-v4.ts`.

## Uniswap

The existing route does not introduce a generic `/swap` endpoint. The wallet receives `nativePreparation.uniswap` from its original pairing, prepares D27 reception under its custody and creates `UNISWAP_V3_EXACT_OUTPUT_SINGLE`. That intent binds job, root, output commitment, maximum input, output amount, validity window and, in the public version, recipient.

Approval/execution follow the original graph. A completed dependency does not grant spending authority over the received ERC20 note. The original helper requires retaining and verifying the reception's recovery backup before completing its node.

Active and captured-recovery listeners have different surfaces. A local helper's preparation routes are not automatically public endpoints; the deployed profile determines the available path. Uniswap's Source4 remains separate from Source7 for Aave/Morpho. A shared user identity does not merge pools, roots, assets or balances. Native V4 agent proposals do not describe swaps; that extension needs its own reviewed schema.

Sources: `apps/mobile/src/api/device-paged-uniswap-preparation-v3.ts`, `packages/mobile-protocol/src/device-paged-uniswap-public-v4.d.mts`, `packages/backend/src/operations/local/funded-graph-paged-device-graph-operator-v3.mjs`, `packages/backend/src/api/mobile/device-paged-uniswap-flat-read-http-v8.mjs`.

## Aave and Morpho

1. The wallet prepares its Source7 page and retains `receiptSecret` locally.
2. `defi-proposals` takes ACCESS plus protocol, action, share-note rootId/revision, sharesAtomic, maximum/minimum, recipients and `receiptCommitment`. INVEST requires a nonzero commitment; REDEEM requires null.
3. The server reads the actual protocol, fixes the window/quote and returns `{review}`. A quote invented by the phone or agent is rejected.
4. The wallet binds review, D27 proof and private reception. Preparing INVEST does not by itself authorize a spend.
5. `financial-submit` records `{access,signature,reference,jobId,capitalNodeId}` for the same job. Source7 binds the reservation and ETH budget to share reception; the user approves final economic terms through the graph path.
6. The server executes the approved investment, checks its canonical receipt and settles under the approved terms. `financial-observe` reads the same job. PROVED/PREPARED is not confirmed investment.
7. REDEEM uses explicit review: W39 proof → `withdrawal-review` returns `{consent}` → signature → fresh ACCESS → `withdrawal-arm` → `redeem-submit`. It may return pending WITHDRAW while the worker continues the same review within its limits. Observation requires no additional fingerprint.

The exact V7 financial response fields are `jobId`, `reference`, `phase`, `transactionHash`, `canonical`, `protocol`, `kind`. `phase` is PREPARED, SUBMITTED, UNKNOWN or CONFIRMED; `kind` is INVEST, WITHDRAW or REDEEM. A confirmed share withdrawal is not yet received USDC: REDEEM must be confirmed. Adding fields requires a versioned contract.

The Source7 ETH budget and share note have **different roots and revisions**, joined through committed delivery and original permissions. Aave and Morpho USDC on Sepolia are distinguished by asset address/identity. Demo ETH compensation is an agreed price, not an FX rate.

Demo proposal limits: maximum 10 USDC input, 10 Aave shares at six decimals or 10 Morpho shares at eighteen decimals, configured maximum margin 1%, and maximum window 900 seconds within the original caps/expiries. These are not promised mainnet limits. The current D27 account is not an unlimited reusable investment account.

V4 agent proposals support native payments, not these DeFi actions. Extension requires a versioned signed DTO and original review; it cannot disguise DeFi as a `networkId` or arbitrary native transfer.

Sources: `apps/mobile/src/api/device-sepolia-defi-paeg-investment-v8.ts`, `apps/mobile/src/api/device-sepolia-defi-financial-api-v7.mjs`, `packages/backend/src/accounts/authority/device-sepolia-defi-proposals-v8.mjs`, `packages/mobile-protocol/src/device-sepolia-defi-financial-status-v7.mjs`.

## Idempotency and lost responses

| Action | Retained identity | Recovery after a lost response |
| --- | --- | --- |
| Native quote | operationId/quoteId and exact terms | Read/recover that quote; changed terms do not reuse the ID |
| Native submission | quoteId, signed bytes and hash | Read `/native/status`; do not create another signature/transaction |
| Graph preparation | descriptor, graphId, rootId/revision, jobs/local cursor | Observe the original graph and continue it; no new BEGIN |
| START | Original automation and grant saved before sending | Read back START; never automatically sign it again |
| DeFi investment | reference, jobId, capitalNodeId and reception commitment | Observe the job; explicit continuation needs a fresh original observation |
| W39/redeem | reference, jobId, proof, consent and hash | Observe that withdrawal; do not change its receiver or repeat with a new job |
| Fiat session | Owner, requestId and normalized terms | Recover the same session; a different body with the same ID conflicts |
| Agent observation | grantId, read counter and one-use challenge | Request another read challenge within quota/deadline; never repeat financial effects |

There is no universal `Idempotency-Key` header or generic `/operations/:id` for every product. Each route preserves its own original identifiers.

Client deadlines: public API 20 seconds; challenge/graph preparation, signature and START 15 seconds; ZK proofs 900 seconds; EXECUTE_NATIVE/economic reads 60 seconds; financial DeFi 30 seconds. Prepare expensive work before issuing the short PoP, and before returning PROVED where applicable. A timeout is not authorization to extend permissions or resend. There is no general automatic write retry. A new read uses a fresh request and read permission, respects quotas and does not retain an expired signature.

External reader limits: up to 4,096 reads per signed V4/V5 grant; 16 retained grants per channel; 32 pending challenges; 8,192-byte standard bodies; 256 KiB observation responses; 32 KiB challenges/revocations. A V5 plan may contain 256 payouts. Its challenge retains the complete grant and requires a compatible transport limit; terms must not be removed to fit the older 8,192-byte limit. Wire proposals allow 256 nodes, with pages of 64.

Public API limits are 16 concurrent requests globally, eight per client, 120 requests/60 seconds and 60 challenges/60 seconds per client. These are demo controls, not an SLA or unlimited multitenant capacity. Graph HTTP errors currently reduce to SERVICE_UNAVAILABLE in the SDK; DeFi preserves six public proposal/capital codes. A richer BUSY/retryAfter/failed taxonomy requires compatible or versioned changes. The client retains the job and represents an unconfirmed response honestly.

## Executor payout: V5 consent

New graphs use V5 only when the authenticated pairing advertises `nativePreparation.executorPayoutsV5:true`. The seed retains that choice; reopening an older graph does not upgrade it. Preparation uses the encrypted `PREPARE_EXECUTOR_PAYOUTS_V5` channel, then `PREPARE_NATIVE_PAGE`.

The provider holds an independent key for each output and returns a certificate signed by both its identity and that note key. The phone checks both signatures, origin, commitment, nullifier, graph, amount and deadlines. It does not receive the payout private key.

After the original OWNER signature, `SIGN_EXECUTOR_PAYOUT_INVOICES_V5` returns invoices for the original page. The phone verifies each signature against a frame derived from its own pages before sending it with `SIGN_GRAPH`. The existing approval session covers these actions without another fingerprint per invoice. A lost response is reconciled before continuing the same preparation/page and notes; it never creates another charge.

V5 `START_AUTOMATION` also signs `executorPayouts`: beneficiary, each note's commitment/nullifier/amount, certificates, quoteRoot, `collectBy`, per-note gas ceilings and the total ceiling. Collection time does not extend delivery time. The command allowance adds four per payout—proof, submission and two reserved commands for reproof after an epoch change—to the graph's actual allowance, capped at 4,096. Review shows these terms before biometric approval. Provider notes are excluded from owner withdrawal options.

Collection gas is paid by the provider. Its cap is neither a price estimate nor an extra debit to the owner. V4 keeps manual settlement. V5-capable readers preserve every signed term; original V4 normalizers still reject V5. FULFILLED alone does not prove confirmed collection: each withdrawal needs its canonical receipt and nullifier.

## MoonPay integration boundary

Existing session scaffolding accepts `{requestId,flow,asset,network,fiatCurrency,amount,walletAddress}`: BUY/SELL, BTC/ETH/SOL and EUR. BUY amount is in EUR; SELL amount is decimal asset units. Network and SANDBOX/PRODUCTION configuration must match the original wallet account.

Checkout uses a fixed provider URL signed on the server. Browser return neither authorizes a transfer nor proves receipt. The raw webhook is checked with HMAC and a time window, then the provider is queried using the original ID. Selling requires separate review/signing of the exact native deposit.

States are CHECKOUT_READY, PROVIDER_PENDING, PROVIDER_FAILED, PROVIDER_COMPLETED and UNKNOWN. The DTO explicitly returns `chainConfirmation:'UNVERIFIED'` and `privateBalanceCredited:false`: provider notification is not on-chain receipt and does not create a private note.

The phone retains `fiatRequests`; `resumeFiatSession` recovers the same order after a lost response. The store uses the original process fence—flock exclusion, boot ID and start ticks—to reopen after a process dies and reject another live writer. An old PID-only `writer.lock` requires administrative recovery; it is not blindly removed. The SIGKILL regression preserves the order without network access.

Merchant onboarding/credentials, actual sandbox compatibility and on-chain receipt verification remain follow-up work. Provider status does not prove private balance. These are fiat-integration tasks, separate from engine acceptance.

Sources: `packages/backend/src/fiat/moonpay-gateway-v1.mjs`, `packages/backend/src/fiat/moonpay-order-store-v1.mjs`, `apps/mobile/src/native-wallet/native-wallet-controller.ts`, `apps/mobile/src/screens/NativeWalletScreen.tsx`.
