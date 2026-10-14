# Comandos de desarrollo

El catálogo general procede de `scripts/development/workflows.json`;
`./dev help` usa ese catálogo. Los perfiles Paged indicados aquí se han
contrastado también con `apps/platform/src/entry.mjs` y su bootstrap.

```text
./dev start                             Arrancar la wallet desde fuentes editables; Ctrl+C para cerrar
./dev platform [admission|original-native-new|original-native-reopen|paged-native-new|paged-native-reopen|paged-mixed-new|paged-mixed-reopen|defi-new] Arrancar el perfil explícito; new exige estado nuevo, reopen conserva el original
./dev build                             Preparar paquetes y lock; no genera la compatibilidad
./dev check                             Comprobar módulos, análisis estático y selección host
./dev block-check [--plan]               Batería mantenida completa, imports runtime y tipos móviles; sin omisiones ni adopción
./dev test [rutas] [--timeout 120]      Pruebas host con salida en directo y plazo por selección
./dev test --changed [--plan]           Seleccionar pruebas del cambio; límite de 24 archivos y 120 s
./dev test --component NOMBRE           Comprobaciones acotadas de uno o varios componentes
./dev static [--changed]                Sintaxis e imports del núcleo; checkJs estricto de APIs declaradas
./dev status                            Presencia y versión de herramientas; no certifica integridad
./dev prepare [host|mobile|platform]    Instalar dependencias públicas del perfil
./dev workflows                         Entradas vigentes y alcance de cada comprobación
./dev boundaries                        Comprobar dependencias y exports entre módulos
./dev sources [status|prepare|check|verify|adopt] Inspeccionar, preparar, verificar o adoptar por digest una generación de fuentes
./dev sources prepare --adopt           Preparar y adoptar las fuentes actuales verificadas sin copiar hashes a mano
./dev bundle [build|verify|run]         Empaquetar fuentes y recursos declarados en un candidato trasladable
./dev pins [check|update] [--profile NOMBRE] Revisar o actualizar hashes actuales; conserva publicaciones históricas
./dev resources [status|check]          Espacio por función y rutas locales sin clasificar
./dev resources migrate-caches [--apply] Previsualizar o mover cachés a su ubicación común
./dev lab profiles                      Mostrar perfiles y alcance del inventario mínimo
./dev lab [plan|check] PERFIL           Inspeccionar dependencias del perfil sin ejecutar redes
./dev lab prepare-profile PERFIL        Preparar solo dependencias y compatibilidad necesarias del perfil
./dev clean [--scope caches|history|all] [--apply] Previsualizar limpieza por clase; --apply aplica la selección
./dev build --legacy                    Materializar expresamente la compatibilidad histórica
./dev legacy [start|node|test|check]    Ejecutar el recorrido heredado correspondiente
./dev doctor                            Comprobar restauración e integridad; necesita materiales
./dev artifacts                         Inventariar originales históricos ausentes
./dev evidence                          Verificar evidencias públicas originales restauradas
./dev node [args]                       Node local sobre las fuentes editables
./dev npm [args]                        npm con el Node local
./dev lab [prepare|run|recovery]        Laboratorio EVM explícito; no se añade a pruebas host
./dev lab [browser|browser-recovery]    Recorrido económico EVM desde el navegador
./dev lab [btc-sol|claims|osaka]        Laboratorios nativos explícitos; requieren materiales
./dev lab [defi|metamorpho]             Laboratorios DeFi explícitos con custodia y pruebas
./dev lab mobile-original               Cuenta original V2 pareada: lectura y conciliación
./dev lab mobile-original-ledger        Compilar ledger nativo V5 con watchdog propio
./dev lab audit-base                    Auditorías originales vacías; ejecución explícita
./dev [setup|import|restore-package]    Restauración de herramientas y materiales originales
./dev canonical                         Preparar la ubicación fija del lector I84
./dev [legacy-node|proof-node] [args]   Runtimes fijados de compatibilidad
```

Los arranques Paged disponibles desde la raíz son:

```sh
./dev platform paged-native-new     # Tres redes locales; entorno nuevo
./dev platform paged-native-reopen  # Mismo estado privado tras captura completa
./dev platform paged-mixed-new      # Tres redes + Uniswap; entorno nuevo separado
./dev platform paged-mixed-reopen   # Mismo entorno Mixed tras captura completa
```

**Aceptados LOCAL con custodia software:** Cold13 completó trece pruebas, los
tres pagos nativos, cambio de 300 unidades demo y tres reaperturas en cuatro
procesos backend. Mixed21 completó Uniswap y los tres pagos nativos, veintiuna
pruebas, cambio de 200 y cuatro pagos de 100 al proveedor. Sus cierres originales
están comprobados; las evidencias y límites figuran en [STATUS.md](../STATUS.md).

Mixed conserva ahora la composición original mediante captura ordenada y
`paged-mixed-reopen`; exige el mismo entorno y una captura autenticada completa.
No migra entornos antiguos sin retención ni resuelve cualquier caída abrupta.
La aceptación conjunta con reinicios y cartera se registra separadamente en
STATUS. Los resultados financieros ejercitan las funciones originales; no
acreditan por sí solos toda la interacción de los asistentes CLI ni el teléfono
físico. El arranque no financia notas automáticamente. Conserva los directorios retenidos y consulta
[la guía de plataforma](../apps/platform/README.md) antes de operar.
