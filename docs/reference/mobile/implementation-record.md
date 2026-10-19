# Mobile Wallet

The interface incorporates the original identity of `Lianum_design`: ivory background `#F3F0E8`, slate, champagne, DM Sans and Instrument Serif local, SVG brand and compact controls. The cover follows the balance reference centered on the flat background, without blue card. The amounts come from each native account; no example, historical or workspace balances are imported from the prototype. The overview brings together BTC, ETH and SOL of the main accounts in a stock valued in EUR or USD, with persistent choice and columns of available, reserved and in operations. Use whole arithmetic to assess atomic quantities; an unknown reading prevents a complete total. Testnet funds are not added to the main estate. The distribution rows open up the detail of the asset and its market; choosing a network stops changing the heritage of the cover.

Balances are consulted when opening, back in the foreground and every minute, with cancellation per session and without occupying the financial blockade. You can navigate while loading; sliding down allows an additional update. Preparing and authorising a shipment retains the original controls.

The indicative quotations come from the public endpoint of [Coinbase exchange rates](https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates)With a minute's cache. 1D/1S/1M/1A charts use their [market candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles)with a five-minute cache and limited requests. These queries do not send addresses or identity and do not authorize operations. The evolution of the heritage records observations of this session; it does not use the market as if it were personal profitability or invents an earlier history.

Navigation retains its original custody and actions. The full copy of the reference frontend is in `C:\Users\Rafa Pradillo\Desktop\Lianum`; copy `Lianum_design` the workspace is partial. `HomeScreen`, `AgentScreen` and the full tab bar guide structure, measurements and navigation. The VoiceOrbs renderer retains its MIT sources and license, with a native SVG adapter; graphics reuse the frontend ECharts adapter. Origin `src/design/original-components.json` and licences in `src/design/licenses`. The Android integration adds the resolution Tslib Metro of the original frontend and limits ECharts ARIA DOM to web; the native container declares its description accessible. Graphics have been visually revised on Android; TalkBack is still pending validation. `Brand.tsx` and the frontend layout provide the brand and typographical families; `components/finance.tsx` provides the structure of the asset rows; and `app/settings.tsx` / `app/security.tsx` the organisation of adjustments and security. The native primitives are integrated into `wallet-ui.tsx`; handlers continue to belong to the wallet, without replacing them with frontend mock services. Assets and their licenses are in `src/design`; the sources come from `@expo-google-sources/dm-sans@0.4.2` and `@expo-google-sources/instrument-serif@0.4.1`. Network brands retain their originals and references to `assets/ecosystem/sources.json`.

Application **React Native/Expo with Android** delivery, local custody, explicit HTTPS connections and signed permissions on the original domains. The ** Cartera** screen uses Ethereum, Bitcoin and Solana mainnet using the API `https://api.lianum.oryontechnology.com`; generates or restores addresses and signature on mobile. You don't need the computer to check balances. Directions, QR and queries are checked on Android; the first actual shipment is still pending. MoonPay remains disabled until the provider account is configured.

PAEG and DeFi private accounts retain **local ledgers** and separate connections. Its complete financial journey on Android and its publication on real networks are still pending. The instructions for connection to the computer of this guide belong to that private tour. The current [APK and evidence of each generation](../../../STATUS.md) are recorded in STATUS; the previous artifacts described here are historical.

The app opens **Carter**. The demo portfolio only incorporates authoritative readings and separates quantities by asset, domain, root and generation. It does not add ETH, BTC, SOL, notes or shares as if they were a single currency. UNKNOWN, STALE and an expired reading show ** Referral balance**. The last confirmed amount remains its time and is identified as historical, without being presented as current available. The outstanding work remains in their original custody.

The main navigation contains **Start**, ** Operations**, ** Agent**, ** Approval** and ** More**. History opens from Home. More preserves security, recovery and advanced connections. Operations presents registered shipments and allows to open saved plans and strategies. Test connections continue to be identified in their original revisions. Agent connects to the persistent service and real model using the device's signed API. Its headboard, orb, welcome, composer and panels follow the code of `features/agent/AgentScreen.tsx` full frontend. The orb reflects connection, work and response; transitions and pulsations respect reduced movement. The composer grows with the text and adapts to the Android keyboard. Messages appear immediately; reception is confirmed separately and a retry retains the same identifier. If you change tabs during an unconfirmed shipment, you are available to try again. Fragments arrive by SSE authenticated by native incremental XHR. The hold indicator has a smooth pulse and disappears to the first text received, even if the server is still closing the turn. With reduced movement the indicator remains static. Progressive responses are replaced by the saved result, with formatted text, HTTPS links, observation cards and verifiable proposals. The scroll retains the position when reading previous messages and offers to return to the last message. Settings includes tasks, editable memory and real permissions. The remote chat remains on the server when blocking or updating the app; the draft is kept between tabs during the unlocked session. If the service is not available, it is reported without making a local conversation. The voice and notifications are still pending. No fictitious data or proposals are imported from the prototype. Approvals allows you to review links of proposals received by the original controller; it does not produce a remote inbox or a number of pending requests without having consulted them.

The Android Back button closes the keyboard or open panel first, then comes back for portfolio details and section history. In Start, without internal panels or steps, let the system act. The sections with operations retain the blocks and the owner of their transport. The travel status is restarted by blocking the session. The hold indicator uses a brightness wave for letters and staggered points, with native animation and no movement when this preference is activated.

## Connect phone to computer

1. In the entry, tap **Create my wallet** or unlock the existing identity.
Your public key appears in **Settings → Advanced Tools and Recovery**; copy it to link the server to the same wallet.
2. Run `./dev platform paged-native-new` on the computer. Stick that key and
chooses an address accessible from the phone; the wizard prepares TLS and server files.
3. Copy the public content of
`paired-connection.json` of the path that the wizard prints and presses **Import computer connection** in ** Operations**. Check the origin and fingerprint of the certificate shown in the app.
4. Keep the server open while using your notes. For DeFi, run
`./dev platform defi-new` in another terminal and import your own connection in the **DeFi** tab.

Local transport included in the APK requires Android 10 or later and strong biometrics configured. In WSL, a private IP of the process may not be accessible by Wi-Fi: the server guide (historical path: `../platform/README.md`) includes the USB with ADB alternative for the ports of the selected profiles. Only the public profile is taken to the phone; `operator.json` contains the server's private configuration.

## PAEG operations from the app

1. Connect the original Wallet package and check its status.
2. Enter funds into the note. The app prepares D26 and requests its funding
Original without requesting technical commands.
3. Define budget and deadlines. Add payments with network, address, amount and steps
previous ones to be completed. Save the payments and check the operation.
4. Press **Authorize and execute the operation**. The app signs the pages and uses
the same SDK runner to book, check dependencies, send, accept receipts, save results and liquidate.
5. Check the progress and remove the available outputs by your authorization
It's your own. If a network has a pending confirmation, **Continue execution** consults the same submission; a lost response requires observing your work.

The form converts decimal text to minimum units with exact arithmetic: ETH to wei, BTC to satoshis and SOL to lamports. The native amount of each payment is kept separate from the **reserve of the pass in units of the note**. You don't invent a conversion price between them. The connection offers fast destinations and allows a free address validated by the corresponding runtime.

The current three connections are **Local Ethereum**, ** Bitcoin regest** and ** Local Solana**. Bitcoin supports Regtest P2WPKH destinations `bcrt1…`; Ethereum checks an EOA and Solana recipient validates their address and destination conditions. Their amounts, limits, commissions and purposes are checked in each runtime. The form does not present an estimate of commission that the supplier has not delivered.

The shared runner is at [`mobile-protocol/device-paged-operation-runner-v3.mjs`](../../../packages/mobile-protocol/src/device-paged-operation-runner-v3.mjs); the entry of `src/api/` re-exports the same implementation. Ask for `NEXT_COMMAND` through the private channel and executes the following original command. The engine generates the indices, dependencies, witnesses, receipts and health of the quorum; the app does not require pasting them as JSON. The runner receives an authenticated port and delegates signatures, tests and RPC calls to its original implementations. The pending confirmation or an adverse result stops the automatic advance.

## Historical session and interface artefact

This section describes only the previous cut; it does not certify the new functions or their installation. Consultation [STATUS](../../../STATUS.md) for the current APK.

APK historical 5b61f259 (historical path: `../../.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/app-release.apk`), installed by update without erasing data. SHA256 `9970a7af0fe0666c55b95b2b855e352b1d1fd98d4f7bce995b10aeb63a1385e9`; 43,779,779 bytes; generation `bb71fdb0a09c7768c98b60706f38bacbef9c8a32b87f677fc7105a92f399db40`. Packaging verification (historical path: `../../.local/mobile/artifacts/android-standalone-5b61f259-ef9a-4ea0-8c27-3d79e65b1c12/native-transport-verification.json`): the fifteen main session/IU files match the installed bundle, Hermes without Metro, ARM64/x86_64 and original Debug certificate. In that cut they passed TypeScript and fifteen focal session/custody checks. Its IU was observed in Samsung. The migration of existing custody requires an additional initial footprint; no payments were sent during that update.

## Entry and navigation

Portfolio, Operations, DeFi and Settings form the main navigation. The entry opens a session by means of a biometric reading of identity. Consultations and preparations use that session; they do not generate financial authorizations on their own. The session is blocked when it passes in the background, after fifteen minutes without interaction or after thirty minutes of its opening.

The existing ROOTs retain their authenticated entry. A first migration reading creates an AES-GCM envelope linked to the exact identity and namespace; you can request an additional footprint once for existing custody. Then, the envelope opens with the session key. By blocking, the mutable buffers are deleted and the continuations of the Vaults are revoked.

The amounts, destinations and networks are reviewed before the movement is authorised. The Public Connection of Operations is stored and consulted automatically while it is active. Automatic queries are paused when editing payments in BUILTING; manually switching connection takes priority over polling. Switching between Portfolio and Operations maintains that connection; switching to DeFi waits for the closure of the previous transport. Technical data and recovery copies are left on folded cards.

## Authorisation of an operation

The financial review shows payments, recipients, reservations and deadlines before opening an authorization of **up to 30 minutes with the app in the foreground**. A sensitive footprint confirms that operation and renews the input because it is a new authentication. The commands of this graph count as activity for the limit of fifteen minutes of inactivity; they do not extend the maximum of thirty minutes. The authorization is linked to the original descriptor, root of custody, graph ID, root of authorization and nullifier of reservation; it does not grant access to another graph or supplier.

During the session, each command obtains and signs a new original 15-second **permission**. They recheck their scope and validity before signing; the session does not retain reusable permissions or replace the signatures of notes, tests or chain acceptance. ** Deposits, withdrawals and DeFi remain outside this execution authorization** and maintain their specific permissions.

The execution authorization and its key copy live only in memory. **Pause execution**, cancellation, closing, moving to background or expiration erase mutable buffers and revoke the session. Payments already sent retain their IDs and status to consult; pause the app does not undo a transfer to another network.

The encrypted copy retains identity, pages and openings already created. A new copy is needed after preparing new pages; an old copy does not contain the later keys. Restoring requires the same identity and original readings before new effects. A local preparation or signature does not yet represent funds available.

## Costs and payment to the supplier

When the graph is FULFILLED, **Consult costs and payments** shows the original facts of each network and the distribution of the note. Commissions are shown by asset and unit; an unknown cost remains without confirmed data. No market price is calculated and no gas, ETH, BTC, SOL or tokens are converted into demo units.

First withdraw the ** remaining balance** by your own authorization. Then, ** Authorizing payments to the provider** reviews the original beneficiary and the exact departures. A specific biometric approval allows to complete these payments, up to thirty minutes in the foreground: in the mixed route there are four departures. Each W39 keeps its signature of note and a new permission of fifteen seconds. The app uses the same SDK helper and checks each collection and preservation of demo units; notes remain in the owner's custody until they are removed. This does not demonstrate autonomous recovery of a solver or market profit.

A withdrawn exit to another address does not count as payment from the provider. If your original confirmation is missing, the payment remains blocked. Cancel, close custody, block, go to the bottom or overcome authorization revokes the pending sheets; confirmed shipments retain their history.

## Wallet by connection

When completing an operation that includes Uniswap, **Consulting token received in Uniswap** opens the original ERC20 connection and custody of that step. Check work, root and commitment; keep the existing note. When consulting a D27 reception at DELIVRY_UNKNOWN, the app asks for an original comment and re-reads the status. This consultation does not repeat the exchange or its test and still keeps a PROVED reception intact. If confirmation is missing, keep the status pending. The completed graph does not by itself turn that token into an available balance or authorize it to be withdrawn; it requires reading its own custody and a separate withdrawal authorization.

When entering, the registered connections and their original routes are consulted sequentially. **Letter** groups its funds by asset and unit, separates available, reserved and linked to operations, and counts only once the same note or position. The encrypted query Paged includes source, change, recovery and results with your actual status of issue and expense. The portfolio indicates how many queries remain in effect; opening a row selects your exact connection and custody. It does not convert coins or shares to a common total or cover unregistered custody.

A LIVE balance requires your original current reading. Changing the screen and closing the transport retains the consultation DATA during its original fifteen-second period. When you expire, change custody or remain outstanding, the above amount is shown as historical and the action needs to be consulted again. The automatic update of the graph again consults its outputs. A position retained by the service retains BCKEND custody; a note of the device retains DEVICE custody. Estimates of underlying are not expended funds. With the server off, connections and copies can be saved, but no current availability can be obtained.

## Joint copy and recovery from lock

**Adjustments → Joint copy and recovery** retains the identity, public connections and Paged and DeFi custodys registered. Save the copy and password separately, and create another copy after new pages, notes, or jobs. Old unregistered custodys and service journals require your specific copies.

The entry keeps **Restore my joint copy** available even if the login or session is LOCKED. Enter the full copy and password, check the identity and click ** Check and restore**. The package and each cut retain original AEAD authentication, identity, namespace, revision and CAS; a different identity or custody is not overwritten.

Recovery from LOCKED uses a specific biometric approval and a private token of a use, linked to the package, identity and cancellation signal, with a maximum of sixty seconds and revocation when changing the session time or moving to the background. After installing the same identity, the entrance is opened by its normal protected reading and custodys are restored. You can request the recovery print, entry print and original authentication required by each custody. A session is not opened and money is not authorized by means of a data snapshot.

Restore the copy does not confirm balances, reconstruct permissions, or retrieve external journals. Before moving funds the original service, its preserved state and new original readings are required.

## DeFi actions and positions

**DeFi** recognizes the original ERC20, Uniswap, Aave, Morpho Blue and MetaMorpho Note connections. Your guided tour shows the next step to finance, book, convert, confirm and consult or withdraw your results, with the permissions and exits of each protocol. From Operations you access DeFi and from ** See my positions** you return to your actions.

The consultation of positions and expenditure actions have different authorisations. The shares, their valuation and the funds reserved are not converted into an available balance. These actions use their original ExternalFlat relationships: common navigation **does not convert them into native admissions of Paged graph**. Optional preparation of local Uniswap as Paged node uses original D27 and requires checking your ERC20 copy before adding it. His departure retains his own custody; he does not automatically finance other nodes. The acceptance of each mixed tour is credited separately in [STATUS](../../../STATUS.md). Other DeFi protocols and SPL results retain their specific integration limits.

## Alcance actual

TypeScript and HOST checks use SDK, signatures, AEAD and original custody, with Expo and chain boundaries declared when simulated. The focused session check rejects another graph, withdrawals and expired permissions; checks a fresh signature without repeating biometrics or key readings and revocation after background/closure. These checks do not demonstrate hardware isolation, physical biometrics or operation in public networks.

Joint financial acceptance, recovery and current artifacts are recorded in [STATUS.md](../../../STATUS.md). The new block incorporates re-opening Mixed, reconciliation of lost response and jointly registered portfolio; its economic journey completed four restarts, twenty-one tests, the four deliveries and settlements, with portfolio 600 → 400 → 0 and separate Uniswap token. The APK of that cut is compiled, preserved and verified. The short check on Samsung passed: session, import, TLS, signed query, navigation and reconnection. The entire financial operation and portfolio with funds from that phone are still pending. Includes 61 modules tested against the font map and 203 input unchanged during compilation. Android transport has its own packaging verification, without attributing to it HOST financial acceptance. The previous mixed path of the generation `8eab00d36eaa9602a20dfd572d0d95228817df1061a0fad4145a346f9c48bfc2` completed the four steps on the computer, with twenty Paged tests, a D27 and the original payouts. The SDK was used with HOST software custody; this acceptance does not support biometrics or physical execution of the new APK, iOS or cold reopening of the Mixed profile. Your previous APK is preserved; the packaging verification of each cut is recorded separately in STATUS.

A financial journey **historic** of the three networks ended with thirteen original proofs, the finality of the three deliveries, graph FULFILLED and withdrawal of 300 units of change. The same SDKs and mobile executor were used with software custody in Node; the complete operation of this block on physical phone remains pending.

## History of the first physical income

This previous cut retains its evidence and does not prove the new settlement, portfolio or recovery from LOCKED.

The Historical APK conserved (historical path: `../../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/app-release.apk`) is compiled, verified and installed on Samsung: **43.650.119 bytes**, SHA-256 `7243b9c175dd1a467f937123a9764a8ca2af5be66017f3d3cf263260eac9ec76`. Source Generation: `0e41709b86803f3a6369a47d54da471edaa7bac0b9f56bf4b3727067cd446dbd`. Source entries match before and after. The build ended in ** about 53 seconds**. Includes JavaScript/Hermes without Metro, ARM64, x86_64 and the same Android Debug signatory. The completion report retained (local evidence: `../../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/build-report.json`), the bundle, its map and the package check (historical path: `../../.local/mobile/artifacts/android-standalone-f2678a40-c90b-4691-ab5c-6c15376250f7/native-transport-verification.json`).

It maintains the correction of ciphertext base64 to bytes for native AES and the root loan only for reading of the same namespace, with its AbortionSignal and a maximum of 60 seconds; it is deleted when finished, cancelled, closed or defeated. The correction of that cut separates the actual epoch from the messages of local monotonic expiration. Keeps 15-second permissions and maximum 3-second advance; the reading session does not save the owner's signature key.

**Continue prepared income** recovers the same note, opening, amount and work after an original reading confirming absence of proof. A expired era only renews epoch and signs D26, along with its hashes. Deposit, funding and graph commands keep the slope before the challenge and validate a private token of a use after signing, without opening ROOT again. Selecting network, destination or dependencies does not cause protected soft drinks. The recovery passed four focal/HOST checks in 19,44 seconds; TypeScript and boundaries passed in that cut. That APK added phase-by-phase diagnostics and code limitations, with no private data.

Android accepted the update by retaining identity, namespace and operator; the installed hash is verified. Samsung confirmed the original D26 test (local evidence: `../../../.internal/runtime/omnichain-product/evidence/paeg-proof-attempts/8a623959-4419-455c-bc51-dd622002fa7c.json`), funding with a new authorisation and subsequent reading of **600 units available**. The physical checkpoint (local evidence: `../../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/funded-physical-paged-f267-v1.json`) certifies that income to the local common operator. The three-network graph, the withdrawals and DeFi from the phone are still pending. The previous imports and the READ, carried out with `9af3816e`, retain their own evidence (local evidence: `../../../.local/mobile/device-android-937ced9c-3e2a-41a6-9978-fd27044c8bc9/paired-signed-read-wall-clock.json`). The [diagnosis of WSL's watch](../../USB-MOBILE.md)the previous APK `ccda916f` and the financial results of their sources remain historic; they do not credit the current generation.

## Structure

- `src/screens/`: screens and consent.
- `src/custody/`: local key, signature and encrypted pending operation.
- `src/api/`: transport of mobile protocol and public status of the service.
- `plugins/`: Native configuration generated, including the Android build limit.
- `tests/`: cryptographic compatibility, boundaries and host tests with borders
explicitly simulated natives.
- `../../packages/mobile-protocol/`: Public contract shared with the server.

## Legacy Admission Outbox

The advanced screen **Advanced connection** and the V1/V2 outbox belong to the historical admission route, separated from the current Paged route. Your SQL permissions do not grant custody or replace the original routes Linked Account, Finance Note, ERC20 Note or DeFi Positions.

The V2 outbox retains the first permit, the original economic terms and a permit per action. The acceptance response of each permit is shown separately: `execute: UNKNOWN` still pending although `reconcile` o `recover` get `REJECTED`. No HTTP response closes the economic status or releases the record for another operation. An original financial observation is needed, which this legated admission route does not offer. No replacement permits or automatic forwarding of an action already retained are generated.

V1 records are read without inventing lost history and are kept as financially pending. Writings are serialized in JS' realm and check SecureStore's readback; this does not demonstrate CAS between processes or native rollback protection.

Consent uses a private review in memory, linked to the screen and its generation. Cancel, edit, refresh or close-up invalidates it, including an old alert callback. Recheck origin, identity, terms, recent capabilities and expiration after biometrics and after storage; consume the review before launching POST. If the review changes during retention, keep the original permission pending and avoid that shipment.

Each saved permit offers "Check permission" to read only your original admission. The query retains full permission, creates a random nonce and expires in 60 seconds. It shows the scope and requires new consent and biometrics, with a signature in its own domain. He's not forwarding the execution permit. It works after the original permission expires and you can consult PostgreSQL when the economic adapter is disconnected.

This query also uses a revocable private review: cancel, change origin or owner, refresh and close-up prevent you from using a previous callback. It is checked again after biometrics and reading or saving the protected operation. The review is consumed before the reading POST. A 404, timeout or lost response retains the pending outbox; a late reading does not lower an ACCCEPTED permission to UNKNOWN. Read ACCEPTED only confirms permission admission: the economic status follows UNRESOLVED and does not release the operation.

## Native notes and recovery

The economic acceptances cited here are historical and correspond to their own source courts; they do not credit the new APK or the current block.

The source D26 and the outputs of change and recovery retain their original root, work, reservation and recipient. A saved amount is local information; the available one requires fresh original reading, inclusion and unused nullifier. Recovery remains blocked before F and the original deadline.

If an F observation loses its block, the app saves UNKNOWN and revokes the balance before consulting again. Only reconciliation of the same F can reinstall its result; it does not send a new recovery permission or release the operation by an HTTP response. The route `b4329b70` was accepted with nine original proofs: UNKNOWN durable, both outputs blocked, Vault reopening and F's second reconciliation before both W39. It retains a single reissue of the original wire, without new native signature, economic permit or proof of recovery. The scope is the exact original parent of F; no zero balance is assumed or automatically forwarded.

The LIVE_ARMED service agreed to keep the same reservation, armed authorization, Vault, journal and provider in an ordered restart. Its short variant uses three D26/U/S tests and a new signed READ, without F before the cutoff; it does not prove F autonomous after eight hours, abrupt loss or phone. See [Original account](../../ORIGINAL-ACCOUNT-V2.md) and local native entry (historical path: `../platform/docs/ORIGINAL-LOCAL-DEVICE-OPERATOR.md`).

## Check DeFi Positions

Open **DeFi → See my positions**. Choose a registered connection or tap ** Import position connection** to import the original public profile. Your descriptor and permissions are your own: they do not reuse Paged Note permissions or ExternalFlat conversion permissions.

The open session signs the two original access and reading queries, with fresh permissions of fifteen seconds; consulting does not authorize spending. **Update the selected account** gets another reading when it expires. Cancel or exit to the bottom closes the transport and revokes the review.

The screen separates shares available, reserved, blocked and in recovery. UNKNOWN and expired data remain to be consulted. The estimate of the underlying is not a cash balance or liquidity guarantee. This view does not prepare or transmit TOP_UP, GRAPH, EXIT or redemptions. Actions in these positions and shares require their own accounts and device notes created before funding; Linux positions do not become a mobile expense authority. The source ERC20 note is managed in **DeFi**. The output of native notes uses its separate original bridge.

The custody of these positions remains in the original Linux backend. The service requires its same catalog, session and head; it does not adopt accounts using IDs or snapshots. Four TLS/SDK/procedency HOSTs passed, two installation and shutdown of the service and mobile TSC. Meta and Aave accepted two readings of the original SDK per protocol after mint and redemption, retaining the same fifteen tests and without new effect to consult. They closed READ before capturing five original sections and reopened each backend held on another PID with the same/received identity and no new shipment. The catalogue retains the closure of new admissions.

The signer secp256k1, digest Expo and streetr certificate are explicit HOST infrastructure: they do not prove biometrics or phone. GRAPH recovery, abrupt fall and father's departure are still off this accepted route.

## Note ERC20 own

In **DeFi**, it imports the public connection profile delivered by the operator of the original local service (historical path: `../platform/docs/DEVICE-ERC20-LOCAL.md`). The root and note key remain in the app. Set the withdrawal recipient before preparing the deposit and use the same amount in atomic units as the operator prepared. Testing, funding and withdrawal require separate permits.

An operation withheld or a lost response is consulted about the same work; it is not refinanced or withdrawn. UNKNOWN and data not available are not zero. The withdrawal uses the full source note; this screen does not convert the positions guarded by Linux into notes on the device. Backend, SDK, Vault and screen are connected. The route Node/TLS `da603751` accepted D26/W39, two original shipments and lost responses reconciled in the same jobs, without duplicates. He captured four sections and reopened the backend in another PID just to observe, without new evidence or shipments; seven closed processes and intact sources. Telephone, abrupt loss and public operation are still pending.

## Development

From the root of the repository, with the local Node:

```sh
./dev npm --prefix apps/mobile ci
./dev npm --prefix apps/mobile run typecheck
./dev npm --prefix apps/mobile test
./dev npm --prefix apps/mobile run prebuild
./dev npm --prefix apps/mobile run export
```

`prebuild` generates native projects `android/` e `ios/` from `app.json`; both are excluded from Git. `export` generates the Hermes bulk in `dist/`also excluded. None publish the application, create EAS accounts, or show that an installed binary works on a device.

To install a development compilation use `npm run android` with Android SDK and its compatible JDK, or `npm run ios` in macOS with Xcode/CocoaPods. Commands run in `apps/mobile` with the local Node in `PATH`. Creating iOS projects can be checked on Linux; iOS compilation and installation require macOS.

To prepare a local APK **debug** without installing or uploading it:

```sh
./dev npm --prefix apps/mobile run build:android:debug -- --preflight
./dev npm --prefix apps/mobile run build:android:debug
```

The preflight checks JDK 17 or higher, SDK/API 36, build-tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Use `ANDROID_HOME`, `ANDROID_SDK_ROOT` o `~/Android/Sdk`. The compilation generates Android from `app.json`, check the [SHA-256 Gradle officer 9.3.1](https://services.gradle.org/distributions/gradle-9.3.1-bin.zip.sha256) And it limits Gradle to a worker. The public plugin `with-native-build-limits.cjs` configure Android app and libraries with a single Ninja pool `owned_build=1`, shared by compilation and link. The helper checks those arguments in the Gradle files generated before starting the compilation. Check that the APK only includes `arm64-v8a` and `x86_64`; record hash and result in `.internal/dev/reports/mobile-android-debug.json`.

Gradle JVM uses a maximum heap of 1024 MiB and a maximum metaspace of 512 MiB. The report retains the limits requested and the options observed in the Java processes themselves, including the uniquely used workers and daemon, with their Linux and RSS maximum identity. The options of a worker may differ from those of the main JVM; they all count for the same total limit. The [JVM arguments of Gradle are used](https://docs.gradle.org/9.3.1/userguide/build_environment.html#sec:configuring_jvm_memory) and the [Kotlin compilation in progress](https://kotlinlang.org/docs/gradle-compilation-and-caches.html#defining-kotlin-compiler-execution-strategy).

It needs 5,5 GiB available at the start; it monitors the RSS of its processes and descendants with a maximum of 3 GiB and keeps 2,5 GiB free. Shares the prover lock when the runtime exists; an active test blocks the build. Does not execute `gradle --stop` nor does it stop other people's processes. Gradle single-use daemons can open another session: they are only incorporated after checking parent, PID, startup and UID; individual signals recheck that identity. The resulting APK will be in `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` And it needs Metro, because it's a development compilation.

To build the local APK with JavaScript and Hermes included:

```sh
./dev npm --prefix apps/mobile run build:android:debug -- --standalone-local
```

The original builder assembles `app-release.apk` with the existing Android Debug signature. It works without Metro; it retains the two architectures, Lint and the limit of 3 GiB. For this variant the main JVM uses heap 768 MiB and metaspace 384 MiB, SerialGC and two active processors, verified in the actual Gradle arguments. The Historical Cut `b52d49a6-9cd4-4230-9591-8d9afa7346e6` checked 85 equal inputs before/after and 36 joints of the bundle: **42,841.007 bytes**, SHA-256 `bdc836079db34161a793fcc0f383351890e3b79ddfee421c74f5148b4be2dbaf`, with JavaScript/Hermes included and without Metro. Includes RootNote encrypted copy, publication of original balance after execution/W39 and waits for the result in the two SDK withdrawal allowed, retaining original permissions and guards. APK of that cut (local evidence: `../../../.internal/dev/reports/mobile-android-standalone-local/attempt-b52d49a6-9cd4-4230-9591-8d9afa7346e6/app-release.apk`) · informe original (local evidence: `../../../.internal/dev/reports/mobile-android-standalone-local/attempt-b52d49a6-9cd4-4230-9591-8d9afa7346e6/report.json`). The local copy is in `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. GRAPH `1159c12e…` ran 14 tests, W39's lost response, SOURCE/SHARE/POP software and READ confirmed spent notes without new financial effects. His RAW ended up being rejected by an HTTP403 Replay counter; `56f8212` corrects it with a focal regression, without repeating funding. The original capture of four sections and the reopening of the backend were not achieved. That cut does not change the Node/TLS range of your tours or credit hardware. The build report of the current block is in STATUS; your check on the phone remains pending.

The Historical Cut `d07f578f` Checked 36 Bundle Joins and 79 Inputs, including the pure position validator and the new ERC20 note.

The historic APK `d07f578f-c20d-47a0-a4ec-037686caea1f` is compiled and archived for court: **42 643 195 bytes**, SHA-256 `689b8eaadf695f921e598ff4a138f29668cc4250c0280132dcfb22a743345c5e`. His 79 inputs were the same before/after and he completed 36 joints, with Hermes and Debug/V2 firm checked, without Metro. Ten own processes absent and zero signals in the original report; strong file with retained report and source. It does not credit telephone, SecureStore, biometrics or physical financial operation. Includes the corrected protocol/SDK for both outputs blocked during a reorganization. The previous APK `e19ad1eb` retains its historical acceptance. APK of the court (local evidence: `../../../.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/app-release.apk`) · informe original (local evidence: `../../../.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/report.json`) · origen (local evidence: `../../../.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/origin.json`).

The previous buildings are historical and retain their original reports. `6adc78c0` has limited preservation: the producer did not retain the original identity of a signal target; his missing numerical PID was verified without inventing closure by identity. `de2c963f`, `9935515d` and `1d3fdfd9` belong to previous sources. No one attests to the final mobile set; an original rejection remains rejected. The files are in `.internal/dev/reports/mobile-android-standalone-local/`.

Copia `.env.example` a `.env` and configure `EXPO_PUBLIC_API_ORIGIN` with the HTTPS source of the service. This configuration is public and is incorporated into the bundle: do not keep any key, private token or secret. You can also enter the origin on the screen. No economic request is initiated automatically.

HTTP is only supported in a development compilation, with `EXPO_PUBLIC_ALLOW_INSECURE_LOOPBACK=1`, and only for `127.0.0.1` o `localhost` with explicit port. In an Android emulator you can connect the local port with `adb reverse tcp:8080 tcp:8080`. The exception does not support a LAN IP or enable HTTP in the production bundle.

## What it does and what it lacks

The client allows you to create a secp256k1 identity, check the availability of the service, check the source/active/network/destiny/import/commission/ID/decrease and sign after biometric consent and authentication. The firm uses SHA256, IEEE-P1363 and lowS, compatible with the original Node codecs. The new authorization has its own domain and does not replace a Noir test authorization.

The service receives the public identity key and the terms of each permit. You can correlate them. HTTPS and protected storage do not solve that system privacy: there is a lack of credentials/access by role and the adaptation of private graphs, including their metadata. This basis does not support the product's default privacy objective.

Private State starts without quantities available and only incorporates fresh signed readings from connected sources. Amounts saved and receipts of funding are shown with their scope; they do not on their own prove that a note remains unexpended. The Vault retains the same root, intention and work before a POST; a lost response is consulted, without automatically forwarding.

Original note and position paths have backend/SDK/Vault connected and local acceptances described above. Paged block automates execution and connects three local ledgers. There is a lack of financial use in the telephone, operation in public networks, migration and recovery due to abrupt loss, multi-note custody of the device's own shares and the complete private DeFi tour in PAEG. The other four networks are outside this three-network delivery block. The legacy API/SQL executor remains closed; its availability does not credit the economic status of the new original routes.

## Custody and checks

The key is generated by `expo-crypto.getRandomBytesAsync`, is preserved in SecureStore with `requireAuthentication: true` and, on iOS, accessibility `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The public key is stored separately. Changing the biometrics can override the protected key; the client fails and does not replace it quietly. The exported copies are encrypted; private keys are not sent without encrypting the server.

This implementation temporarily retrieves the key **in JavaScript memory** to sign. Mutable buffers are cleaned; JavaScript does not allow the deletion of strings/BigInts or the internal state of the library to be guaranteed. It is not a non-exportable secp256k1 key from Secure Enclave/StrongBox. There is a lack of safety review and biometrics and life cycle check in real devices. SecureStore itself is not a recoverable backup either: uninstalling, losing your phone or changing your biometrics can prevent you from recovering a key.

The host suite checks the signatures against the `ownerFrame` and checker Node originals, rejects substitutions for each field, expiration, highS and unlimited permissions; simulates native APIs to check for ID storage protection, cancellation and retention. These simulations do not prove hardware isolation or acceptance of funds.

The fixed installation uses Expo 57.0.27, React 19.2.3, React Native 0.86.3 and `@noble/curves` 2.4.0. `xcode/uuid` set to 11.1.1 by retaining your API `v4`. The npm audit still points to 15 dependencies as high, spread from `braces <=3.0.3` and `node-forge <=1.4.0` in the Expo/Metro tools; their latest versions are still affected. Expo/RN has not been degraded or hidden. Solving them and reviewing the published bundle are pending work before distributing a Wallet with funds.

Pending advisories: [arms](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

Referencias: [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/), [LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/).

## Main and Tests — Preparation of 17 October

The upper selector changes the environment of the entire portfolio. Main retains existing accounts; Tests uses Ethereum Sepolia, Bitcoin testnet3 and Solana Devnet. The balances and history are filtered over the network. Evaluations with market quotes in Tests are only references, with no monetary value. The private operations and DeFi of this delivery are opened from Tests.

The first activation of the other environment requires biometric authorization to derive its public accounts from the same protected root. It does not replace accounts or generate other words. The encrypted recovery format V4 is preserved: when restoring the original root, reactivating the other environment regenerates the same directions. Ethereum and Solana can share direction between networks; the address alone does not identify the environment.

The server must first install the code that separates the journal by environment and then enable the six networks. The main journal maintains its original path and configuration footprint; the test track lies in `testnet-v2` within the directory of the same owner. In delivery, cancellation and consultation, the new APK includes the `networkId` signed. The old mainnet requests are still working. A review prepared before changing environment is no longer usable; a shipment already signed with uncertain result is only observed when retrying.

The prepared APK is in `.local/mobile/artifacts/android-lianum-environments-20261017/app-release.apk`. Your evidence of compilation and testing is `20261017-environments-*` in `.local/maintenance`. Installation and acceptance on physical Android are pending device availability and compatible deployment.
