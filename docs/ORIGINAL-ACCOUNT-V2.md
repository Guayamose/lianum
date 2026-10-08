# Cuenta original vinculada: protocolo móvil V2

El cliente puede revisar una petición TOP_UP o EXIT que ya está admitida en la
cuenta original. Ofrece dos acciones: consultar su registro y reconciliar una
petición ya iniciada. La reconciliación puede actualizar acknowledgements y
checkpoints originales. Sus respuestas describen el registro de la petición;
el saldo privado y el resultado económico permanecen sin verificar.

## Dónde está cada parte

- `packages/mobile-protocol/src/original-account-review-v2.*`: frames, dominios
  de firma y tipos públicos. El subpath `@lianum/mobile-protocol/original-account-v2`
  mantiene el contrato V1 existente separado.
- `packages/backend/src/api/mobile/`: controlador del original y su listener
  HTTP privado, ligado a una única referencia genuina de actor.
- `apps/mobile/src/custody/original-account-lease-v2.*`: consentimientos
  revocables; `key-store.ts` usa la identidad protegida existente.
- `apps/mobile/src/api/original-account-api-v2.*`: transporte y validación de
  respuestas, con lectura incremental limitada a 16 KiB y espera de 15 s.
- `apps/mobile/src/screens/OriginalAccountScreen.tsx`: pestaña «Cuenta vinculada».

## Vinculación local explícita

El operador necesita conservar en el mismo proceso las referencias originales
de `session`, `approval` y `owner`, emitidas por las factorías originales. Un ID,
un JSON o una clave pública no permiten reconstruir esas referencias. El
bootstrap rechaza copias, Proxies, callbacks y otra aprobación/sesión, aunque
tengan los mismos campos. Un fallo inicial antes de emitir un actor permite
volver a intentar la vinculación; un actor ya emitido conserva exclusividad.

El siguiente fragmento se ejecuta dentro de ese proceso, después de admitir la
petición mediante el flujo original. Sus variables representan originales ya
retenidos; no es un comando para crear una cuenta desde datos serializados:

```js
import { createPairedOriginalAccountActorV2,
  pairedOriginalAccountActorDescriptorV2 } from './paired-original-account-actor-v2.mjs';
import { createPairedOriginalAccountHttpServerV2 } from './paired-original-account-http-v2.mjs';

const actor = await createPairedOriginalAccountActorV2({
  session: originalSession,
  approval: originalApproval,
  owner: originalOwner,
  origin: 'https://cuenta.example.test',
  devicePublicKey: publicKeyFromTheDevice,
});
const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
const listener = await createPairedOriginalAccountHttpServerV2({ actor });
```

El operador entrega `descriptor` por su canal de vinculación. La pantalla
solicita su origen HTTPS y `pairingId`, y usa la clave pública que corresponde a
la identidad local existente. El descriptor sólo selecciona y fija términos:
cada acceso privado necesita una firma válida del dispositivo vinculado.

El listener escucha únicamente en `127.0.0.1` y un puerto nuevo. Para utilizarlo
desde el móvil hace falta routing/TLS que exponga exactamente el origen firmado
y conserve el header `Origin`. Esa conexión HTTPS aún debe configurarse y
comprobarse. El bootstrap público de `apps/platform` sigue desconectado y no
crea estos actores. No hay lookup remoto de cuentas ni adopción por IDs.

## Recorrido de consentimiento

1. «Comprobar vinculación» consulta sólo disponibilidad del protocolo. El GET
   no revela cuenta, petición, descriptor ni términos privados.
2. «Solicitar revisión» obtiene un nonce genérico. La primera confirmación
   biométrica firma `LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2` y permite revelar los
   términos de la cuenta vinculada.
3. La pantalla muestra la petición original, activo, red, importe, destino,
   estado y transacción ya iniciada. La segunda confirmación firma
   `LIANUM_ORIGINAL_ACCOUNT_REVIEW_V2`, incluyendo lifetime, generación,
   referencias, digests y revisión del journal.
4. El actor vuelve a leer y comprobar el original antes de consultar o admitir
   su reconciliación. La respuesta mantiene `privatePortfolio:null`,
   `economicObservation:null` y los indicadores de custodia/efectos móviles
   falsos. CONFIRMED del coordinator puede ser un resultado terminal conservado.

Cancelar, cambiar origen/vinculación/acción, salir de primer plano o cambiar de
pantalla revoca la revisión. La clave pública y la caducidad se comprueban
después de acceder a la clave protegida; los buffers mutables de esa clave se
limpian. Cada permiso se consume antes del POST. Una respuesta perdida conserva
la incertidumbre y no permite repetir un callback antiguo. El outbox económico
V1/V2 existente permanece pendiente; este diagnóstico no lo cierra.

El cliente usa [el fetch con streams de Expo 57](https://docs.expo.dev/versions/v57.0.0/sdk/expo/),
con límite incremental de bytes incluso sin Content-Length o con uno falso.
El corte del cliente cancela sólo su respuesta HTTP. El servidor limita body y
headers a 8 KiB, cuatro conexiones, 2 s para headers y 5 s para respuesta.
Cerrar el listener invalida sus consentimientos y confirma cero sockets propios
en 1 s; conserva el trabajo original ya admitido. El operador debe esperar y
cerrar su session/custodia por separado.

## Verificación y alcance

Las pruebas host usan las factorías, approvals, WeakMaps, session, keeper y
journals originales. Runtime nativo, IPC del owner y bytes de prueba del
fixture están identificados como dobles. Las firmas Noble y HTTP loopback son
reales. Los casos de lifecycle ejecutan los métodos exactos seleccionados por
AST de TypeScript; no representan un renderer React ni un teléfono.

El árbol canónico pasa 85 checks host, typescript y exportación Hermes Android/iOS.
Los bundles se exportaron con un único worker Metro. La aceptación sobre un
laboratorio EVM genuino se prepara por separado. Los checks host no acreditan
fondos, pruebas Noir, TLS, biometría física, notas en teléfono ni
cartera móvil completa. La prueba física queda para el final, según la decisión
del usuario. El APK debug anterior requiere Metro; los cambios JS revisados se
sirven desde el código actual cuando se inicia ese servidor.
