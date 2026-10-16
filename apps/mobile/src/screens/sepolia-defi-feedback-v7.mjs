const messages=Object.freeze({
  SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED:'La inversión todavía no está disponible: falta conectar la reserva de fondos. No autorices ni envíes otra operación para resolverlo.',
  SEPOLIA_DEFI_PROPOSAL_SPONSOR_WINDOW:'El servicio necesita renovar su autorización temporal antes de preparar esta inversión. No se ha autorizado otro envío.',
  SEPOLIA_DEFI_PROPOSAL_INPUT_LIMIT:'La cotización supera el máximo permitido para esta operación. Actualiza la propuesta o reduce el importe.',
  SEPOLIA_DEFI_PROPOSAL_MINIMUM_OUTPUT:'La cotización no cubre el mínimo de USDC que has solicitado. Actualiza la propuesta antes de autorizar.',
  SEPOLIA_DEFI_PROPOSAL_LIQUIDITY:'El protocolo no tiene liquidez suficiente para esta retirada. Tus participaciones siguen bajo su custodia original.',
  SEPOLIA_DEFI_PROPOSAL_SHARE_LIMIT:'El importe supera el límite de esta conexión de prueba. Reduce las participaciones de la propuesta.',
  MOBILE_SEPOLIA_DEFI_SOURCE_EXPIRED:'El permiso del presupuesto de inversión ha vencido. Puedes consultar las participaciones y su retirada; no se autoriza otra inversión con este permiso.',
  MOBILE_SEPOLIA_DEFI_PRIVATE_BUDGET_REQUIRED:'Esta inversión necesita ETH de prueba en su saldo privado de presupuesto. Activa ese saldo antes de continuar.',
  MOBILE_SEPOLIA_DEFI_FUNDING_PENDING:'El ingreso de prueba sigue pendiente. Consulta el mismo ingreso antes de preparar otro.',
  MOBILE_SEPOLIA_DEFI_FUNDING_ALREADY_PENDING:'El saldo o su ingreso ya está preparado. Consulta su estado; no es necesario repetirlo.',
  MOBILE_SEPOLIA_DEFI_EXISTING_OPERATION:'Esta cuenta conserva una inversión preparada. Continúa esa misma operación para mantener su presupuesto y recepción.',
  MOBILE_SEPOLIA_DEFI_ALREADY_AUTHORIZED:'La inversión ya tiene una autorización en el servidor. Consulta su avance sin volver a autorizarla.',
  MOBILE_SEPOLIA_DEFI_ORIGINAL_SEND_PENDING:'El servidor conserva la operación original pendiente de confirmar. Consulta su avance antes de autorizar o enviar otra.',
  MOBILE_SEPOLIA_DEFI_EXECUTION_WINDOW:'El plazo de esta conexión de prueba es demasiado corto. El servicio debe renovar su autorización antes de preparar la inversión.',
  MOBILE_AUTHENTICATION_CANCELLED:'Autorización cancelada. Puedes revisar la misma operación cuando quieras.',
  MOBILE_SEPOLIA_DEFI_RECIPIENT:'Introduce una dirección Ethereum válida para recibir USDC en Sepolia.',
  NATIVE_ADDRESS_INVALID:'La dirección no es válida para Ethereum. Comprueba la dirección completa antes de continuar.',
  DEVICE_DEFI_OPERATION_FLOW_INVALID:'Revisa el importe y sus decimales antes de preparar la propuesta.',
});
export function deviceSepoliaDefiFeedbackV7(error,proposal=false){
  return error instanceof Error&&messages[error.message]||(proposal
    ?'No se ha podido preparar la propuesta. No se ha autorizado una inversión ni una retirada.'
    :'La respuesta no está confirmada. Consulta esta misma operación antes de autorizar o enviar otra.');
}
