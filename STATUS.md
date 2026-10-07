# Estado actual

El entorno público de desarrollo está restaurado. La estructura física se ha
reorganizado en `apps`, `packages`, `contracts`, `tests`, `scripts`,
`experiments`, `docs` y `archive`. El código editable usa imports de esa
estructura; el arranque prepara una copia interna compatible con los pines
históricos.

- Los 1.684 archivos del recorrido original se reproducen con sus bytes y
  permisos originales. La copia archivada permanece independiente del código
  editable.
- Compilación y tipos de 42 fuentes Solidity, diagnóstico Noir/Barretenberg y
  arranque HTTP de la wallet desconectada: comprobados.
- Lectores públicos CI51, CO42 e I84: comprobados.
- La selección de nueve archivos de pruebas conserva 157 resultados correctos
  y dos fallos anteriores. Uno impide cargar los casos del servidor por un
  mock desactualizado; otro espera una lista antigua de exportaciones.

El producto completo y su laboratorio privado no están reconstruidos. Faltan
sesiones privadas nuevas, validación de extremo a extremo, revisión de las
cadenas y cierre del trabajo de privacidad, rendimiento y DeFi. El gate
canónico de Tron continúa cerrado.

Ejecuta `npm run check`, `npm test`, `npm run doctor` y `npm run evidence` para
obtener resultados actuales. Los informes están en `.internal/dev/reports/`.
`doctor` comprueba la integridad de la base original; al editar lógica ligada
a pines, su hash puede cambiar y requiere revisión como parte del cambio.

Los documentos anteriores a la restauración están en
[archive/delivery](archive/delivery/). Sus fechas y porcentajes describen
la entrega histórica, no el estado de desarrollo actual.

## Organización interna — 8 de octubre de 2026

Se han recolocado 1.137 archivos por dominio y separado implementación,
pruebas, fixtures y documentación. La wallet tiene `src/client`, `src/server`,
`tests` y `docs`; backend, custodia, workers, motor y protocolo siguen la
misma separación. Los componentes y dominios principales tienen guías breves.
Las carpetas de trabajo contienen como máximo 15 fuentes del inventario
original en un mismo nivel, frente a 146 antes de esta segunda reorganización.

Los 1.684 archivos del recorrido de ejecución conservan sus bytes y permisos.
La selección habitual mantiene 157 resultados correctos y dos fallos previos.
Una selección adicional de encoding resuelve exactamente tres archivos y da
13 resultados correctos y dos fallos por artefactos históricos ausentes:
`candidate-poseidon/.local/component/attempts/prove-2/public-inputs.json` y
`flat-wallet/.local/contracts/2e02620a-404c-4c27-9ac2-4132713e083b/compiled.json`.
Esos tests conservan su contenido original; no se han regenerado los
artefactos ni ocultado los fallos. El resultado adicional está en
`.internal/dev/reports/component-directory-tests.json`.

## Evaluación del producto — 8 de octubre de 2026

El proyecto tiene un prototipo técnico avanzado y un entorno público útil
para continuar el desarrollo. Todavía no tiene una aceptación conjunta
reproducida en un laboratorio nuevo, una aplicación móvil nativa ni un
despliegue operativo de la arquitectura objetivo en Google Cloud.

La entrega del 7 de octubre estimaba un 58% global. Ese número no procedía de
una medición. La restauración y las dos reorganizaciones han conservado la
lógica original: mejoran el entorno y la navegación, pero no completan
funcionalidades del producto.

### Estimación por los puntos originales

Los rangos siguientes son una valoración orientativa de la cobertura técnica,
basada en las fuentes, las evidencias históricas conservadas y las
verificaciones locales existentes. No son porcentajes medidos, aceptación
actual de cada bloque, ni una estimación del tiempo restante. Ningún punto
está cerrado.

Para interpretar los rangos: 25–50% corresponde a componentes y pruebas
aisladas; 50–75%, a recorridos parciales demostrados; 75–90% requeriría
integración reproducible del bloque; 100%, cumplimiento de sus requisitos
originales y de los requisitos transversales que le afectan. Los puntos se
solapan y no constituyen unidades iguales de trabajo.

| Punto original | Cobertura orientativa | Base disponible | Trabajo que impide cerrarlo |
| --- | --- | --- | --- |
| 1. Wallet unificada | 50–60% | Cliente web, API, SDK, consentimiento manual y consultas públicas para las siete redes. | Recorrido integrado de financiación, autorización, ejecución, estado y recuperación; experiencia móvil con custodia en el dispositivo. |
| 2. Privacidad por defecto | 40–50% | Circuitos, compromisos, nullifiers, cuentas privadas y pruebas reutilizables. | Garantías del sistema frente a correlación por importes, tiempos, financiación, retiradas, RPC e infraestructura; modelo de observadores y revisión independiente. |
| 3. PAEG genérico | 60–70% | Grafo acotado de cuatro slots, dependencias, autorizaciones, anti-replay y evidencias históricas de pruebas reales. | Reconciliación nativa correcta, aceptación de las rutas actuales y generalidad comprobada al componer acciones; cuatro slots no son grafos ilimitados. |
| 4. Liquidación y recuperación económica | 55–65% | Reservas, liquidación, liberación/devolución y escenarios históricos de entrega parcial y reinicio. | Fallos combinados en la integración actual, reintentos sin duplicación y asignación explícita de pérdidas, liquidez y obligaciones del ejecutor. |
| 5. DeFi privado real | 35–45% | Bóveda local aceptada históricamente, posiciones, controles de mínimo/plazo y evidencia parcial local de Uniswap V3. | Ciclo completo de MetaMorpho, retirada/redención y recuperación integradas; no hay aceptación completa de Uniswap, Aave, Morpho y Jupiter. |
| 6. Estado privado global | 55–65% | Disponibles, reservados y pendientes diferenciados; notas, posiciones, persistencia y tratamiento de datos desconocidos. | Coherencia entre redes y propietarios durante ejecución, reinicio y recuperación, sin créditos o envíos duplicados ni saldos disponibles ficticios. |
| 7. Redes heterogéneas en profundidad | 45–55% | Lectores de las siete redes, adaptadores EVM/SVM/UTXO/Tron y recorridos nativos locales históricos. | Aceptación actual por red y combinada, finalidad/reorganizaciones, Solana en el entorno restaurado e integración canónica de Tron. |
| 8. Agente autónomo | Fuera del alcance | Integración futura mediante API, SDK y permisos. | Su implementación corresponde a Rafa y no entra en el porcentaje de este proyecto. |

La referencia global razonable sigue siendo aproximadamente 50–60% de
cobertura técnica. No se obtiene un porcentaje de producto listo para
producción a partir de estos rangos ni de la proporción de tests correctos.
La distancia pendiente incluye integración, producto móvil, operación y
validación; no se limita a acabar pequeñas funcionalidades.

### Bloqueos comprobables

- La selección habitual de tests sigue fallando: mock desactualizado del
  servidor y expectativa antigua de exportaciones del cliente. Un archivo
  falla al cargar y sus casos todavía no se ejecutan. Una selección adicional
  necesita dos artefactos históricos ausentes; no es la suite completa.
- En `packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs`,
  `reconcile()` espera a los adaptadores de admisión antes de observar el
  resultado terminal conservado. Un adaptador sin respuesta puede impedir
  reconocer una recuperación que ya finalizó. El problema sigue sin corregir.
- El runtime personalizado de Solana está recuperado y se ha comprobado su
  versión. Eso no demuestra una ejecución nativa nueva. Tron conserva
  `OWNED_TRON_RUNTIME_RELEASE=null`; también hay rutas de aceptación local
  posteriores con gates cerrados. Recuperar binarios no habilita esas rutas.
- El laboratorio privado anterior no se recuperó. Hay que crear identidades,
  claves de prueba y estado de redes nuevos, sin presentarlos como el original.
- El código tiene imports entre paquetes y dependencias de fixtures y
  experimentos. La ejecución utiliza una copia interna compatible con las
  rutas históricas; los paquetes todavía no son unidades independientes.
- Git está inicializado, pero no tiene commits ni remoto configurado. Falta
  establecer una base versionada de la restauración antes de cambios de lógica.

### Requisitos transversales

| Requisito original | Estado |
| --- | --- |
| Mantenibilidad y documentación funcional | Organización física y guías mejoradas; quedan variantes históricas, módulos grandes, acoplamiento y portabilidad. |
| Generalidad real | Existe el perfil de cuatro slots; falta demostrar la composición de las rutas actuales con las mismas garantías. |
| Confianza minimizada | Persisten supuestos sobre autoridades, operadores y RPC. Claves distintas en un laboratorio no prueban operadores independientes; custodia de una nota no equivale a custodia del activo nativo. |
| Privacidad del sistema | La criptografía parcial no cierra las filtraciones por metadatos ni la privacidad frente a colusión. |
| Revisión criptográfica independiente | Pendiente; las pruebas y revisiones internas no equivalen a una auditoría externa. |
| Rendimiento | Sin medición completa que demuestre los objetivos en caliente: sobrecoste propio <30 s, pruebas <20 s y coordinación/liquidación <5 s, midiendo la finalidad nativa aparte. |

La custodia móvil, el monolito modular en Cloud Run, los workers separados y
los servicios de soporte siguen siendo arquitectura de destino. No se ha
encontrado un proyecto móvil nativo ni una configuración de despliegue GCP
reproducible en el árbol de trabajo inspeccionado.

Fuentes: [puntos y requisitos originales](archive/delivery/PROJECT-VISION.md),
[estado de la entrega](archive/delivery/STATUS.md), fuentes actuales y los
informes `readiness.json`, `smoke.json`, `host-tests.json`,
`component-directory-tests.json`, `restored-readers.json` y
`component-organization.json` en `.internal/dev/reports/`. Esta evaluación
revisa resultados ya obtenidos; no declara nuevas ejecuciones de las cadenas
ni nuevas pruebas criptográficas. El orden de continuación está en
[ROADMAP.md](ROADMAP.md).
