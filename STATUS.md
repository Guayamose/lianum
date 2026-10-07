# Estado actual

Actualizado el 8 de octubre de 2026. Hay una base versionada y utilizable para
desarrollo; todavía no está completada la wallet omnichain de la visión original.
Los resultados distinguen código comprobado, laboratorio local y producto
pendiente. Las entregas históricas permanecen en `archive/`.

## Trabajo solicitado

| Paso | Estado comprobado | Qué falta para cerrarlo |
| --- | --- | --- |
| 1. Base fiable | Importación separada por componentes, dos mocks corregidos, 244 pruebas habituales correctas, inventario de encoding y CI preparado desde una copia limpia. | No sustituye todas las integraciones ni los originales históricos ausentes. |
| 2. Reconciliación nativa | `reconcile()` consulta el resultado terminal conservado antes de esperar al adaptador. Regresiones de adaptador bloqueado y validación terminal aprobadas. | La recuperación económica integral se comprueba adicionalmente en el paso 3. |
| 3. Recorrido EVM | Build revisado nuevo, supervisor, SDK y HTTP reales; financiación y autorización con pruebas reales comprobadas. Aceptación integral en curso. | Completar el recorrido, reinicio y recuperación F; aceptación visual y conexión a móvil. |
| 4. Redes y operaciones combinadas | Bitcoin y Solana: ingreso y solver aceptados en Core/Agave nuevos. CI51 V3 y CO42 reconstruidos con sus VK originales. Tron produce consenso y un broadcast, pero su aceptación falla. | Payout con autoridad original, flujo privado BTC/Solana, finalidad/cierre Tron, aceptación propia de Base/Arbitrum/BNB y composición entre redes. |
| 5. DeFi | Swap oficial Uniswap V3 y depósito/redención oficial MetaMorpho comprobados en Anvil. Salida acotada y puente privado con 18 regresiones. | Ciclo privado completo con pruebas reales, posiciones y recuperación ante pérdida de keeper/nodo. |
| 6. Móvil y operación | Expo/React Native, consentimiento y outbox protegido; API/PostgreSQL duraderos; Docker local; Terraform validado sin cuenta GCP. | Bridge a cuentas/keeper y workers, saldo privado real, aceptación física, recuperación móvil y operación de producción. |

Los pasos 1 y 2 tienen sus cambios implementados y comprobados. Los pasos 3–6
incluyen avances reales, pero no están cerrados como producto. Google Cloud se
prepara **sólo localmente**, según la decisión del usuario: no hay proyecto,
despliegue, `apply` ni recursos creados.

## Qué puedes ejecutar hoy

Desde la raíz:

```sh
./dev start       # Wallet web; arranca desconectada
./dev test        # Selección habitual: 244 PASS, 0 FAIL
./dev check       # Integridad, tipos/ABI, diagnóstico Noir y HTTP
./dev doctor      # Herramientas, originales y bloqueos por separado
./dev artifacts  # Faltantes históricos de la selección de encoding
```

La wallet web no inventa saldo al arrancar. Cada integración tiene preparación propia:

- [Laboratorio EVM](docs/EVM-LAB.md): build nuevo y recorrido con pruebas reales.
- [Móvil](apps/mobile/README.md): instalación, contratos, tipos y bundles Android/iOS.
- [API y PostgreSQL](apps/platform/README.md): réplica Docker y pruebas con base real.
- [Google Cloud](infra/google-cloud/README.md): validación y seis tests simulados, sin credenciales.
- [Redes y DeFi](packages/backend/docs/LOCAL-ACCEPTANCE.md): alcance de cada aceptación.

## Evidencia y límites

La selección habitual pasa con 244 resultados. Una copia con sólo fuentes
versionadas y dependencias públicas pasa además 81 regresiones seleccionadas de
DeFi, redes, HTTP y procesos de pruebas. La API tiene 11
casos host y ocho resultados del grupo PostgreSQL real: carreras, JSONB,
reinicio, respuesta perdida, crash y caída de SQL conservando el proceso HTTP.
El adaptador de esos tests es un contador SQL; no mueve fondos ni genera pruebas.

El cliente móvil pasa 17 pruebas de contratos, custodia simulada, conservación
de operaciones pendientes y procesos de compilación, además de tipos y
exportación Android/iOS. Su outbox conserva una ejecución UNKNOWN aunque se
rechace después el permiso de reconciliación; la admisión de permisos no cierra
su resultado económico. Eso no acredita biometría/custodia en un teléfono ni una IPA/APK
instalada. El bootstrap de API mantiene el adaptador económico desconectado:
liveness es 200, readiness es 503 y `privatePortfolio` es `null`.

Solana usa el Agave personalizado original con génesis, claves y ledger nuevos.
Verifica nonces duraderos, comisiones y balances de ingreso/solver; no fabrica la
autoridad del controlador de payout. Tron conserva
`OWNED_TRON_RUNTIME_RELEASE=null`: su clausura pública y el parche offline nuevo
se verifican. El candidato produce bloques y admite el único broadcast, pero
no establece finalidad en el plazo y termina SIGABRT. No se acepta como red completa.

Los informes están en `.internal/dev/reports/` y los directorios privados de
cada intento. No se versionan claves, testigos ni sesiones. Los comandos CI se
comprueban localmente; no hay remoto ni ejecución registrada de GitHub Actions.

## Artefactos y entorno

- El archivo original completo conserva 2.649 archivos con sus comprobaciones
  históricas. Git incluye 1.716; otras 933 referencias/paquetes/drafts públicos
  locales quedan excluidos explícitamente de CI.
- La reconstrucción inicial reprodujo 1.684 archivos del recorrido original.
  El código editable puede cambiar; el archivo histórico y sus pines no cambian.
- Faltan dos originales de encoding:
  `candidate-poseidon/.local/component/attempts/prove-2/public-inputs.json` y
  `flat-wallet/.local/contracts/2e02620a-404c-4c27-9ac2-4132713e083b/compiled.json`.
  `./dev artifacts` identifica sus consumidores y el hash conocido. No se
  regeneran como si fueran originales ni se omiten silenciosamente sus tests.
- También faltan programas/VK y evidencias públicas de releases históricas de
  claims. Un build nuevo ya prepara CI51 V3 y CO42 con las VK originales, sin
  fabricar esos recibos históricos ni acreditar payout. El inventario de encoding
  tiene ese alcance; no certifica todas las
  integraciones posteriores. [El inventario de claims](packages/backend/docs/NATIVE-CLAIMS-ARTIFACTS.md)
  identifica familias, consumidores, hashes conocidos y la identidad del build nuevo.
- El laboratorio privado perdido no se recuperó. Las aceptaciones nuevas usan
  identidades, claves y estado nuevos.
- Los módulos heredados requieren `.internal/runtime/`, recursos compartidos y
  algunos experimentos. Los nuevos móvil/API/infra tienen dependencias explícitas
  fuera de esa compatibilidad.

## Distancia respecto a los puntos originales

La entrega histórica estimaba un 58% global sin una medición de aceptación.
No lo convertimos en porcentaje actualizado a partir de commits o tests. Los
rangos anteriores eran cobertura técnica orientativa:

| Punto original | Referencia anterior | Condición para aceptarlo como producto |
| --- | --- | --- |
| Wallet unificada | 50–60% | Recorrido desde interfaz/móvil, estado y recuperación entre siete redes. |
| Privacidad por defecto | 40–50% | Modelo de observadores/colusión y garantías de sistema comprobadas. |
| PAEG genérico | 60–70% | Composición reproducible dentro de límites explícitos; el perfil actual tiene cuatro slots. |
| Liquidación y recuperación económica | 55–65% | Entregas parciales, pérdidas asignadas y ningún efecto o saldo duplicado. |
| DeFi privado real | 35–45% | Ciclos privados completos por protocolo, salida, conservación y recuperación. |
| Estado privado global | 55–65% | Coherencia de disponibles/reservados/pendientes entre redes y propietarios. |
| Redes heterogéneas en profundidad | 45–55% | Aceptación de cada red, finalidad, reorganizaciones y operaciones combinadas. |
| Agente autónomo personal | Fuera del alcance | Rafa lo implementa sobre las APIs y permisos del producto. |

Son referencias de la evaluación anterior, no una medición de los avances
actuales ni del tiempo pendiente. Ningún punto completo de la visión original
queda aceptado por pruebas aisladas.

La revisión criptográfica independiente está pendiente. Los objetivos en
caliente de sobrecoste propio <30 s, pruebas <20 s y coordinación <5 s aún no
están demostrados; la finalidad nativa se mide aparte. Los permisos móviles
actuales exponen identidad pública estable e importes a la API.

[Criterios de privacidad y operación](docs/PRIVACY-AND-OPERATIONS.md) ·
[Orden de trabajo](ROADMAP.md) · [Visión original](archive/delivery/PROJECT-VISION.md)
