/** Checks a saved copy against the same live encrypted Vault and preparation.
 * This module creates no key, SDK permission or custody authority. */
export type DeviceRecoveryCheckpointV1=Readonly<{rootId:string;noteRevision:number;descriptorSHA256:string;revision:number;recordSHA256:string}>;
export type DeviceRecoveryPreparationV1='SHARE'|'GRAPH';
type Prepared=Readonly<{draft:object;witness:unknown}>;
type Connection={vault:{recoveryCheckpoint():Promise<DeviceRecoveryCheckpointV1>}};
export type DeviceRecoveryCopyV1<C,P extends Prepared>=Readonly<{selected:C;kind:DeviceRecoveryPreparationV1;prepared:P;checkpoint:DeviceRecoveryCheckpointV1}>;
export function sameDeviceRecoveryCheckpointV1(a:DeviceRecoveryCheckpointV1,b:DeviceRecoveryCheckpointV1){return a.rootId===b.rootId&&a.noteRevision===b.noteRevision&&a.descriptorSHA256===b.descriptorSHA256&&a.revision===b.revision&&a.recordSHA256===b.recordSHA256;}
type CheckPorts<C,P extends Prepared>={readCopy:()=>DeviceRecoveryCopyV1<C,P>|null;assertCurrent:(ticket:number,selected:C)=>void;readCheckpoint?:()=>Promise<DeviceRecoveryCheckpointV1>};
export async function verifyDeviceRecoveryCopyV1<C extends Connection,P extends Prepared>(selected:C,kind:DeviceRecoveryPreparationV1,witness:unknown,ticket:number,ports:CheckPorts<C,P>){
 const cut=ports.readCopy();if(!cut||cut.selected!==selected||cut.kind!==kind||cut.prepared.witness!==witness)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED');
 const checkpoint=await (ports.readCheckpoint?.()??selected.vault.recoveryCheckpoint());ports.assertCurrent(ticket,selected);
 if(ports.readCopy()!==cut||!sameDeviceRecoveryCheckpointV1(cut.checkpoint,checkpoint))throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED');
}
export async function reviewDeviceRecoveryPreparationV1<C extends Connection,G extends Prepared,S extends Prepared>(selected:C,ticket:number,ports:CheckPorts<C,G|S>&{
 readGraph:()=>G|null;readShare:()=>S|null;reviewGraph:(selected:C,draft:G['draft'],ticket:number,witness:G['witness'])=>Promise<unknown>;
 reviewShare:(selected:C,draft:S['draft'],ticket:number,witness:S['witness'])=>Promise<unknown>;clearPreparation:()=>void;
}){
 const cut=ports.readCopy();if(!cut||cut.selected!==selected||(cut.kind==='GRAPH'?ports.readGraph():ports.readShare())!==cut.prepared)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED');
 await verifyDeviceRecoveryCopyV1(selected,cut.kind,cut.prepared.witness,ticket,ports);
 if(cut.kind==='GRAPH'){const prepared=ports.readGraph();if(!prepared||prepared!==cut.prepared)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED');await ports.reviewGraph(selected,prepared.draft,ticket,prepared.witness);}
 else{const prepared=ports.readShare();if(!prepared||prepared!==cut.prepared)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED');await ports.reviewShare(selected,prepared.draft,ticket,prepared.witness);}
 ports.clearPreparation();
}
