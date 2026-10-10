# Entorno local y limpieza

El código versionado está en las carpetas visibles de la raíz. Las dependencias
instaladas, compilaciones, datos de redes locales y resultados de desarrollo
ocupan mucho más espacio que ese código. Este archivo explica dónde están y
cómo limpiar la acumulación sin retirar recursos necesarios para trabajar.

## Resultado de la limpieza del 10 de octubre

El proyecto pasó de **32.008.396.800 a 21.270.175.744 bytes**
—de **29,8 a 19,8 GiB**—, liberando **10 GiB**. La medición cuenta el espacio
ocupado en disco y cuenta una sola vez los archivos con enlaces duros.

El historial retirado se conserva en tres archivos comprimidos y un manifiesto,
con unos **2,1 GiB** en total. No hay 20 GiB de código: el código versionado
ocupa unos 66 MB; el resto incluye herramientas, dependencias, artefactos
criptográficos, bases de datos, compilaciones y ese respaldo.

## Qué hay en cada carpeta

| Ubicación | Función |
| --- | --- |
| `.internal/runtime/` | Rutas compatibles de ejecución, dependencias restauradas, artefactos originales y laboratorios asociados |
| `.internal/dev/toolchains/` | Node, compiladores y otras herramientas locales utilizadas por los comandos |
| `.internal/dev/drafts/` | Candidatos y parches pendientes de integración |
| `.internal/dev/reports/` | Informes actuales y evidencias enlazadas por la documentación |
| `.local/` | Configuraciones privadas, claves, bases de datos, Vaults, journals, estado de laboratorios y cachés |
| `.local/history/` | Respaldos compactados por la limpieza; no forman parte del código del producto |
| `apps/mobile/node_modules/` y compilaciones Android | Dependencias instaladas y salidas del cliente móvil |

La preparación de `.internal/runtime/` se explica en
[STRUCTURE.md](STRUCTURE.md). Una parte del proyecto todavía depende de sus
rutas y hashes. La limpieza no elimina esa compatibilidad ni cambia sus
verificaciones.

## Previsualizar y aplicar

Desde la raíz:

```sh
./dev clean
./dev clean --apply
```

El primer comando muestra la selección y su espacio sin modificar archivos.
El segundo aplica la selección conservadora. Las categorías que puede retirar
son:

- Clones temporales de comprobación y copias de trabajo antiguas.
- Staging público I84 que ya está materializado y verificado en su destino.
- Cachés regenerables de Gradle y Go, y salidas de compilaciones BSC fallidas;
  conserva el entorno Python requerido.
- Borradores e informes históricos seleccionados, después de compactarlos y
  verificar su respaldo.
- Capturas históricas grandes seleccionadas de `reopen-state*` y
  `wrapped-runtime-capture`, también con respaldo restaurable.

Limpiar una caché puede hacer que la siguiente compilación vuelva a descargar
dependencias o recompilar. La limpieza no reinstala paquetes ni ejecuta
`npm ci`.

## Qué se conserva

La selección conserva el código, las herramientas y binarios activos, las bases
de datos BSC, las configuraciones y claves locales, Vaults, journals, locks,
estado económico y el APK actual. Conserva también los originales fijados de
compilación y pruebas —incluidos los conjuntos de 45 y 100 archivos y sus
manifiestos—, los artefactos criptográficos y recursos necesarios para usarlos.
Estos originales no se sustituyen por una regeneración durante la limpieza.

Los candidatos SOURCE móvil todavía no integrados permanecen en
`.internal/dev/drafts/continuous-networks-v1/spl-source-mobile-economic-v4/`
y `spl-source-mobile-sdk-ui-v4/`. Los resúmenes actuales de diagnóstico y los
archivos enlazados directamente por las guías también permanecen disponibles.

Los datos locales de custodia, las claves y los checkpoints tienen una función
distinta de una caché. No se recuperan instalando dependencias. El comando no
los trata como material regenerable.

## Historial compactado y restauración

Cada limpieza que compacta historial crea una carpeta
`.local/history/cleanup-*/`. Contiene `manifest.json` y los archivos
`drafts.tar.gz`, `reports.tar.gz` y `snapshots.tar.gz` correspondientes a las
clases seleccionadas. El manifiesto conserva rutas, hashes y modos; el respaldo
se verifica antes de retirar los originales seleccionados.

Para recuperar una clase del último respaldo disponible:

```sh
./dev clean --restore drafts
./dev clean --restore reports
./dev clean --restore snapshots
```

La restauración devuelve los archivos a sus rutas originales y rechaza
sobrescribir un archivo existente con contenido distinto. Recuperar un
borrador lo devuelve al historial local: no lo integra en el código canónico.
Las cachés regenerables eliminadas se reconstruyen mediante sus herramientas;
estos tres archivos de respaldo corresponden al historial seleccionado.

La limpieza y su restauración no arrancan una campaña económica ni demuestran
el cierre de un objetivo del producto. El estado funcional y los pendientes
se mantienen en [STATUS.md](../STATUS.md).
