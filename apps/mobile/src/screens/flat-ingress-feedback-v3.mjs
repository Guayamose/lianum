/** Closed original producer failures only; never interpret an arbitrary HTTP
 * message as a policy, minimum amount or a permission. */
const messages=Object.freeze({
 FLAT_LEGACY_FRESH_DEPOSIT_DISABLED:'Esta conexión antigua no admite nuevos ingresos. Conserva sus fondos y utiliza la consulta, retirada o recuperación original; un ingreso nuevo necesita una conexión actual.',
 FLAT_DEPOSIT_BELOW_MINIMUM:'El ingreso no alcanza el mínimo original de este activo y pool. Consulta ese importe en la conexión actual antes de autorizar. Este mínimo no impide retirar o recuperar fondos.',
 FLAT_MINIMUM_LOCAL_ACCEPTANCE_NOT_RELEASED:'El ingreso de esta generación todavía no está habilitado. Puedes consultar y recuperar las custodias anteriores; no autorices otro ingreso hasta que el servicio lo habilite.',
});
export function originalFlatIngressFailureMessageV3(error){
 if(!(error instanceof Error))return null;
 for(const key of ['code','message']){const descriptor=Object.getOwnPropertyDescriptor(error,key);if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&Object.hasOwn(messages,descriptor.value))return messages[descriptor.value];}
 return null;
}
