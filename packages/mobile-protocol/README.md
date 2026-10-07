# Protocolo público móvil

Contrato compartido entre `apps/mobile` y `apps/platform`. No contiene claves,
dependencias de Node, acceso a red ni autoridad para acreditar fondos.

`POST /v1/mobile/challenges` recibe `{ ownerPublicKey, intent }`. El `intent`
contiene exactamente:

```js
{
  requestId,       // ID original ASCII de 16–64 caracteres
  action,          // prepare | execute | reconcile | recover
  kind,            // TOP_UP | EXIT
  chain,           // ethereum | base | arbitrum | bnb | solana | bitcoin | tron
  assetId,         // Identidad de activo: 32 bytes hex lowercase
  amountAtomic,    // Decimal canónico u64 positivo
  recipient,       // Destino ASCII de 1–128 caracteres
  maxFeeAtomic     // Decimal canónico u64
}
```

El destino queda acotado en bytes; su formato, identidad nativa y asociación
con una operación original deben verificarse en el adaptador económico real.
El catálogo de redes no acredita soporte económico integrado en esas redes.

El servidor genera y conserva este challenge y devuelve `{ challenge }`:

```js
{
  version: 1,
  profile: 'LIANUM_MOBILE_AUTHORIZATION_V1',
  origin,          // Origen HTTPS exacto del servicio
  challengeId,     // 32 bytes hex
  nonce,           // 32 bytes hex
  expiresAt,       // Unix milliseconds; como máximo 300000 ms en el futuro
  ownerPublicKey,  // secp256k1 sin comprimir: 04 + 64 bytes hex
  intent
}
```

`mobileAuthorizationMessage()` normaliza el orden de todos los campos y devuelve
los bytes ASCII de `profile + '\n' + JSON.stringify(challenge)`. Se firma
**SHA256 de esos bytes** con ECDSA secp256k1, formato compacto IEEE-P1363 de
64 bytes, lowS. Es una autorización móvil con dominio propio; la compatibilidad
de firma con el encoder histórico no autoriza a tratarla como una firma del
frame de un grafo o de una nota Noir.

`POST /v1/mobile/authorizations` recibe sólo `{ challenge, signature }`.
`normalizeMobileAuthorization()` valida formato y lowS, pero **no verifica la
firma**. El servidor debe verificar el punto público y la firma, origen, caducidad,
challenge original inalterado, términos y permisos del executor, y consumir la
autorización duraderamente antes de un efecto. La idempotencia abarca propietario,
ID original y acción; una repetición idéntica devuelve el resultado guardado,
sin repetir el efecto. Un cambio de términos no sustituye una operación original.

La respuesta exacta contiene `{ status, requestId, operationState, retryAllowed }`:

| status | operationState | Significado |
|---|---|---|
| ACCEPTED | ADMITTED | Autorización admitida, sin afirmar liquidación |
| UNKNOWN | UNKNOWN | Resultado que requiere observación del original |
| REJECTED | REJECTED | Rechazo declarado por el servicio |

`retryAllowed` siempre es `false`. No hay reenvíos automáticos ni deducciones de
saldo a partir de esas respuestas. La clave privada nunca pertenece al contrato.

`GET /v1/mobile/state` sólo publica disponibilidad y capacidades. Su versión
actual exige `privatePortfolio: null`; un futuro estado privado autenticado
necesitará ampliar el contrato y sus verificaciones.

Los tests en `apps/mobile/tests` y `apps/platform/tests` cubren framing, firma y
admisión. La validación en dispositivo, recuperación, auditoría criptográfica y
la conexión con operaciones económicas reales siguen siendo responsabilidades
separadas.
