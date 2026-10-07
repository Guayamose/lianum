# Artefactos de claims nativos: inventario y reconstrucción

Auditoría del 8 de octubre de 2026. Los fuentes públicos están disponibles; los
recibos de aceptación originales y varias compilaciones no se recuperaron. El
build de desarrollo nuevo prepara CI51 V3 y CO42 y permite el preflight original
del fixture BTC/Solana. Las aceptaciones históricas siguen ausentes y el payout
completo necesita una aceptación nueva.
`./dev artifacts` verifica actualmente su ámbito de encoding; **no acredita
estos claims ni recupera sus aceptaciones**.

Las rutas de artefactos de este documento son relativas al `ROOT` del runtime
`omnichain-flat-profile/flat-wallet`, reconstruido localmente por `./dev`. Los
consumidores se enlazan a los fuentes editables del repositorio.

## Identidades originales comprobadas

Se ha recalculado la identidad con los fuentes Noir, sus dependencias locales,
ABI, paquetes oficiales, toolchain y settings originales. Los tres hashes
coinciden; esta comprobación **no sustituye una compilación, una prueba ni una
operación nativa**.

| Relación | Función | Source version original |
| --- | --- | --- |
| CI51 V3 `native_claim_ingress_v3` | Ingreso BTC/Solana registrado | `65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555` |
| CO42 `native_claim_discharge` | Descarga de ticket y payout | `7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5` |
| CI51 legado `native_claim_ingress` | Perfil anterior | `c13d5cc0e1be06158727cf933013492fe44efe987d09e4dee9bb9216c04fb418` |

VK esperada de V3:
`11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f`.
VK esperada de CO42:
`0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83`.
Son hashes SHA-256 literales de los bytes de cada key, fijados por el código
original. Las keys de los perfiles wrapped claims son distintas y no sirven
como sustitución.

## Qué falta y quién lo consume

| Familia y ruta | Estado | Consumidor |
| --- | --- | --- |
| `experiments/native-ingress-v3-artifacts/acceptance.json` | Ausente; recibo histórico | [Loader V3](../src/operations/deployments/claims/native-claim-ingress-v3-artifacts.mjs) |
| `experiments/native-ingress-v3-artifacts/.local/<fase>/` | Ausentes stats, key, proof, Solidity y sus `result.json`, `resources.json`, `pins.json` | Loader V3 |
| `experiments/native-ingress-v3-validation/acceptance.json` y `.local/f574cd35-4ba6-4bf7-911f-8711df163bb2/{compiled-manifest.json,program.json}` | Ausentes aceptación, manifiesto y programa | Loader V3 |
| `experiments/native-ingress-v3/{source-manifest.json,baseline-manifest.json,profile.json,verification.json,source.patch}` | Ausentes recibos de fuentes/revisión | Loader V3 y validación experimental original |
| `.local/native-claims-contracts/e3e645b6-9466-4f3c-aab1-4dcaa93b7f51/compiled.json` | **Retenido y hash exacto comprobado** | [Loader de contratos](../src/operations/deployments/claims/native-claim-artifacts.mjs) |
| Mismo directorio: `manifest.json`, `source-snapshot.json` | Ausentes recibos originales | Loader de contratos |
| `.local/proof-workers/claim-verifier-compilation/5ead74d0-bb7c-4d0e-a625-87bbcf46682b/{result.json,resources.json}` y compilaciones relacionadas | Ausentes | Loader de contratos |
| `.local/proof-workers/relations/native_claim_discharge/<source-version>/` | Ausente completo: programa, stats, VK, Solidity, pointers y recibos de ejecución | [Tooling de pruebas](../../proofs/src/tooling/tooling.mjs), worker de payout y loader de contratos |
| `.local/proof-workers/relations/native_claim_ingress/<source-version>/` | Ausente completo; además lo exige el loader legado | Tooling de pruebas y loader legado |

La entrada que verifica estos artefactos antes de arrancar nodos es
[`createOwnedNativeClaimGraphV3Fixture()`](../../../tests/integration/fixtures/claims/lifecycle/owned-native-claim-fixture.mjs).
Preparar sólo los contratos no resuelve el payout: CO42 necesita también los
artefactos autentificados que lee su worker.

Hashes originales conocidos para recuperar respaldos exactos:

| Archivo | SHA-256 esperado |
| --- | --- |
| V3 artifacts `acceptance.json` | `a533bbdf7f6f3b52acc86f6350fdcf6d33aafb7206abc3a5fbb2a95b7fb6bc10` |
| V3 validation `acceptance.json` | `4becaf943b9694066754749da3b35c863d8e8cd0fe977b7749619a299a9a12ec` |
| V3 `source-manifest.json` | `b0c8317888e6a4afff98a90b57be4f8fa839ffaf7c4d9726aa3017828553eb68` |
| Contratos `compiled.json` retenido | `263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9` |
| Contratos `manifest.json` | `1b799fc3fad9ade30f3f7f4a432071d265deaf2a2c4075e0cc4dc7e40b559c5b` |
| Contratos `source-snapshot.json` | `b21f5489eb481a32e75547b8402da6b759cabba0225025bd1725aa736b4d5a25` |
| Verifier compilation `result.json` | `827b270dd6e6537cef628efa751b97dd008f904299132f6516831217ec1310ce` |
| Verifier compilation `resources.json` | `7c7d398c8fb0f926d92f7b439caa4239239a982887b140725df4ea9ab1d411ef` |
| Programa CO42 `compiled/61d900c0-e5a2-4757-a274-c59fd0d0c645/program.json` | `5ec7d600e2f1a76d72720f2b3a35b44c4e777e7dee30f46d0be2b98a3eca39e3` |

Los hashes individuales de los archivos de fase V3 dependen del allowlist de su
aceptación ausente; no se ha recuperado un literal independiente para cada uno.
Sus IDs originales son stats `ab926291-69ce-4c26-9193-3c2253c11195`, key
`09feff05-9d1e-4036-98b2-4e50783cbbc3`, proof
`bcf79517-1ccb-41ef-8aef-3de833aa4c82` y Solidity
`46d5696e-76b0-45ba-b947-5e8bd5c13e7d`.

## Reconstrucción pública revisada

Se ha preparado un build público nuevo bajo
`.local/development-native-claims/v2`, con manifiesto fijo
`0df110957d9bde54085d6ae47b67811dfe626dece77b33dfa14db935b3bef043`.
La revisión v1 se conserva como evidencia del primer build; v2 elimina del pin
publicado los UUID variables y normaliza únicamente la ruta diagnóstica del
`main.nr` en `file_map`. El programa completo, ABI, ACIR, circuitos, CRS,
compiladores y VK siguen verificados. Los hashes locales reales del programa y
de sus manifests se comprueban dentro de cada laboratorio.

Desde la raíz, después de preparar las dependencias públicas:

```sh
./dev node scripts/wallet/preparation/prepare-development-native-claims.mjs
LIANUM_TEST_NATIVE_CLAIMS_REBUILD=1 ./dev test packages/backend/tests/operations/deployments/claims/development-native-claims-build.test.mjs
./dev test packages/proofs/tests/native-ingress/native-claims-parent-death.test.mjs
```

CO42 utiliza el supervisor genérico original y produce intentos actuales con
UUID nuevos; su reader original conserva todos los checks de compile/stats/key.
V3 usa un supervisor acotado con el lock global, RSS máximo de 3 GiB, suelo de
2,5 GiB libres y timeout original por fase. Se han generado las dos VK y ambas
coinciden exactamente con los hashes originales. Las 40 pruebas originales de
constraints Noir pasan: 7 aceptadas y 33 rechazadas. Se verifican los compiladores,
inmutables, ABI y tamaños reales de los verifiers de Solidity. El fingerprint
cubre 46 fuentes transitivos de ejecución y fixture, además de Noir/API/vendor/CRS.

La preparación CO42 recibe SIGTERM del kernel si muere su padre, incluso después
de `exec` y SIGKILL. Cuatro regresiones con procesos reales comprueban ese cierre,
incluidas las rutas del código editable, runtime y copia limpia de CI.
Ocho comprobaciones de integración pasan, incluido preflight sin nodos,
alteración de manifest/VK/ABI/fuentes y traslado de la ruta diagnóstica manteniendo
ABI, ACIR y key idénticos. El loader de la prueba pública histórica sigue exigiendo
su aceptación original; no devuelve una prueba inventada del build nuevo.

La identidad del **circuito** se conserva. La identidad y los recibos del
**nuevo build/laboratorio** son nuevos y se han fijado después de comprobar sus
resultados reales. El build no fabrica aceptaciones, pruebas, manifiestos,
fuentes de revisión ni autoridades bajo los identificadores históricos. Las
operaciones BTC/Solana y payout deberán establecer su propia aceptación en un
laboratorio nuevo. **Este build no genera una prueba ni acredita ingreso,
finalidad o payout nativos completos.** El preflight ya dispone de los artefactos
necesarios para continuar ese laboratorio conservando sus controles originales.

Evidencia local más detallada: `.internal/dev/reports/native-claims-artifact-inventory.json`
y `native-claims-source-audit.json`. Son informes ignorados de esta restauración;
la información necesaria para los siguientes ingenieros queda versionada aquí.
