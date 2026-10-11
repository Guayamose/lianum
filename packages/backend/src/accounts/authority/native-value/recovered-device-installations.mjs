/** Rehydrates one original recovered installation from authenticated account
 * records. The issued flag is private to this instance and shared by all three
 * reopen modes. This family emits data only; account/actor capabilities remain
 * under the canonical owner's private maps. */
import assert from 'node:assert/strict';
/** @typedef {Record<string,string>} Descriptor */
/** @typedef {{proof:string,publicInputs:string[]}} Proof */
/** @typedef {{config:Record<string,string>}} Preparation */
/** @typedef {{nativePreparation:Preparation,invoiceSignatures:unknown}} SourcePreparation */
/** @typedef {{slot:number,deliveryRiskSalt:string,custodyIdentitySHA256:string}} RetainedProvider */
/** @typedef {{slot:number,deliveryRiskSalt:string,custody:object}} CurrentProvider */
/** @typedef {{descriptor:Descriptor,preparation:unknown,providers:RetainedProvider[]}} RetainedInstallation */
/** @typedef {{descriptor:Descriptor,sourcePreparation:unknown,providers:CurrentProvider[]}} CurrentInstallation */
/** @typedef {{quoteId:string,descriptor:Descriptor,preparation:unknown,invoiceSignatures:unknown,depositJobId:string,rootId:string}} Quote */
/** @typedef {{jobId:string,consent:{statement:{output:string}},nullifier:string}} Deposit */
/** @typedef {{jobId:string,stage:string,consent:Record<string,unknown>&{quoteId:string,depositJobId:string,custody:{rootId:string},statement:{inputCommitment:string,inputNullifier:string}},
 * nativeBinding:{settleBefore:string,reserveNullifier:string},nativeOutcome:string|null,nativeTerminal:{transactionHash:string}|null,nativeLatched:boolean,nativeRecoveryLatched:boolean,
 * submission:{dispatchLatched:boolean}|null,authorization:Proof,rolePackets:unknown,proofSHA256:string,publicInputsSHA256:string,
 * observation:{transactionHash:string},liveRecoveryArm:import('./native-value-live-recovery.mjs').Arm|null}} Reservation */
/** @typedef {{stage:string,proof:Proof|null,proofSHA256:string,publicInputsSHA256:string,originalPublicProofMetricsFrame?:unknown,originalPublicProofMetrics?:unknown}} Exit */
/** @typedef {{header:{number:string},ledger:{nullifiers:string[]}}} View */
/** @typedef {{receipt(hash:string):Promise<object|null>,checkReceipt(receipt:object):Promise<unknown>,assertCanonical(receipt:object):Promise<unknown>}} Runtime */
/** @typedef {{verify(relation:string,proof:Buffer,inputs:string[],block:string):Promise<boolean>}} System */
/** @param {{lifecycle:{exclusive<T>(work:()=>Promise<T>):Promise<T>,healthy():Promise<unknown>,continueWork():void},
 * chain:{runtime:Runtime,system:System,poolIndex:number,nativeExecution:{snapshot(id:string):{outcome:string|null}}|null,reader:{read():Promise<View>,assertCurrent(view:View):Promise<unknown>}},
 * continuity:{recovery:{native?:boolean,liveArmed?:boolean,source?:boolean}|null,nativeSourceOriginal:{clock:object,nativeRuntime:object}|null,wrapped:boolean},
 * records:{recoveredInstallations:RetainedInstallation[],reservationRows():Reservation[],reservationObservation(row:Reservation):Promise<unknown>,
 * reservationSubject(id:string,rootId:string,descriptor:Descriptor):Deposit,originalQuote(id:string):Quote,exitRows():Exit[],exitPublic(row:Exit):unknown,
 * findExecutionInstallation(bridge:object):CurrentInstallation|undefined,readRecord():{data:{deviceReservationQuotes?:Quote[]}}},
 * format:{sha(value:unknown):string,copy<T>(value:T):T,byteSHA(bytes:Uint8Array):string},
 * validation:{identity:{domain:Record<string,string>},sourceInstallationPreparation(value:unknown):SourcePreparation,
 * validateGenericBalanceNativePreparation(value:unknown):Preparation,flatAccountGraphBinding(value:unknown,identity:unknown):unknown,
 * nativeRecoveryProviderReviewV1(custody:object,refs:{runtime:Runtime,system:System,poolIndex:number}):unknown,
 * assertOriginalNativeSourceObservedClockV1(clock:object,refs:{runtime:Runtime,nativeRuntime:object}):unknown,
 * restoreNativeDeviceOriginalW39MetricsFrameV1(frame:unknown,proof:Proof):unknown}}} ports */
export function createRecoveredDeviceInstallations(ports) {
 const {lifecycle,chain,continuity,records,format,validation}=ports;
 const {exclusive,healthy,continueWork}=lifecycle;
 const {runtime,system,poolIndex,nativeExecution,reader}=chain;
 const {recovery,nativeSourceOriginal,wrapped}=continuity;
 const {recoveredInstallations,reservationRows,reservationObservation,reservationSubject,originalQuote,exitRows,exitPublic}=records;
 const {sha,copy,byteSHA}=format;
 const {identity,sourceInstallationPreparation,validateGenericBalanceNativePreparation,flatAccountGraphBinding,nativeRecoveryProviderReviewV1,
  assertOriginalNativeSourceObservedClockV1,restoreNativeDeviceOriginalW39MetricsFrameV1}=validation;
 let recoveredDeviceInstallationIssued=false;
  /** @param {object} bridge */
  function originalSourceContinuationInstallation(bridge) {
    assert.ok(nativeSourceOriginal&&recovery?.source,'NATIVE_SOURCE_ORIGINAL_REOPEN_REQUIRED');
    assertOriginalNativeSourceObservedClockV1(nativeSourceOriginal.clock,{runtime,nativeRuntime:nativeSourceOriginal.nativeRuntime});
    const installation=records.findExecutionInstallation(bridge);
    assert.ok(installation?.sourcePreparation,'NATIVE_SOURCE_ORIGINAL_INSTALLATION_REQUIRED');
    const retained=recoveredInstallations.filter(row=>sha(row.descriptor)===sha(installation.descriptor));
    assert.equal(retained.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
    assert.deepEqual(sourceInstallationPreparation(installation.sourcePreparation),sourceInstallationPreparation(retained[0].preparation),
      'NATIVE_SOURCE_ORIGINAL_INSTALLATION_CHANGED');
    const providers=installation.providers.map(row=>({slot:row.slot,deliveryRiskSalt:row.deliveryRiskSalt,
      custodyIdentitySHA256:sha(nativeRecoveryProviderReviewV1(row.custody,{runtime,system,poolIndex}))}));
    assert.deepEqual(providers,retained[0].providers,'NATIVE_ACCOUNT_ORIGINAL_PROVIDERS_CHANGED');
    return installation;
  }
 const installations={
    nativeDeviceRecoveredProofs(){return exclusive(async()=>{
      await healthy();assert.ok(recovery?.native&&!wrapped&&recoveredDeviceInstallationIssued,'NATIVE_DEVICE_RECOVERY_ORIGINAL_INSTALLATION_REQUIRED');
      const rows=exitRows();assert.ok(rows.length<=2,'NATIVE_DEVICE_RECOVERY_FIXED_EXIT_COUNT');
      return rows.map(row=>{assert.ok((row.originalPublicProofMetricsFrame||row.originalPublicProofMetrics)&&row.proof&&row.stage!=='PROVING','NATIVE_DEVICE_RECOVERY_ORIGINAL_W39_PENDING');
        assert.equal(row.proofSHA256,byteSHA(Buffer.from(row.proof.proof,'hex')));assert.equal(row.publicInputsSHA256,sha(row.proof.publicInputs));
        return{relation:'withdraw_balance',label:'device-exit-w39',proof:{...copy(row.proof),metrics:row.originalPublicProofMetricsFrame?restoreNativeDeviceOriginalW39MetricsFrameV1(row.originalPublicProofMetricsFrame,row.proof):copy(row.originalPublicProofMetrics)},status:exitPublic(row)};});
    });},
    /** @param {Descriptor} descriptor @param {object} providerCustody */
    nativeDeviceRecoveredInstallation(descriptor,providerCustody){return exclusive(async()=>{
      await healthy();assert.ok(recovery?.native&&!wrapped&&nativeExecution!==null,'NATIVE_DEVICE_RECOVERY_NATIVE_ACCOUNT_REQUIRED');
      assert.equal(recoveredDeviceInstallationIssued,false,'NATIVE_DEVICE_RECOVERY_INSTALLATION_ONCE');
      const bindings=recoveredInstallations.filter(value=>sha(value.descriptor)===sha(descriptor));
      assert.equal(bindings.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
      const jobs=reservationRows().filter(row=>['origin','pairingId','devicePublicKey'].every(name=>row.consent[name]===descriptor[name]));
      assert.equal(jobs.length,1,'NATIVE_DEVICE_RECOVERY_FIXED_SINGLE_RESERVATION');const row=jobs[0],quote=originalQuote(row.consent.quoteId);
      assert.equal(row.stage,'RESERVED');assert.equal(row.nativeOutcome,'RECOVERED','NATIVE_DEVICE_RECOVERY_ORIGINAL_F_REQUIRED');
      assert.ok(row.nativeTerminal&&row.nativeLatched&&row.nativeRecoveryLatched&&row.submission?.dispatchLatched,'NATIVE_DEVICE_RECOVERY_ORIGINAL_TERMINAL_LATCHES');
      assert.equal(nativeExecution.snapshot(row.jobId).outcome,'RECOVERED');assert.equal(sha(quote.descriptor),sha(descriptor));
      const preparation=validateGenericBalanceNativePreparation(quote.preparation),deposit=reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,descriptor);
      assert.equal(quote.depositJobId,deposit.jobId);assert.equal(quote.rootId,row.consent.custody.rootId);
      assert.equal(row.consent.statement.inputCommitment,deposit.consent.statement.output);assert.equal(row.consent.statement.inputNullifier,deposit.nullifier);
      for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(preparation.config[name],identity.domain[name],'NATIVE_DEVICE_RECOVERY_ORIGINAL_DOMAIN_CHANGED');
      assert.equal(byteSHA(Buffer.from(row.authorization.proof,'hex')),row.proofSHA256);assert.equal(sha(row.authorization.publicInputs),row.publicInputsSHA256);
      assert.deepEqual(row.nativeBinding,flatAccountGraphBinding({authorization:row.authorization,rolePackets:row.rolePackets},identity));
      const providers=bindings[0].providers.map(value=>{assert.equal(value.slot,0);
        assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody,{runtime,system,poolIndex})),value.custodyIdentitySHA256,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PROVIDER_CHANGED');
        return Object.freeze({slot:0,custody:providerCustody,deliveryRiskSalt:value.deliveryRiskSalt});});assert.equal(providers.length,1);
      await reservationObservation(row);const receipt=await runtime.receipt('0x'+row.nativeTerminal.transactionHash);assert.ok(receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
      const view=await reader.read();assert.ok(view.ledger.nullifiers.includes('0x'+row.consent.statement.inputNullifier));assert.ok(view.ledger.nullifiers.includes('0x'+row.nativeBinding.reserveNullifier));
      assert.equal(await system.verify('authorization',Buffer.from(row.authorization.proof,'hex'),row.authorization.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),
        view.header.number),true,'NATIVE_DEVICE_RECOVERY_DEPLOYED_U_REJECTED');await reader.assertCurrent(view);continueWork();
      recoveredDeviceInstallationIssued=true;
      return Object.freeze({nativePreparation:preparation,invoiceSignatures:copy(quote.invoiceSignatures),providers:Object.freeze(providers),descriptor:copy(descriptor),
        parentJobId:row.jobId,depositJobId:deposit.jobId,rootId:row.consent.custody.rootId});
    });},

    /** @param {Descriptor} descriptor @param {object} providerCustody */
    nativeDeviceLiveArmedInstallation(descriptor,providerCustody){return installations.nativeDeviceObservedInstallation(descriptor,providerCustody,false);},
    /** @param {Descriptor} descriptor @param {object} providerCustody */
    nativeDeviceSourceInstallation(descriptor,providerCustody){return exclusive(async()=>{
      await healthy();assert.ok(nativeSourceOriginal&&recovery?.source,'NATIVE_SOURCE_ORIGINAL_REOPEN_REQUIRED');
      assert.equal(recoveredDeviceInstallationIssued,false,'NATIVE_DEVICE_RECOVERY_INSTALLATION_ONCE');
      const bindings=recoveredInstallations.filter(value=>sha(value.descriptor)===sha(descriptor));
      assert.equal(bindings.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
      const retained=bindings[0],preparation=sourceInstallationPreparation(retained.preparation);
      const providers=retained.providers.map(value=>{assert.equal(value.slot,0);
        assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody,{runtime,system,poolIndex})),value.custodyIdentitySHA256,
          'NATIVE_DEVICE_RECOVERY_ORIGINAL_PROVIDER_CHANGED');
        return Object.freeze({slot:0,custody:providerCustody,deliveryRiskSalt:value.deliveryRiskSalt});});
      assert.equal(providers.length,1);
      for(const quote of records.readRecord().data.deviceReservationQuotes??[])if(sha(quote.descriptor)===sha(descriptor)){
        assert.deepEqual(quote.preparation,preparation.nativePreparation,'DEVICE_RESERVATION_PREPARATION_CHANGED');
        assert.deepEqual(quote.invoiceSignatures,preparation.invoiceSignatures,'DEVICE_RESERVATION_INVOICES_CHANGED');
      }
      const jobs=reservationRows().filter(row=>['origin','pairingId','devicePublicKey'].every(name=>row.consent[name]===descriptor[name]));
      assert.ok(jobs.length<=1,'NATIVE_DEVICE_RECOVERY_FIXED_SINGLE_RESERVATION');
      if(jobs[0]?.liveRecoveryArm)return {armed:true};
      const view=await reader.read();await reader.assertCurrent(view);continueWork();
      recoveredDeviceInstallationIssued=true;
      return Object.freeze({...preparation,providers:Object.freeze(providers),descriptor:copy(descriptor),state:'ORIGINAL_PRE_ARM'});
    }).then(value=>'armed' in value&&value.armed===true?installations.nativeDeviceObservedInstallation(descriptor,providerCustody,true):value);},
    /** @param {Descriptor} descriptor @param {object} providerCustody @param {boolean} source */
    nativeDeviceObservedInstallation(descriptor,providerCustody,source){return exclusive(async()=>{
      await healthy();assert.ok(recovery?.native&&(source?recovery.source&&nativeSourceOriginal:recovery.liveArmed)&&!wrapped&&nativeExecution!==null,'NATIVE_LIVE_ARMED_ORIGINAL_REOPEN_REQUIRED');
      assert.equal(recoveredDeviceInstallationIssued,false,'NATIVE_DEVICE_RECOVERY_INSTALLATION_ONCE');
      const bindings=recoveredInstallations.filter(value=>sha(value.descriptor)===sha(descriptor));assert.equal(bindings.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
      const jobs=reservationRows().filter(row=>['origin','pairingId','devicePublicKey'].every(name=>row.consent[name]===descriptor[name]));
      assert.equal(jobs.length,1,'NATIVE_DEVICE_RECOVERY_FIXED_SINGLE_RESERVATION');const row=jobs[0],arm=row.liveRecoveryArm,quote=originalQuote(row.consent.quoteId);
      assert.equal(row.stage,'RESERVED');
      assert.ok(arm&&(['ARMED','FIRING','UNKNOWN','RECOVERED'].includes(arm.state)||(source&&arm.state==='DISARMED')),'NATIVE_LIVE_ARMED_ORIGINAL_PERMISSION_REQUIRED');
      const recovered=arm.state==='RECOVERED';
      if(recovered){assert.equal(row.nativeOutcome,'RECOVERED');assert.ok(row.nativeTerminal&&row.nativeRecoveryLatched&&row.submission?.dispatchLatched,'NATIVE_DEVICE_RECOVERY_ORIGINAL_TERMINAL_LATCHES');}
      else{assert.equal(row.nativeOutcome,null);assert.equal(row.nativeTerminal,null);}
      assert.match(arm.armSHA256,/^[0-9a-f]{64}$/);assert.equal(arm.settleBefore,row.nativeBinding.settleBefore);
      assert.equal(arm.nativeBindingSHA256,sha(row.nativeBinding));assert.equal(arm.reservationTransactionHash,row.observation.transactionHash);
      assert.equal(arm.lossClause,'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
      if(arm.state==='DISARMED')assert.equal(row.nativeRecoveryLatched,false,'NATIVE_SOURCE_ORIGINAL_DISARM_UNLATCHED');
      else if(arm.state!=='ARMED')assert.equal(row.nativeRecoveryLatched,true,'NATIVE_LIVE_ARMED_UNKNOWN_ONLY_OBSERVE');
      assert.equal(nativeExecution.snapshot(row.jobId).outcome,recovered?'RECOVERED':null);assert.equal(sha(quote.descriptor),sha(descriptor));
      const preparation=validateGenericBalanceNativePreparation(quote.preparation),deposit=reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,descriptor);
      assert.equal(quote.depositJobId,deposit.jobId);assert.equal(quote.rootId,row.consent.custody.rootId);
      assert.equal(row.consent.statement.inputCommitment,deposit.consent.statement.output);assert.equal(row.consent.statement.inputNullifier,deposit.nullifier);
      for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(preparation.config[name],identity.domain[name],'NATIVE_DEVICE_RECOVERY_ORIGINAL_DOMAIN_CHANGED');
      assert.equal(byteSHA(Buffer.from(row.authorization.proof,'hex')),row.proofSHA256);assert.equal(sha(row.authorization.publicInputs),row.publicInputsSHA256);
      assert.deepEqual(row.nativeBinding,flatAccountGraphBinding({authorization:row.authorization,rolePackets:row.rolePackets},identity));
      const providers=bindings[0].providers.map(value=>{assert.equal(value.slot,0);
        assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody,{runtime,system,poolIndex})),value.custodyIdentitySHA256,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PROVIDER_CHANGED');
        return Object.freeze({slot:0,custody:providerCustody,deliveryRiskSalt:value.deliveryRiskSalt});});assert.equal(providers.length,1);
      await reservationObservation(row);
      if(recovered){assert.ok(row.nativeTerminal,'NATIVE_DEVICE_RECOVERY_ORIGINAL_TERMINAL_LATCHES');const receipt=await runtime.receipt('0x'+row.nativeTerminal.transactionHash);assert.ok(receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);}
      const view=await reader.read();assert.ok(view.ledger.nullifiers.includes('0x'+row.consent.statement.inputNullifier));
      assert.equal(view.ledger.nullifiers.includes('0x'+row.nativeBinding.reserveNullifier),recovered,'NATIVE_LIVE_ARMED_TERMINAL_RECONCILE_REQUIRED');
      assert.equal(await system.verify('authorization',Buffer.from(row.authorization.proof,'hex'),row.authorization.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),view.header.number),true,'NATIVE_DEVICE_RECOVERY_DEPLOYED_U_REJECTED');
      await reader.assertCurrent(view);continueWork();recoveredDeviceInstallationIssued=true;
      return Object.freeze({nativePreparation:preparation,invoiceSignatures:copy(quote.invoiceSignatures),providers:Object.freeze(providers),descriptor:copy(descriptor),
        parentJobId:row.jobId,depositJobId:deposit.jobId,rootId:row.consent.custody.rootId,armSHA256:arm.armSHA256,settleBefore:arm.settleBefore,state:arm.state});
    });},

  originalSourceContinuationInstallation
 };
 return Object.freeze(installations);
}
