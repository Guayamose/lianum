# Originales pendientes de recuperación

La inspección real de los doce verificadores V5 se detiene antes de publicar
artefactos o arrancar el laboratorio móvil. El lector W39 exige cinco archivos
históricos que no están en la restauración disponible.

Se revisaron los 28 ZIP originales por tamaño y SHA256, incluso con nombres
abreviados, el paquete público, los archivos restaurados y la instalación I84.
Cuatro originales adicionales sí se recuperaron con sus hashes exactos; están
en `archive/restoration/w39-originals/`. La receta propia
`archive/restoration/recipes/w39-original-restoration.json` conserva procedencia,
tamaños y hashes de los cuatro recuperados y los cinco pendientes.

Para el responsable del respaldo: necesitamos **los bytes originales** de:

| Archivo | Bytes | SHA256 |
| --- | ---: | --- |
| `omnichain-product/evidence/m15-notes-compile.json` | 2201718 | `415aa77e2bb3d165178f2bf113882ff74902bdcad16b2bbbc14630cf9df68d31` |
| `omnichain-product/evidence/m15-notes-source-at-run/experiments/private-core-proof/native-notes/prover.mjs` | 3538 | `78cf94990aa8b5d50d3b478ea7bf5cbd805bfe70901060003aa83728bb57c9e2` |
| `<compilación>/withdraw_output/manifest.json` | 5162 | `174e6cfb68478f51926b90ac896e57804f2f5663802a3b2317bd9124134840c1` |
| `<compilación>/result.json` | 86330 | `012e1ebd4fc9e4e5ba92abe520df85936c37182ca4a56f6d34cd0f8661c6e2d9` |
| `<compilación>/resources.json` | 13907 | `e8ac563bfa686d30eb8da4c561ce1a47f789180155a8589fd737defe75ca6969` |

`<compilación>` es
`omnichain-flat-profile/flat-wallet/.local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6`.

El `prover.mjs` actual tiene otros bytes y no sustituye esa versión histórica.
Regenerar o reformatear estos JSON tampoco recupera sus hashes originales.
El lector, sus pins y los resultados anteriores permanecen intactos.

Los dos faltantes de encoding se consultan con `./dev artifacts`. El raw
histórico del ledger `f21b2710…` también sigue ausente; su compilación V5 nueva
se aceptó como artefacto distinto. Estos tres faltantes no se confunden con los
cinco requisitos de W39.

Mientras se recuperan, se puede trabajar en la base web, móvil, backend y Cloud
local. La aceptación financiera móvil V5 sigue pendiente.
