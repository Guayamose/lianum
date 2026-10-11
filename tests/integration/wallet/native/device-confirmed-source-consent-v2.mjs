/** The fixed public-consent handoff used after the private proof exchange.
 * Preserve signing before latching and the explicit absent witness argument. */
/** @typedef {import('@lianum/mobile-protocol/device/source-note-v1').ExternalFlatConsent} Consent */
/**
 * @template Row
 * @param {Consent} consent
 * @param {{host:{sign:(consent:Consent)=>Promise<string>,vault:{latch:(consent:Consent)=>Promise<unknown>,accept:(row:Row)=>Promise<unknown>}},client:{submit:(consent:Consent,signature:string,witness:null)=>Promise<Row>}}} ports
 * @returns {Promise<Row>}
 */
export async function performConfirmedSourceConsentV2(consent,{host,client}){
 const signature=await host.sign(consent);await host.vault.latch(consent);const row=await client.submit(consent,signature,null);await host.vault.accept(row);return row;
}
