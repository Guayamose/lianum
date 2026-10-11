# Módulos y dependencias

Cada paquete JavaScript declara sus entradas públicas en `package.json` mediante
`exports`. Un consumidor nuevo usa esas entradas: el fichero concreto y su
organización interna quedan dentro del paquete. Por ejemplo:

```js
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
import { createRoleProofClient } from '@lianum/proofs/client';
```

Estos nombres apuntan a las implementaciones existentes. No crean otra copia de
la custodia, del estado privado ni de los registros de identidad de los objetos.
La instalación del workspace permite resolverlos desde las fuentes; el build de
compatibilidad los traduce a las rutas de su generación.

| Paquete | Responsabilidad | Entradas públicas principales |
| --- | --- | --- |
| `@lianum/backend` | API, cuentas, ejecución y adaptadores | `accounts/session`, `accounts/http`, `claims/session`, `withdrawals/session`, `portfolio/*`, `transfers/*`, `defi/*` |
| `@lianum/engine` | Motor compartido de ejecución, estado y almacenamiento | `accounts/keeper`, `accounts/journal`, `crypto/privacy`, `crypto/vault`, `storage/records` |
| `@lianum/custody` | Custodia, firmas y consentimiento | `owner`, `preparation` |
| `@lianum/proofs` | Producción, verificación y supervisión de pruebas | `client`, `catalog`, `verification`, `host/process-files`, `host/process-rss` |
| `@lianum/mobile-protocol` | Contratos entre clientes y backend; cliente wallet compartido sin DOM | entrada principal, `original-account-v2`, `wallet/client`, `wallet/owner-graph-review-v1`, `wallet/owner-portfolio-contract` |
| `@lianum/components` | Framing de componentes de circuitos | `framing` |
| `@lianum/crypto` | Candidato de circuitos y primitiva portátil Poseidon | `framing`, `portable-poseidon2` |
| `@lianum/protocol` | Generación histórica congelada, excluida de consumidores activos | Entradas conservadas para reproducción histórica |
| `@lianum/environment` | Ubicaciones explícitas de fuentes y datos locales | entrada principal: `sourcePath`, `sourceURL`, `legacyDataRoot` |

En la tabla, `portfolio/*` y similares abrevian las entradas enumeradas en el
manifiesto. Los paquetes no exponen comodines que permitan importar cualquier
archivo de `src/`. El driver Java de `packages/chains/` conserva su compilación
propia y no se presenta como paquete JavaScript.

`environment` distingue archivos editables de artefactos, herramientas y estado
retenidos. En el catálogo de pruebas, `ROOT`, `FLAT` y `GOLDEN` conservan su
significado de ubicaciones de datos; no indican dónde editar el código. Las
comprobaciones de identidad de herramientas, claves y pruebas siguen en los
componentes que utilizan esos recursos. Los workers criptográficos de una
generación requieren su preparación de compatibilidad: un import directo no
los convierte en una generación aceptada.

## Lo que controla la comprobación

```sh
python3 -B scripts/development/module_boundaries.py
python3 -B scripts/development/module_boundaries.py --json
```

El comprobador inspecciona imports literales, reexports e imports dinámicos con
ruta literal en `apps/*/src` y `packages/*/src`. Rechaza una entrada no exportada,
una dependencia pública no declarada, una dirección no permitida y cualquier
nuevo import relativo que cruce el interior de otro componente. No carga el
producto ni arranca redes. Los imports calculados mediante variables necesitan
revisión: esta comprobación estática no puede demostrar su destino.

Las direcciones permitidas y las excepciones heredadas están en
[`scripts/module-boundaries.json`](../scripts/module-boundaries.json). Cada
excepción identifica el archivo consumidor y el archivo consumido; no autoriza
otros consumidores. Al migrar un import a una entrada pública, se retira su
excepción con:

```sh
python3 -B scripts/development/module_boundaries.py --prune
```

Ese comando solo elimina excepciones que han dejado de usarse. No acepta nuevas
infracciones. Añadir una dependencia o una API nueva exige editar y revisar su
declaración.

La comprobación también rechaza dependencias desde paquetes hacia aplicaciones,
nuevos imports de ejecución desde `tests/` o `experiments/`, y consumidores
activos de `packages/protocol`. Un import relativo de una aplicación hacia un
paquete solo cuenta como API pública si su destino exacto está declarado en
`exports` y la dirección está permitida. Esto permite URLs nativas del navegador
sin autorizar el resto de `src/`.

## Propietarios de las implementaciones compartidas

| Código | Lugar donde se edita | Entradas anteriores |
| --- | --- | --- |
| Esquemas, validadores y revisiones de wallet | `packages/mobile-protocol/src/wallet/contracts/` | Reexports en las carpetas de features de wallet |
| Proyección de la vista y transporte manual compartido | `packages/mobile-protocol/src/wallet/client/view-model.mjs` | Reexport en `apps/wallet/src/client/state/view-model.mjs` |
| Poseidon2 portátil, sin Node ni DOM | `packages/crypto/src/portable/poseidon2-bn254-v1.mjs` | Reexport en la custodia móvil |
| Registro segmentado cifrado | `packages/engine/src/storage/segmented-record-store.mjs` | Reexport en backend claims/storage |
| Identidad de procesos y observación de RSS | `packages/proofs/src/host/` | Reexports en tests/integration/native |

Cada fila tiene una única implementación. Las entradas anteriores exportan las
mismas funciones y objetos; no reconstruyen autoridad ni crean registros de
identidad paralelos. El código de interfaz que toca el DOM sigue en la aplicación.
El servidor web sirve una lista cerrada de módulos compartidos para sus imports
por URL; no expone un directorio de paquetes arbitrario.

## Fuentes activas e históricas

Se han inventariado las 42 parejas de archivos idénticos entre engine y protocol
en [`historical-module-inventory.json`](../scripts/historical-module-inventory.json).
La columna `active` identifica qué implementación editar. La columna
`historical` conserva la referencia original y su SHA-256. El inventario incluye
los 63 archivos históricos de `packages/protocol/src`: la comprobación detecta
su modificación, ausencia o la incorporación de nuevas fuentes allí.

La implementación activa puede evolucionar sin mantener una segunda copia en
protocol. Los tests y las reproducciones históricas pueden utilizar el original;
las aplicaciones y los paquetes activos no pueden incorporarlo como dependencia.
No se han eliminado originales, regenerado artefactos congelados ni convertido
una referencia histórica en una generación económica aceptada.

El histórico conserva imports cuyos destinos no estaban en el material
recuperado. Se enumeran exactamente en
[`static-check-exceptions.json`](../scripts/development/static-check-exceptions.json);
no se redirigen a engine porque eso mezclaría generaciones. Congelar los archivos
disponibles no equivale a poder ejecutar por completo ese histórico.

## Acoplamiento heredado que sigue pendiente

El informe del comprobador indica cuántos imports privados y dependencias de
soporte heredadas quedan. La primera migración de APIs públicas se ha ampliado
con las extracciones anteriores y se han retirado sus excepciones. Es una
reducción de deuda, no una declaración de independencia de todos los paquetes.

Todavía existen ciclos entre backend, engine, proofs y custody: el keeper
coordina checkpoints de la sesión backend, y varios módulos comparten capacidades
de recuperación que dependen de objetos originales. Ese mecanismo de identidad y
custodia no se modifica en esta reorganización. Las dependencias de soporte que
quedan incluyen inspectores de fuentes, procedimientos de recuperación y
compilación histórica; están enumeradas por consumidor y destino y no pueden
crecer mediante `--prune`. Su presencia impide afirmar que todos los workers se
puedan distribuir sin esos recursos históricos.

Para reducir esos ciclos, la próxima modificación de cada contrato compartido
debe situarlo en el paquete que sea su propietario, migrar sus consumidores y
retirar las excepciones correspondientes. Mover un archivo que participa en una
identidad de fuentes exige preparar la nueva generación que lo consuma.
