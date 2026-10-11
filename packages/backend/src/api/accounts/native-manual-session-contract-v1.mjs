/** Data contracts for the native session family. Tokens/references are verified
 * by their original owners; structural types do not confer that authority. */
/** @typedef {'prepare'|'execute'|'reconcile'|'recover'} Action */
/** @typedef {{requestId:string,kind:'TOP_UP'|'GRAPH'|'EXIT',ownerOperationRef:string,assetId:string}} Body */
/** @typedef {{requestId:string,kind:Body['kind'],state:'PREPARING'|'PREPARED'|'SUBMITTING'|'UNKNOWN'|'RECOVERING'|'CONFIRMED',errorCode:string|null}} RequestRow */
/** @typedef {{version:number,revision:number,storageAvailable:boolean,requests:RequestRow[]}} KeeperJournal */
/** @typedef {{busy:boolean,queued:number,revision:number,storageAvailable:boolean,observation:'CURRENT'|'STALE',requests:RequestRow[]}} Snapshot */
/** @typedef {{prepare(input:Body):unknown,execute(id:string):unknown,reconcile(id:string):unknown,recover(id:string):unknown,snapshot():Promise<Snapshot>,close():Promise<unknown>,quiesceForPrivateRecovery():Promise<Snapshot>}} Session */
/** @typedef {{path:string,password:string}} Journal */
/** @typedef {{journalId:string,accountId:string,lifetime:string,registry:unknown}} AccountConfig */
/** @typedef {{originalAccountLifetime:string,identitySHA256:string}&Record<string,unknown>} Review */
/** @typedef {{config:AccountConfig,features:{nativeManualNoteConsent:boolean},authority:object,ownerView():Promise<unknown>,ownerActions:{restoreManualPreparation():Promise<{reconcileOriginal(input:{requestId:string}):Promise<unknown>,originalApproval(requestId:string):object}>}}} Account */
/** @typedef {{claimsEnabled:boolean}} System */
/** @typedef {{account:Account,body:Body,review:Review}} ApprovalDetails */
/** @typedef {{runtime:object,system:System,poolIndex:number,account:Account,journal:Journal}} CreateInput */
/** @typedef {{runtime:object,system:System,account:Account,owner:object}} Membership */
/** @typedef {{revision:number}&Record<string,unknown>} Checkpoint */
/** @typedef {{revision:number,stateSHA256:string}} ParentCheckpoint */
/** @typedef {{pid:number,startTicks:string,uid:number,pgrp:number,session:number}} OwnedProcess */
/** @typedef {{journal:Journal,config:AccountConfig,checkpoint:Checkpoint,parentCheckpoint:{revision:number,commitment:string},pendingCheckpoint:Checkpoint|null}&Record<string,unknown>} KeeperRecord */
/** @typedef {{keeper:KeeperRecord,ownedProcesses:OwnedProcess[]}} KeeperSnapshot */
/** @typedef {{prepare(input:Body):Promise<unknown>,execute(id:string):Promise<unknown>,reconcile(id:string):Promise<unknown>,recover(id:string):Promise<unknown>,snapshot():Promise<KeeperJournal>,restartCoordinator():Promise<unknown>,close():Promise<{closed:boolean}>}} Keeper */
/** @typedef {{journal:Journal,checkpoint:object}} EconomicRecord */
/** @typedef {{capture():Promise<object>,close():Promise<unknown>}} EconomicCapability */
/** @typedef {{sourceSHA256:string,profile?:string}&Record<string,unknown>} Identity */
/** @typedef {{body:Body,review:Review}} SavedNote */
/** @typedef {{schema:'ORIGINAL_NATIVE_SESSION_ECONOMIC_RECOVERY_V1'|'ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1',sourceSHA256:string,poolIndex:number,accountIdentitySHA256:string,journalRevision:number,keeper:KeeperRecord,notes:SavedNote[],economicState?:EconomicRecord}} EconomicSeed */
/** @typedef {{schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SEED_V1',sourceSHA256:string,poolIndex:number,accountIdentitySHA256:string,journalRevision:number,keeper:KeeperRecord,notes:SavedNote[]}} SourceSeed */
/** @typedef {(EconomicSeed|SourceSeed)&{owner:object,source?:boolean,economicState?:EconomicRecord}} Recovery */
/** @typedef {{kind:'KEEPER_CAS',parentCheckpoint:ParentCheckpoint}|{kind:'ADMITTED_KEEPER_OPERATION'}|null} Candidate */
/** @typedef {{schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',sourceSHA256:string,ownedProcesses:OwnedProcess[],confirmed:SourceSeed,candidate:Candidate}} SourceSection */
/** @typedef {{identity:Identity,owner:object,token:object,session:Session,handle:object|null,section:SourceSection|null,busy:boolean,fault:boolean}} SourceContext */
/** @typedef {{runtime:object,system:System,poolIndex:number,nativeAccount:Account,graphs:Map<string,object>,notes:Map<string,object>,journal:Journal,durableKeeper:Keeper,nativeCaptured:boolean,nativeFence:Promise<Snapshot>|null,nativeIdentity:Identity|null,nativeRecord:EconomicSeed|null,nativeCapturePromise:Promise<EconomicSeed>|null,nativeKeeperCaptureStarted:boolean,nativeStopped:boolean,nativeReviews:SavedNote[],nativeSource?:SourceContext,economicInstallation?:boolean,economicAcquisition?:Promise<EconomicCapability>,economicState?:EconomicCapability,economicJournal?:Journal,economicCapture?:Promise<object>}} State */
/** @typedef {{session:Session,bindManualNote(approval:object):Body,bindManualGraph(approval:object):Body}} Joined */
/** @typedef {{catalogues:object[],nativeAccounts:{runtime:object,system:System,account:Account,session:Session}[],wrappedPortfolios:object[],journal:Journal}} EconomicInput */
/** @typedef {{
 * createDurableGenericAccountKeeperV1(input:{config:AccountConfig,journal:Journal,authority:object}):Promise<Keeper>,
 * reopenDurableGenericAccountKeeperV1(input:{config:AccountConfig,journal:Journal,authority:object},record:KeeperRecord):Promise<Keeper>,
 * captureDurableGenericAccountKeeperV1(keeper:Keeper):Promise<KeeperRecord>,
 * readOriginalNativeSourceSessionKeeperCandidateV1(keeper:Keeper,session:Session):Promise<ParentCheckpoint>,
 * readOriginalNativeSourceSessionKeeperV1(keeper:Keeper,session:Session):Promise<KeeperSnapshot>,
 * bindOriginalNativeSourceSessionKeeperV1(keeper:Keeper,session:Session):Promise<KeeperSnapshot>
 * }} KeeperResources */
/** @typedef {{createFlatAccountSession(input:{keeper:Keeper,ownerHandoff:{ownerView():Promise<unknown>}}):Promise<Session>}} SessionResources */
/** @typedef {{
 * createOriginalWalletEconomicStateV1(input:EconomicInput):Promise<EconomicCapability>,
 * openOriginalWalletEconomicStateV1(input:EconomicInput&{checkpoint:object}):Promise<EconomicCapability>,
 * reopenOriginalWalletEconomicStateAfterCrashV1(input:Omit<EconomicInput,'journal'>&{journal:{path:string}}):Promise<EconomicCapability>,
 * assertOriginalWalletEconomicStateV1(capability:EconomicCapability):void,
 * assertOriginalWalletEconomicStateJournalV1(capability:EconomicCapability,journal:Journal):void,
 * originalWalletEconomicStateBindingsV1(capability:EconomicCapability):{session:Session}[]
 * }} EconomicResources */
/** @typedef {{
 * account:{assertOriginalNativeAccountSourceV1(account:Account,identity:Identity):void,assertOwnedNativeValueAccountAuthority(account:Account,expected:{runtime:object,system:System,poolIndex:number,owner?:object}):void,nativeValueAccountManualGraphDetails(approval:object):ApprovalDetails,assertNativeValueAccountManualGraphExecution(approval:object):void,nativeValueAccountManualNoteDetails(approval:object):ApprovalDetails},
 * economic:{assertNativeEconomicRecoveryCaptureV1(authority:object):Identity,nativeEconomicRecoverySectionIdentityV1(token:object,section:'session'):Identity,consumeNativeEconomicRecoverySectionV1(token:object,section:'session'):EconomicSeed,nativeValueOriginalRecoverySourceV1(runtime:object,system:System):string},
 * source:{nativeSourceRecoverySectionIdentityV1(token:object,section:'session'):Identity,retainOriginalNativeSourceSectionV1(token:object,section:'session',value:SourceSection):Promise<object>,consumeOriginalNativeSourceSectionV1(token:object,section:'session'):SourceSection,updateOriginalNativeSourceSectionV1(handle:object,value:SourceSection):Promise<unknown>,resumeOriginalNativeSourceSectionV1(token:object,section:'session'):object|Promise<object>,nativeSourceRecoveryOwnedProcessV1(token:object,section:'session',pid:number):Promise<OwnedProcess>},
 * resources:{loadDurableKeeper():Promise<KeeperResources>,loadAccountSession():Promise<SessionResources>,loadEconomicState():Promise<EconomicResources>},
 * format:{sha(value:unknown):string,genericAccountIdentity(config:AccountConfig):unknown}
 * }} SessionContracts */
export {};
