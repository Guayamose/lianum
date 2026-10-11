/** Contracts describe data and fixed owner ports; identity authority remains in
 * the actor family's private maps, never in these structural types. */
/** @typedef {import('@lianum/mobile-protocol/original-account-v2').OriginalAccountAccessV2} Access */
/** @typedef {import('@lianum/mobile-protocol/original-account-v2').OriginalAccountReviewV2} Review */
/** @typedef {import('@lianum/mobile-protocol/original-account-v2').OriginalAccountBindingV2} Binding */
/** @typedef {import('@lianum/mobile-protocol/original-account-private-state-v1').OriginalPrivateStateAccessV1} PrivateAccess */
/** @typedef {import('@lianum/mobile-protocol/original-account-private-state-v1').OriginalPrivateStateReviewV1} PrivateReview */
/** @typedef {import('@lianum/mobile-protocol/original-account-private-state-v1').OriginalPrivateStateObservationV1} PrivateObservation */
/** @typedef {'read'|'reconcile'} Action */
/** @typedef {{requestId:string,kind:'TOP_UP'|'EXIT',ownerOperationRef:string,assetId:string}} NoteBody */
/** @typedef {{journalId:string,accountId:string,lifetime:string,registry:unknown}} AccountConfig */
/** @typedef {{requestId:string,kind:string,state:string}} JournalRow */
/** @typedef {{available:boolean,storageAvailable:boolean,observation:string,busy:boolean,queued:number,revision:number,requests:JournalRow[]}} Snapshot */
/** @typedef {{sequence:number,action:string,requestId:string,state?:string,errorCode?:string|null}} Admission */
/** @typedef {{snapshot():Promise<Snapshot>,reconcile(id:string):Admission,idle():Promise<{admissions:Admission[]}>}} Session */
/** @typedef {{publicView:{summary():Promise<{closed:boolean,identitySHA256:string,keyScopeSHA256:string,processIdentitySHA256:string,processGeneration:number}>}}} Owner */
/** @typedef {{ownerIdentitySHA256:string,keyScopeSHA256:string,processIdentitySHA256:string,processGeneration:number,asset:Binding['asset'],amount:string,recipient:string,role:Binding['role']}} Terms */
/** @typedef {{accountIdentitySHA256:string,generationId:string,originalAccountLifetime:string,termsSHA256:string,terms:Terms}} NoteReview */
/** @typedef {{status:PrivateObservation['status'],asset:PrivateObservation['asset'],observed:PrivateObservation['observed'],balances:PrivateObservation['balances'],backing:PrivateObservation['backing'],requests:PrivateObservation['request'][]}} OwnerObservation */
/** @typedef {{ownerOperationRef:string,request:(NoteBody&{bindingSHA256:string,assetBindingSHA256:string})|null,nativeManualReview:unknown,stage:string,submission:Binding['submission']}} Operation */
/** @typedef {{config:AccountConfig,privateStatus():Promise<{operations:Operation[]}>,ownerView():Promise<OwnerObservation>}} Account */
/** @typedef {{account:Account,body:NoteBody,review:NoteReview}} ApprovalDetails */
/** @typedef {{session:Session,approval:object,owner:Owner,origin:string,devicePublicKey:string}} CreateInput */
/** @typedef {{session:Session,account:Account,owner:Owner}} Membership */
/** @typedef {{sourceSHA256:string}&Record<string,unknown>} RecoveryIdentity */
/** @template T @typedef {{value:T,consumed:boolean}} Permission */
/** @template T @typedef {{id:string,value:T,consumed:boolean}} SavedPermission */
/** @typedef {{accesses:SavedPermission<Access>[],reviews:SavedPermission<Review>[],stateAccesses:SavedPermission<Access>[],stateReviews:SavedPermission<Review>[]}} Challenges */
/** @typedef {{origin:string,pairingId:string,devicePublicKey:string,initial:{body:NoteBody,review:NoteReview},challenges:Challenges}} RecoverySeed */
/** @typedef {RecoverySeed&{schema:'ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1'}} SourceSeed */
/** @typedef {RecoverySeed&{schema:'ORIGINAL_NATIVE_PAIRED_ACTOR_ECONOMIC_RECOVERY_V1',sourceSHA256:string}} EconomicSeed */
/** @typedef {{kind:'ACTOR_PERMISSION_OR_OBSERVATION',method:string}|null} Candidate */
/** @typedef {{schema:'ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1',sourceSHA256:string,ownedProcesses:object[],confirmed:SourceSeed,candidate:Candidate}} SourceSection */
/** @typedef {{closed:boolean,retainedOriginalSession:boolean,retainedOriginalCustody:boolean}} CloseResult */
/** @typedef {{closed:boolean,originalResourcesStopped:boolean}} StopResult */
/** @typedef {{version:2,profile:'PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2',action:Action,binding:Binding,admission:Admission|null,privatePortfolio:null,economicObservation:null,noteCustodyOnDevice:false,nativeEffectsEstablished:false}} Diagnostic */
/** @template T @typedef {T|Promise<T>} Result */
/** @typedef {{challenge(input:unknown):Result<Access>,openReview(input:unknown):Promise<Review>,submit(input:unknown):Promise<Diagnostic>,privateStateChallenge():Result<PrivateAccess>,openPrivateStateReview(input:unknown):Promise<PrivateReview>,readPrivateState(input:unknown):Promise<PrivateObservation>,deviceDepositSignedReadBindingV1(input:unknown):Promise<Binding>,deviceDepositOriginalBinding():Promise<Binding>,close():Result<CloseResult>}} Actor */
/** @typedef {{account:Account,session:Session,owner:Owner,live():void,descriptor:{origin:string,pairingId:string,devicePublicKey:string},sourceRetain(token:object):Promise<Actor>,sourceResume(token:object,wrapper:SourceSection):Promise<Actor>,fence(authority:object):void,capture(token:object):EconomicSeed,stop(token:object):StopResult,abort(token:object):StopResult}} ActorState */
/** @typedef {{
 * session:{assertFlatAccountSession(session:Session):void,flatManualNativeNoteActionTarget(session:Session,action:'reconcile',input:{requestId:string}):object|null},
 * account:{nativeValueAccountManualNoteDetails(approval:object):ApprovalDetails,assertOwnedNativeValueAccountAuthority(account:Account,expected:{owner:Owner}):void,nativeValueOriginalRecoverySourceV1FromAccount(account:Account):string},
 * economic:{assertNativeEconomicRecoveryCaptureV1(authority:object):RecoveryIdentity,nativeEconomicRecoverySectionIdentityV1(token:object,section:'actor'):RecoveryIdentity,consumeNativeEconomicRecoverySectionV1(token:object,section:'actor'):EconomicSeed},
 * source:{nativeSourceRecoveryOriginalReferenceV1(token:object,section:'actor',name:'account'|'session'|'owner'):object,nativeSourceRecoverySectionIdentityV1(token:object,section:'actor'):RecoveryIdentity,retainOriginalNativeSourceSectionV1(token:object,section:'actor',value:SourceSection):Promise<object>,consumeOriginalNativeSourceSectionV1(token:object,section:'actor'):SourceSection,resumeOriginalNativeSourceSectionV1(token:object,section:'actor'):object,updateOriginalNativeSourceSectionV1(handle:object,value:SourceSection):Promise<unknown>},
 * format:{sha(value:unknown):string,genericAccountIdentity(config:AccountConfig):unknown}
 * }} ActorContracts */
export {};
