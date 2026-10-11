# Comandos de desarrollo

Generado desde `scripts/development/workflows.json`; `./dev help` usa el mismo catálogo.

```text
./dev start                             Arrancar la wallet desde fuentes editables; Ctrl+C para cerrar
./dev platform [admission|original-native-new|original-native-reopen] Arrancar API o perfil original explícito, con estado conservado
./dev build                             Preparar paquetes y lock; no genera la compatibilidad
./dev check                             Comprobar módulos, análisis estático y selección host
./dev test [rutas] [--timeout 120]      Pruebas host con salida en directo y plazo por selección
./dev test --changed [--plan]           Seleccionar pruebas del cambio; límite de 24 archivos y 120 s
./dev test --component NOMBRE           Comprobaciones acotadas de uno o varios componentes
./dev static [--changed]                Sintaxis e imports del núcleo; checkJs estricto de APIs declaradas
./dev status                            Presencia y versión de herramientas; no certifica integridad
./dev prepare [host|mobile|platform]    Instalar dependencias públicas del perfil
./dev workflows                         Entradas vigentes y alcance de cada comprobación
./dev boundaries                        Comprobar dependencias y exports entre módulos
./dev sources [status|prepare|check|verify|adopt] Inspeccionar, preparar, verificar o adoptar por digest una generación de fuentes
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
