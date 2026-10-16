/** Internal wallet orchestration. The vault validates Original replies and
 * signatures; these callbacks never supply financial signers or permissions. */
export async function prepareDevicePagedExecutorPayoutsV5(vault:any,send:(action:string,body:unknown)=>Promise<unknown>){
 const request=await vault.graphExecutorPayoutPreparationCommandV5?.();
 if(request)await send('PREPARE_EXECUTOR_PAYOUTS_V5',request);
}
export async function prepareDevicePagedExecutorInvoicesV5(vault:any,send:(action:string,body:unknown)=>Promise<unknown>){
 const request=await vault.graphExecutorInvoiceCommandV5?.();
 if(request)await send('SIGN_EXECUTOR_PAYOUT_INVOICES_V5',request);
}
