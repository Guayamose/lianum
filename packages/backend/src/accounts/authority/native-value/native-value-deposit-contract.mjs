/** Account D26 state and dependency contracts. Identity remains with the account,
 * bridge, recipient and observer owners; these types grant no authority. */
/** @typedef {import('@lianum/mobile-protocol/device/native-deposit-v2').DeviceDepositConsentEitherV2} Consent */
/** @typedef {import('@lianum/mobile-protocol/device-deposit-consent-v1').DeviceDepositStatementV1} Statement */
/** @typedef {import('@lianum/mobile-protocol/device-deposit-consent-v1').DeviceDepositWitnessV1} Witness */
/** @typedef {'PROVING'|'PROVED'|'FAILED'|'FUNDING_UNKNOWN'|'CONFIRMED'} Stage */
/** @typedef {{number:string,hash:string,timestamp:string}} Head */
/** @typedef {{root:string,index:number,leaf:string,siblings:string[]}} Membership */
/** @typedef {{proof:string,publicInputs:string[]}} Proof */
/** @typedef {Proof&{metrics:{acceptedResult:boolean}&Record<string,unknown>}} ProofResult */
/** @typedef {{kind:'ORIGINAL_CONSENT_V1',jobId:string,consentSHA256:string,witnessSHA256:string}} Authorization */
/** @typedef {{authorization:Authorization}&Record<string,unknown>} PrivatePacket */
/** @typedef {{close():Promise<unknown>}} ProofLifetime */
/** @typedef {ProofLifetime&{proveEncrypted(packet:PrivatePacket,binding:Authorization):Promise<ProofResult>}} PrivateClient */
/** @typedef {ProofLifetime&{prove(relation:'deposit_balance',witness:Witness,words:string[],label:string):Promise<ProofResult>}} Prover */
/** @typedef {{transactionHash:string}&Record<string,unknown>} Receipt */
/** @typedef {{transaction:{hash:string},receipt:{blockHash:string}}&Record<string,unknown>} Observation */
/** @typedef {{kind:string,calldata:string,calldataSHA256:string,publicInputs:string[],statement:Statement,before:unknown,epoch:string,transactionHash:string|null,dispatchLatched:boolean,ownerConfirmed:boolean,observation:Observation|null}} Submission */
/** @typedef {{
 * jobId:string,consent:Consent,stage:Stage,proof:Proof|null,proofSHA256:string|null,
 * publicInputsSHA256:string|null,nullifier:string|null,submission:Submission|null,
 * observation:Inclusion|null,errorCode:string|null,fundingConsent?:Consent,originalSourceProofReceipt?:unknown
 * }} Row */
/** @typedef {{
 * version:number,profile:string,jobId:string,rootId:string,commitment:string,amount:string,
 * assetId:string,pool:string,scope:string,policy:string,genesis:string,domainCommitment:string,
 * proofSHA256:string|null,publicInputsSHA256:string|null,transactionHash:string,calldataSHA256:string,
 * receiptBlockHash:string,head:Head,path:Membership,nullifier:string|null,observedAt:number,expiresAt:number,
 * nativeEffectsEstablished:boolean,mobileKeyCustody:boolean,backendOpeningDisclosure:string,mobileCanonicalRpcVerification:boolean
 * }} Inclusion */
/** @typedef {{
 * jobId:string,stage:Stage,consentFields:{statement:Statement,rootId:string,noteRevision:number,
 * jobId:string,witnessSHA256:string,proofSHA256:string|null,publicInputsSHA256:string|null},
 * statement:Statement,observation:Inclusion|null,errorCode:string|null,authorizationSHA256?:string
 * }} PublicStatus */
/** @typedef {{
 * header:{number:string},head:Head,ledger:{commitments:string[],nullifiers:string[],
 * tree:{path(index:number):Membership},publicState:{leaves:number,liveReservations:number,spent:number,outputCapacity:number}}
 * }} View */
/** @typedef {{
 * rows():Row[]|undefined,profile():string|undefined,workerProfile():string|undefined,
 * append(row:Row):Promise<unknown>,patch(id:string,fields:Partial<Row>):Promise<unknown>,
 * installProfile(profile:string):Promise<unknown>,installWorkerProfile(profile:string):Promise<unknown>
 * }} Journal */
/** @typedef {{
 * bare(value:string):string,reference(value:string):unknown,copy<T>(value:T):T,sha(value:unknown):string,
 * transportProof(result:ProofResult):Proof,sourceProofReceiptFrame(relation:'deposit_balance',label:string,proof:ProofResult):unknown,
 * validateObservation(input:{identity:object,artifact:unknown,submission:Submission,authorization:null,observation:Observation}):unknown,
 * calldataHash(calldata:string):string,walletInputPublicWords(relation:'deposit_balance',witness:Witness):string[],
 * decodeWalletPoolInputs(relation:'deposit_balance',words:string[]):Statement,
 * nullifier(scope:Buffer,commitment:Buffer,secret:Buffer):Buffer,
 * encodeTransaction(method:'depositBalance',proof:Proof):string
 * }} Format */
/** @typedef {{
 * createNativeEconomicNoteProofProcessV1(role:'owner'):Prover,
 * createProofProcess(input:{purpose:'owner',modes:['deposit_balance']}):Prover,
 * readOriginalNativePrivateDepositDerivationV2(client:PrivateClient,result:ProofResult):{jobId:string,commitment:string,nullifier:string,consentSHA256:string,witnessSHA256:string},
 * onProof(value:{label:string,relation:'deposit_balance',role:string,proof:ProofResult}):Promise<unknown>,
 * onPrivateAudit(value:{reference:string,phase:string,stage:'PROVED'|'FAILED'}):Promise<unknown>
 * }} Proofs */
/** @typedef {{
 * originalBridges:{isOriginalNativePrivateWorkerDepositBridgeV3(bridge:object):boolean,isOriginalNativePrivateDepositBridgeV2(bridge:object):boolean},
 * journal:Journal,
 * lifecycle:{continueWork():void,exclusive<T>(work:()=>Promise<T>):Promise<T>,healthy():Promise<unknown>,isUnavailable():boolean,trackProof(client:ProofLifetime):void,releaseProof():void},
 * profile:{nativeNote:boolean,wrapped:boolean,nativeAsset:boolean,identitySHA256:string,accountIdentity:object,config:{lifetime:string},identity:{domainCommitment:string},asset:{assetId:string,scope:string,policy:string,codeHash:string,assetIdentity:string,pool:string,genesis:string}},
 * chain:{reader:{read():Promise<View>,assertCurrent(view:View):Promise<unknown>},observer:{readTransaction(input:{kind:'deposit',identitySHA256:string,transactionHash:string|null,calldataSHA256:string}):Promise<Observation|null>},
 * pool:{artifact:unknown,address:string},system:{verify(relation:'deposit_balance',proof:Buffer,words:string[],block:string):Promise<boolean>},
 * runtime:{receipt(hash:string):Promise<Receipt|null>,checkReceipt(receipt:Receipt):Promise<unknown>,send(label:string,request:{to:string,data:string,value:string}):Promise<Receipt>}},
 * deposits:{privateWorkerEnabled():boolean},reservations:{reservationRows():readonly unknown[]},exits:{exitRows():readonly unknown[]},format:Format,
 * continuity:{nativeSourceOriginal:object|null,recovery:{native?:boolean,source?:boolean,sourceObservationRequired?:boolean}|null},proofs:Proofs,
 * operations:{tokenFundingReady(amount:string):Promise<unknown>,snapshotFromView(view:View):unknown}
 * }} DepositPorts */
/** @typedef {{action:Consent['action'],consent:Consent,witness:unknown,privateD26?:boolean,client?:PrivateClient|null,signature?:string|null}} Request */
export {};
