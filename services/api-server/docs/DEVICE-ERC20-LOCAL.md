# Servicio local para una nota ERC20

Esta entrada prepara un realm nuevo de laboratorio con el Anvil fijado y el
USDC local de seis decimales del fixture original. Crea el sistema y la cuenta
del dispositivo antes de abrir TLS. No genera claves del usuario ni prueba,
financia o retira una nota al arrancar. No publica contratos en una red pública.

La raíz y la clave de nota permanecen en la app. La clave pública de identidad
del dispositivo sirve para emparejar; la clave privada TLS pertenece al operador.
Las aperturas se envían sólo al trabajador original cuando se autoriza la prueba.

## Preparación del operador

La [entrada fija](../../../scripts/development/profiles/run-device-external-flat-local-v1.mjs) carga el módulo
original materializado en
`.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs`.
El HOST de arranque, cancelación y cierre pasó; el recorrido financiero y el
uso del teléfono se comprueban por separado.

Después de publicar y materializar las fuentes revisadas con el build original,
crea el directorio privado fijo con modo 700:

```sh
mkdir -m 700 .internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-external-flat-local-v1
```

Guarda allí `operator.json` con modo 600. No se admiten campos adicionales:

```json
{
  "origin": "https://HOST_CON_CERTIFICADO:9447",
  "devicePublicKey": "04_CLAVE_PUBLICA_ORIGINAL_DE_128_HEX",
  "depositAmountAtomic": "500",
  "tls": {
    "certificate": "PEM_DEL_CERTIFICADO_TLS_DEL_OPERADOR",
    "privateKey": "PEM_DE_LA_CLAVE_TLS_DEL_OPERADOR"
  }
}
```

Sustituye esos marcadores por la clave pública real de la app, el Origin HTTPS
exacto y un certificado vigente que cubra ese host y coincida con su clave TLS.
El certificado debe ser de confianza para el dispositivo. El listener escucha
en las interfaces locales; sólo admite el Host/Origin y la identidad emparejada.

`depositAmountAtomic` es un entero positivo en unidades atómicas. Para este
USDC, `500` significa `0.000500 USDC`. El arranque aprueba exactamente ese importe
para el pool original, una vez; no concede allowance infinita ni la renueva.
El importe introducido en la app debe coincidir. La aprobación prepara el
token del laboratorio y no financia la nota.

Desde la raíz del proyecto, inicia el único caller fijo sin argumentos:

```sh
env -u NODE_OPTIONS -u NODE_PATH .internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node --max-old-space-size=384 scripts/development/profiles/run-device-external-flat-local-v1.mjs
```

Tras `ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY`, entrega de forma privada el
contenido completo de `paired-descriptor.json`, creado en el mismo directorio
con modo 600. Es el descriptor original sin campos añadidos. La entrada rechaza
otra instancia y no reemplaza un descriptor anterior ni adopta un realm financiado.

## Uso y cierre

En **Nota ERC20**, pega el descriptor y selecciona **Conectar y consultar la
nota**. Fija la dirección de retirada y el importe en unidades atómicas. Preparar
la prueba, financiar y retirar son autorizaciones separadas. Una respuesta
perdida se consulta sobre el mismo trabajo; nunca se vuelve a financiar o retirar.
La retirada usa la nota fuente íntegra y el destinatario fijado antes del depósito.

SIGINT o SIGTERM cierran primero la admisión y esperan las operaciones originales,
el listener y el runtime propios. Se conserva el scratch cifrado original. Si el
cierre no queda acreditado, el lock se conserva y la salida falla. Un SIG durante
el arranque espera esa misma adquisición y cierra sin publicar disponibilidad.

Esta entrada no ofrece reapertura en otro proceso ni recuperación por caída
abrupta. Código, HOST de lifecycle, recorrido financiero Node/TLS y uso físico
del teléfono son evidencias diferentes; esta guía no atribuye aceptaciones nuevas.
