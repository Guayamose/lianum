/** Presentation compatibility with saved cards and the existing server release.
 * Only fixed UI copy is translated. User messages and model prose stay intact. */
const labels:Readonly<Record<string,string>>=Object.freeze({
 "Preparando la respuesta":'Preparing your response',
 'Escribiendo':'Writing',
 'Comprobando información':'Checking information',
 'Consultando tu cartera':'Checking your wallet',
 'Revisando las operaciones':'Reviewing operations',
 'Comprobando los permisos':'Checking permissions',
 'Consultando tus preferencias':'Reading your preferences',
 'Guardando tu preferencia':'Saving your preference',
 'Olvidando la preferencia':'Removing your preference',
 'Consultando los seguimientos':'Checking followups',
 'Programando el seguimiento':'Scheduling your followup',
 'Cancelando el seguimiento':'Canceling your followup',
 'Preparando una propuesta':'Preparing a proposal',
 'Abriendo el siguiente paso':'Opening the next step',
 'Tu cartera':'Your wallet',"Tus operaciones":'Your operations',
 "Disponible":'Available',"Reservado":'Reserved',"En operaciones":'In progress',
 "Por confirmar":'Unconfirmed',"Envíos por confirmar":'Transfers awaiting confirmation',
 'Pasos confirmados':'Confirmed steps',
 'La observación necesita actualizarse':'This observation needs an update',
 'Última observación de la cartera':'Latest wallet observation',
 "Abrir cartera":'Open wallet',"Ver operaciones":'View operations',"Ver operación":'View operation',
 'Propuesta de pagos lista para revisar en tu móvil.':'Your payment proposal is ready to review on your phone.',
});
export const agentDisplayLabelV1=(value:string)=>labels[value]??value;

/** Convert only the legacy server's exact Spanish currency/step display format.
 * Never use Number: large amounts must retain every digit and cent. */
export function agentDisplayValueV1(value:string){
 const money=/^(-?)(\d+|\d{1,3}(?:\.\d{3})+),(\d{2})\s*(€|US\$|\$)$/.exec(value);
 if(money){const whole=money[2].replaceAll('.','').replace(/\B(?=(\d{3})+(?!\d))/g,',');return money[1]+(money[4]==='€'?'€':'$')+whole+'.'+money[3];}
 const steps=/^(\d+) de (\d+)$/.exec(value);
 return steps?steps[1]+' of '+steps[2]:agentDisplayLabelV1(value);
}
