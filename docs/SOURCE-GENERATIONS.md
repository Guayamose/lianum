# Preparar fuentes y reutilizar artefactos

La generación de desarrollo identifica las fuentes actuales y reúne un candidato revisable. El comando prepara automáticamente las copias de compatibilidad que necesitan los lectores históricos y valida los artefactos conservados. No necesita volver a compilar los circuitos cuando sus componentes originales siguen siendo idénticos.

```sh
./dev sources status
./dev sources prepare
./dev sources verify --generation <huella-devuelta-por-prepare>
```

`status` lee las fuentes editables y muestra las diferencias respecto a la publicación existente: release nativa, catálogo de ejecución paginada nativa y catálogo de grafos paginados. También identifica copias de ejecución desactualizadas y comprueba los hashes publicados del ledger V5 y W39 V9. No escribe archivos.

`prepare` actualiza las copias de compatibilidad mediante el constructor incremental, captura las dependencias actuales en un contrato V7 independiente de las publicaciones anteriores. Produce un candidato si pasan las comprobaciones del ledger, los doce roles nativos y los cinco roles paginados. Si falta un original o falla una comprobación, muestra su código concreto y devuelve estado 2. La captura disponible permanece para examinar el problema; no se genera un candidato válido.

Para consultar todos los archivos y sus diferencias:

```sh
./dev sources status --json
```

`./dev sources check` devuelve estado 1 si las fuentes o artefactos difieren de la **publicación existente**, o si las copias de compatibilidad están desactualizadas. Preparar un candidato no publica esos cambios: por eso este comando puede seguir detectando diferencias después de una preparación correcta.

## Qué se guarda

Los resultados viven en `.local/generations/`, fuera del código versionado:

| Archivo | Contenido |
| --- | --- |
| `<huella>/sources.json` | Fuentes, dependencias, diferencias y referencias a sus bytes. |
| `<huella>/candidate-release.json` | Candidato V7 que une el cierre actual de fuentes con las publicaciones originales y los recibos de reutilización W39, N32 y paginada. Solo aparece tras una inspección correcta. |
| `<huella>/reuse-receipt.json` | Nuevo recibo V6 que declara la reutilización exacta del W39 V9 conservado. |
| `<huella>/inspection-<huella>.json` | Resultado concreto de la inspección, incluido el motivo de un rechazo. |
| `objects/<sha256>` | Bytes de fuentes compartidos entre generaciones. |

`verify --generation <huella>` relee los objetos, las fuentes actuales, los exports y reglas de reubicación; vuelve a autenticar los artefactos conservados. Rechaza una captura manipulada o desactualizada y devuelve `READBACK_VERIFIED` cuando todo coincide. No modifica la generación.

Repetir la preparación con las mismas fuentes reutiliza la generación y los objetos existentes. No crea otra copia del repositorio, herramientas, redes, custodia o compilaciones. Una modificación del objeto guardado se detecta y detiene la preparación.

## Qué se considera una dependencia

La captura sigue los imports ESM literales, las URLs de módulos y los exports públicos declarados en los paquetes `@lianum/*` conocidos, partiendo del inventario publicado y sus reubicaciones explícitas. Los archivos TypeScript móviles están inventariados por bytes; este comando no certifica el cierre del bundler móvil. Las cargas con `createRequire` se enumeran como recursos que necesitan validación del consumidor. Incluye el `package.json` que decide cada export y el código al que apunta. Rechaza paquetes desconocidos, exports privados, rutas que escapan del paquete y enlaces simbólicos. Vuelve a comprobar los bytes tras la inspección para detectar ediciones concurrentes.

El informe de compilación sigue los módulos importados desde la entrada de compilación W39. Permite distinguir cambios de esos módulos de cambios en los lanzadores Python o shell. Los paquetes del compilador, circuitos, CRS y componentes resultantes conservan además sus validaciones específicas. Este informe ayuda a determinar el trabajo afectado; no concede permisos de ejecución ni sustituye una prueba criptográfica.

## Artefactos N32 y paginados

N32 comprueba sus nueve entradas originales de compilación en el archivo de entrega, con el manifiesto original fijado. Las fachadas nuevas de recursos no se hacen pasar por aquellas entradas. El lector conserva las verificaciones de programa, ABI, clave, stats, toolchain y CRS.

El inspector paginado autentica ambos manifiestos retenidos y los cinco programas, claves y contratos Solidity; también verifica los circuitos y configuraciones originales. Autentica los 100 registros originales: 58 entradas de compilación y 42 fuentes host. Los cuerpos históricos que cambiaron están archivados con sus hashes exactos; se conservan como evidencia y no se ejecutan. Registra esos lanzadores por separado de las fuentes actuales. Los lectores financieros mantienen sus condiciones originales.

## Cómo se reutiliza W39

V9 sigue siendo la generación del artefacto original. V6 identifica el **nuevo procedimiento de preparación y su recibo de reutilización**; no afirma haber recompilado V9.

La inspección comprueba los ocho archivos contra sus hashes publicados, el recibo original, la cápsula original de fuentes, los bytes de Noir/Nargo/programa/clave/Solidity, el ABI, ACIR, AST, opciones de compilación, toolchain y CRS. Reutiliza el validador semántico de componentes existente. Los lanzadores actuales se registran en las fuentes actuales; no se presentan como productores de una compilación anterior.

El consumidor financiero V5 conserva sus comprobaciones. El candidato V7 y sus recibos son datos para revisión: no emiten la marca interna que autoriza a usar un bundle, no publican un release y no declaran una operación financiera aceptada. La publicación y la adopción de una nueva generación por ese consumidor requieren un cambio explícito con su validación correspondiente.

## Cambios de dependencias locales

Los hashes vigentes se calculan con un comando; no hace falta editar cadenas
SHA a mano al cambiar una fuente o un manifiesto permitido:

```sh
./dev pins check
./dev pins check --profile platform --json
./dev pins update
git diff
./dev sources prepare
```

`check` solo lee y devuelve 1 si hay cambios propuestos, 2 si encuentra un
problema que impide prepararlos. Su salida enumera cada campo anterior y nuevo;
`--json` incluye además el diff exacto de los archivos propuestos. `update`
aplica únicamente esos campos en las tres tablas vigentes. Repetirlo con los
mismos archivos no escribe nada.

| Perfil | Campos actualizables | Datos que solo se verifican |
| --- | --- | --- |
| `mobile` | Hash de tres manifiestos y digest del catálogo | Versiones e integridades Noble, 46 archivos públicos instalados |
| `platform` | Hash y tamaño de las 15 fuentes/manifiestos declarados | Los 138 archivos públicos y sus 14 paquetes exactos |
| `callers` | Hash y tamaño de los 25 consumidores locales declarados | Lista exacta de rutas revisadas |

El perfil `platform` incluye automáticamente `callers`: el backend autentica
la propia cápsula de Platform y ambos hashes deben actualizarse juntos. `all`
es el valor por defecto. `scripts/development/source-pins.json` declara las
rutas permitidas; añadir una ruta o cambiar dependencias públicas exige
revisar explícitamente esa política, nunca se incorpora por descubrimiento
automático. El comando rechaza symlinks, entradas privadas, archivos originales
históricos y cambios concurrentes detectados antes o durante la escritura.
Los archivos de salida se sustituyen de forma atómica individualmente; si se
detecta una edición concurrente se revierten únicamente las escrituras que
siguen siendo las del comando, sin pisar la edición ajena.

`sources prepare` comprueba primero el perfil móvil, que ya es obligatorio
para el productor nativo. Si está desactualizado muestra el comando de revisión
y termina; no llama a `pins update` ni exige instalar Cloud para preparar las
fuentes nativas. Actualizar pins identifica el código actual para revisión:
no modifica publicaciones ni recibos originales, no publica un release y no
acepta financieramente esa generación.

Al trasladar contratos o primitivas a paquetes compartidos cambian los
manifiestos locales. El catálogo actual mantiene fijados sus hashes y los de
las dependencias públicas instaladas. La preparación actual autentica la publicación
retenida completa mediante un digest histórico fijo, y valida el candidato con
el catálogo actual. No reescribe el catálogo registrado dentro de una publicación
antigua ni declara que sus fuentes fueran las actuales.

El consumidor financiero V5 conserva sus comprobaciones: rechaza una publicación
que ya no corresponda al catálogo o código actual. `VALIDATED_CANDIDATE` confirma
la preparación y procedencia comprobadas; su adopción económica sigue siendo un
paso distinto. Una prueba HOST no sustituye esa aceptación.
