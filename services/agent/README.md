# Lianum persistent agent

<p><a href="../../README.md"><img src="../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Validation](../../docs/VALIDATION.md)

The independent Node 24.19+ service uses OpenAI Agents API sessions and a private SQLite database. The API gateway authenticates the device; the service queues messages, continues work after the mobile request ends, and returns saved output to the same conversation. New messages can steer a running session.

## Run

From the repository root, install the pinned OpenAI SDK:

```sh
./dev npm --prefix services/agent ci --ignore-scripts
cp services/agent/.env.example services/agent/.env
chmod 600 services/agent/.env
```

Edit `.env`: choose an absolute private storage directory, a random gateway secret of at least 32 characters, and an OpenAI project key with `api.agents.read`, `api.agents.write`, and `api.responses.write`. Then:

```sh
./dev npm --prefix services/agent start
```

The listener binds only to `127.0.0.1:8790`. In the **API server process**, configure `LIANUM_AGENT_URL=http://127.0.0.1:8790` and the same `LIANUM_AGENT_GATEWAY_TOKEN`. The two processes run on the same machine. A deployment on separate machines needs an authenticated TLS transport; the current gateway deliberately rejects non-loopback URLs.

The agent can start without an OpenAI key to inspect configuration. Capabilities then report `configured:false`; message submission returns `NATIVE_AGENT_NOT_CONFIGURED`. This is not an offline AI mode.

## Implemented behavior

- One durable conversation per authenticated device identity; independent
session IDs and a persisted agent proposer identity, never a wallet key.
- Idempotent message submission, steering of the same remote session, bounded
reconnection attempts, and saved responses with their notification outbox.
- Aggregate mobile observations, preferences, requested one-shot followups,
optional hosted web search, and signed native-testnet payment proposals using the existing SDK. Proposed payments require mobile review/preparation/approval.
- Owner-scoped state and paginated history. Pending remote function calls are
reconciled from `required_actions`, and saved tool results are reused.
- Scheduled followups are committed with their trigger message. They resume
after restart. Canceling the active turn does not cancel those schedules; schedules have their own cancellation route.

Live assistant text is read from the official session event stream and exposed only to its authenticated owner. Completed items remain authoritative and are reconciled after a disconnect; stream failures never resubmit input. A previous completed turn cannot settle newly submitted input. A bounded idle grace period retrieves delayed saved output. Stream views and checks are ephemeral, while messages, deliveries, tasks, preferences and tool effects are durable.

The signed `/v1/agent/stream` route carries incremental SSE updates through the existing public gateway. One-use authentication binds the subscription to the unlocked device; the internal token and model key remain server-side. Streams rotate after 15 seconds within the existing HTTP deadlines, honor backpressure, and bound response bytes. Disconnecting a subscription leaves accepted work running. Saved output is reconciled on reconnect. The mobile client uses native incremental XHR networking instead of buffering `fetch.text()` or polling live text. Idle state refresh remains separate. No model calls are added by subscribing.

## Bounded context and memory

Stable conversational guidance is configured once in the remote session. Each queued message freezes a compact reference containing the current time, validated language/time-zone metadata, explicit Mainnet/Testnet environment and observation freshness. Up to eight recent saved preferences (3,500 serialized bytes), forgotten preference keys, three related historical excerpts (700 characters each) and the next four waiting followups are included automatically. `read_memory` expands preferences within its output byte limit and returns related historical excerpts; `list_tasks` retrieves the task list. This works with existing session tool names, without recreating the chat or resending the whole history. Retrieval uses bounded keyword matching over owner-scoped SQLite history, including messages older than the display's first 100 rows; it is not semantic search or guaranteed recall.

Preferences remain explicit user-provided notes. Removing one retains a bounded tombstone so current context does not treat historical copies as active memory. Remembering that key again clears its tombstone. The latest 32 forgotten keys are retained; older deletions still remove the note but are no longer in that list. Deleting a note does not erase the chat, frozen queued inputs or OpenAI history. An additive SQLite table migration preserves existing conversations and sessions. Requested followups obtain a fresh reference when triggered, including the last saved locale; that locale survives service restarts. The reference uses the latest mobile observation and flags expired data, rather than claiming background balance access. Wallet/operation tools return their explicit environment and freshness; missing legacy environments remain unknown. Payment proposals require a known testnet context; mainnet or unknown contexts cannot create testnet proposals.

Public history excludes the internal input. Structured wallet cards are generated from actual tool results, including unknown amounts and freshness. Forgetting a saved preference removes the note; it does not erase prior chat messages. The agent cannot execute funds.

## Private storage

The SQLite directory must be owned by the service UID and mode `0700`; the database is mode `0600`. One process owns a database. Database transactions and WAL preserve accepted work; the directory contains private conversations and the proposer key and needs the same protection in backups. Storage is not ZDR.

## Model and spending controls

The default model is `gpt-6-luna`, Standard tier, low reasoning effort. Other models require `LIANUM_AGENT_ALLOW_OTHER_MODELS=true`; there is no automatic fallback to a more expensive model. Hosted web search is off by default and requires `LIANUM_AGENT_WEB_SEARCH=true`.

The default `LIANUM_AGENT_BUDGET_MODE=session` requests a model limit of 25 USD cents with `spend_control`. This is not a wallet allowance or a cap on all tool charges. A provider rejection of this parameter, including HTTP 400 `unknown_parameter`, is handled explicitly. In this mode the service stops with `CREATE_REJECTED` and `NATIVE_AGENT_COST_LIMIT_UNSUPPORTED`; it never retries without the cap.

`LIANUM_AGENT_BUDGET_MODE=account` explicitly omits that parameter and relies on externally configured OpenAI account/project limits. It requires the operator's decision; no API error switches modes automatically. The session-cent setting does not apply in this mode. Account limits are external controls; the service neither sets nor verifies them and does not implement combined cumulative accounting. Configure and review the deployment's spending policy explicitly; do not enable unsolicited model workloads or advertise a project-wide cap without corresponding accounting.

## Deployment

The cloud package includes the agent entry, pinned SDK, and `infra/google-cloud/api-server/lianum-agent.service`. The agent reads its root-only `/etc/lianum/agent.env`; the public API receives only the separate gateway token. The agent context deployment pins the agent's executable and working directory to its own `/opt/lianum/agent-releases/<digest>` through the systemd drop-in `lianum-agent.service.d/agent-context-v2.conf`. The public API keeps its existing release and process, and the financial engine is independent. Future agent deployments must review/update that explicit pin; changing `/opt/lianum/current` alone does not update this agent. The deployment keeps a private SQLite backup and verifies conversation/session identities and old message data after restart. `LIANUM_AGENT_ALLOWED_DEVICE_KEYS` is a JSON array of approved uncompressed device public keys. Production sets it from the existing paired devices; other self-created identities are denied before storage or inference. Updating this list is an operator action and does not grant wallet spending permissions.

## Wallet reading while the phone is closed

The current source adds an opt-in, read-only backend connection. In the mobile agent permissions panel, the owner connects public accounts for Mainnet or Testnet separately, for up to 30 days. Disconnecting clears both environments. The existing device signature authenticates enrollment; the agent deployment allowlist is checked before creating registry files. No wallet key, signing capability or spending grant is uploaded.

Configure `LIANUM_AGENT_BACKEND_URL=http://127.0.0.1:8791` and a separate `LIANUM_AGENT_BACKEND_TOKEN` in the agent. Configure the same token in the API process, which starts a second loopback-only listener on port 8791. Both values must be present together. Keep this token separate from the agent gateway token. The API stores private account registrations in its `agent-wallets` directory.

A new `read_wallet` or `read_operations` tool request reads those registered accounts through the existing native backend. Previously retained signed transfers may be observed; this path never prepares, sends or retries a payment. There is no continuous balance polling or additional model call for enrollment, state refresh or background reading. Requested scheduled followups can use the same tools without the mobile connection. Recovered function results reuse their saved result without repeating these reads.

Tool output names its source (`BACKEND_RPC` or `MOBILE_OBSERVATION`), environment, observation time and uncertainty. Unavailable accounts remain unknown; missing prices never become zero-valued assets. A failed refresh retains its explicit error and marks fallback data stale. A result arriving after disconnection or an environment change is discarded. Additive state preserves existing chat/session identities. This capability requires both the API and agent release plus Android validation; the financial engine remains independently deployed.

## Operation tracking, Android notifications and voice

The operation worker registers only a genuine, finite, device-signed read grant for an already stored signed proposal. It checks the owner, proposer, descriptor, origin and terms before retaining it. A phone confirmation remains unconfirmed until fresh, SDK-verified backend progress arrives. The worker observes every 30 seconds, persists progress and emits idempotent same-chat results with an outbox. After three uncertain reads it requires review; expiration/read quotas stop tracking without claiming financial failure. Stopping tracking does not cancel a payment. The worker cannot prepare, sign, send, rebroadcast or renew. Set the fixed `LIANUM_AGENT_OPERATION_ORIGIN` to the public API origin.

Android push is opt-in in the agent permissions panel. Native FCM registration uses the existing Firebase project, without Expo's push relay. The worker sends a generic notification; balances, account addresses and reply text stay out of its payload. Foreground chat presence and acknowledgements suppress notices. Token rotation, expiration, bounded retries and the outbox survive restart. `LIANUM_AGENT_FCM_PROJECT` and `LIANUM_AGENT_FCM_SERVICE_ACCOUNT` select the attached VM identity; metadata supplies short-lived credentials. The dedicated identity has the FCM messaging role. No downloaded key, Firestore or Cloud Function is required. The Android build needs the local Firebase config.

`LIANUM_AGENT_VOICE=true` enables **GPT-Live 1** through native WebRTC. The server creates the session and holds a sideband connection; the phone carries audio and captions and can mute or hang up. Client delegation submits work to the same existing Agents API session, with its tools, memory, chat and permissions. The live model can continue conversing while backend work runs. Voice cannot authorize funds. Transcripts enter the persistent chat; raw audio is not stored by this service. The service bounds seeded history, delegates only new input, deduplicates transcript events and discards superseded spoken results.

Voice calls close on hangup, Android background, missing heartbeat (30 seconds) or 10 minutes. The current implementation keeps calls in the foreground to preserve the wallet's background lock. This is an in-app call, not a public telephone number. `LIANUM_AGENT_VOICE_BUDGET_MICROS=5000000` reserves a cumulative USD 5 for voice in SQLite. Final duration adjusts reservations; uncertain creation or final usage conservatively keeps the reservation and never creates a replacement paid session automatically. Backend Luna/tool usage is separate. The voice reservation does not enforce a combined project-wide model/tool budget.

## Recovery and acceptance

The UI reports configured capabilities; a successful local fixture or model catalog lookup does not certify natural speech, audible playback, actual Android notification delivery, fingerprint approval or confirmed financial execution. Those require physical acceptance. Without opt-in backend enrollment, wallet observations remain mobile aggregates labeled with freshness. Backend reads cover enrolled public accounts, not a full reconciliation of the financial engine or every DeFi position. The agent has no autonomous spending grant.

### Uncertain session creation

If session creation loses its reply, status becomes `CREATE_UNKNOWN` and the service stops rather than creating another potentially duplicate session. A crash with `CREATING` persisted is treated the same way. Known sessions can reconcile saved output. After three consecutive connection failures, the UI offers a signed retry of the existing session. Failed sessions and uncertain creation or explicit configuration rejection require operator investigation. Account-mode live acceptance passed with the actual OpenAI project: two turns, a service/store restart, the same remote session, preference storage and retrieval. The deployed HTTPS route also passed with a temporary signed test identity; its remote session and temporary access were removed afterward.

## Verification

```sh
./dev test --component agent
```

Tests use real local SQLite/HTTP/device signatures and the official SDK with a fixture transport. They do not certify a live OpenAI session or financial execution. No compiled/ZK network reopening is part of this test command.

Official references: [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), [sessions and idempotency](https://developers.openai.com/api/docs/guides/agents-api/sessions), [function recovery](https://developers.openai.com/api/docs/guides/agents-api/tools/functions).
