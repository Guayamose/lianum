# Preparar fuentes y reutilizar artefactos

La generación de desarrollo identifica las fuentes actuales y reúne un candidato revisable. El comando prepara automáticamente las copias de compatibilidad que necesitan los lectores históricos y valida los artefactos conservados. No necesita volver a compilar los circuitos cuando sus componentes originales siguen siendo idénticos.

```sh
./dev sources status
./dev sources prepare
```

`status` lee las fuentes editables y muestra las diferencias respecto a la publicación existente: release nativa, catálogo de ejecución paginada nativa y catálogo de grafos paginados. También identifica copias de ejecución desactualizadas y comprueba los hashes publicados del ledger V5 y W39 V9. No escribe archivos.

`prepare` actualiza las copias de compatibilidad mediante el constructor incremental, captura las dependencias actuales y ejecuta la inspección de reutilización V6. Produce un candidato si pasan las comprobaciones del ledger y los doce roles de verificación. Si falta un original o falla una comprobación, muestra su código concreto y devuelve estado 2. La captura disponible permanece para examinar el problema; no se genera un candidato válido.

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
| `<huella>/candidate-release.json` | Candidato V6 con el release propuesto, sus fuentes actuales y los roles inspeccionados. Solo aparece tras una inspección correcta. |
| `<huella>/reuse-receipt.json` | Nuevo recibo V6 que declara la reutilización exacta del W39 V9 conservado. |
| `<huella>/inspection-<huella>.json` | Resultado concreto de la inspección, incluido el motivo de un rechazo. |
| `objects/<sha256>` | Bytes de fuentes compartidos entre generaciones. |

Repetir la preparación con las mismas fuentes reutiliza la generación y los objetos existentes. No crea otra copia del repositorio, herramientas, redes, custodia o compilaciones. Una modificación del objeto guardado se detecta y detiene la preparación.

## Qué se considera una dependencia

La captura sigue los imports relativos y los exports públicos declarados en los paquetes `@lianum/*` conocidos. Incluye el `package.json` que decide cada export y el código al que apunta. Rechaza paquetes desconocidos, exports privados, rutas que escapan del paquete y enlaces simbólicos. Vuelve a comprobar los bytes tras la inspección para detectar ediciones concurrentes.

El informe de compilación sigue los módulos importados desde la entrada de compilación W39. Permite distinguir cambios de esos módulos de cambios en los lanzadores Python o shell. Los paquetes del compilador, circuitos, CRS y componentes resultantes conservan además sus validaciones específicas. Este informe ayuda a determinar el trabajo afectado; no concede permisos de ejecución ni sustituye una prueba criptográfica.

## Cómo se reutiliza W39

V9 sigue siendo la generación del artefacto original. V6 identifica el **nuevo procedimiento de preparación y su recibo de reutilización**; no afirma haber recompilado V9.

La inspección comprueba los ocho archivos contra sus hashes publicados, el recibo original, la cápsula original de fuentes, los bytes de Noir/Nargo/programa/clave/Solidity, el ABI, ACIR, AST, opciones de compilación, toolchain y CRS. Reutiliza el validador semántico de componentes existente. Los lanzadores actuales se registran en las fuentes actuales; no se presentan como productores de una compilación anterior.

El consumidor financiero V5 conserva sus comprobaciones. El candidato V6 y su recibo son datos para revisión: no emiten la marca interna que autoriza a usar un bundle, no publican un release y no declaran una operación financiera aceptada. La publicación y la adopción de una nueva generación por ese consumidor requieren un cambio explícito con su validación correspondiente.
