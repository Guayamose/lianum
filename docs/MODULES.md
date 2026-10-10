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
| `@lianum/engine` | Motor compartido de ejecución y estado | `accounts/keeper`, `accounts/journal`, `crypto/privacy`, `crypto/vault` |
| `@lianum/custody` | Custodia, firmas y consentimiento | `owner`, `preparation` |
| `@lianum/proofs` | Producción y verificación de pruebas | `client`, `catalog`, `verification` |
| `@lianum/mobile-protocol` | Contratos de autorización y revisión móvil | entrada principal y `original-account-v2` |
| `@lianum/components` | Framing de componentes de circuitos | `framing` |
| `@lianum/crypto` | Implementación candidata Poseidon | `framing` |
| `@lianum/protocol` | Generación anterior todavía conservada | `accounts/keeper`, `crypto/privacy`, `crypto/vault` |
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

## Acoplamiento heredado que sigue pendiente

La migración inicial convierte 18 imports de seis archivos de producción:
servidor wallet, sesión de cuentas, catálogo de pruebas, framing criptográfico
y proveedores nativo/EVM. Quedan 983 imports privados registrados. Esta cifra
es una deuda visible, no una declaración de independencia de los paquetes.

Todavía existen ciclos entre backend, engine, proofs y custody. Por ejemplo,
backend utiliza el keeper de engine y ese keeper utiliza almacenamiento de
backend. También hay dependencias invertidas: backend y mobile-protocol
consumen contratos situados en wallet, y engine contiene una dependencia hacia
mobile. Se mantienen registradas para conservar el comportamiento actual;
las nuevas APIs públicas no autorizan dependencias de paquetes hacia apps.

Para reducir esos ciclos, la próxima modificación de cada contrato compartido
debe situarlo en el paquete que sea su propietario, migrar sus consumidores y
retirar las excepciones correspondientes. Mover un archivo que participa en una
identidad de fuentes exige preparar la nueva generación que lo consuma.
