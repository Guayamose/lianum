# Lianum: estado al pausar el 7 de octubre de 2026, 18:00 UTC

El desarrollo está pausado por petición de Rafa. Los cinco responsables han confirmado la pausa; no quedan pruebas, compilaciones ni procesos nativos lanzados por estos responsables en ejecución. No se continuará hasta nueva instrucción.

## Resumen honesto

- Código actual recuperado: los 1.684 archivos del estado cerrado más reciente, con sus bytes, hashes y permisos comprobados. Se conserva la cadena de cambios original.
- Ninguno de los puntos originales completos está al 100%. La referencia aproximada global sigue siendo alrededor del 58%; es una estimación de alcance, no una medición ni una promesa de plazo.
- Se recuperaron código, pruebas y evidencias públicas. El estado privado del entorno de pruebas anterior (identidades/secretos y estado vivo de las redes) no está en esos respaldos y no se ha recuperado. No se presenta una nueva identidad como la antigua.
- Los componentes públicos de ejecución y pruebas criptográficas se han recuperado en una zona separada. No se han integrado todavía todos en el árbol actual: hay 24 conflictos con versiones históricas que no deben sobreescribir código actual y falta una versión histórica de un módulo de despliegue. Este ZIP es código fuente, no un entorno listo para ejecutar.

## Puntos originales: resultados y pendientes

1. **Wallet unificada.** Existen cliente web, API, SDK, revisión manual de operaciones y consultas públicas de las siete redes. Falta cerrar el recorrido integrado completo, la integración del registro de cuatro propietarios, UX y recuperación final. Las consultas públicas no equivalen a siete redes privadas completamente soportadas.
2. **Capa de privacidad.** Hay circuitos, commitments, nullifiers, cuentas privadas y pruebas reutilizables. Faltan garantías integradas frente a metadatos/infraestructura y revisión criptográfica independiente. No está auditada externamente.
3. **PAEG.** Hay grafo acotado de cuatro posiciones, dependencias, controles anti-replay y composición de pruebas. Falta cerrar la ejecución nativa completa con las rutas externas actuales, la generalización adicional y su aceptación de extremo a extremo. Se ha identificado, pero no corregido, que un adaptador nativo sin respuesta puede impedir observar una recuperación de fondos ya finalizada.
4. **Atomicidad económica y recuperación.** Existen reservas, liquidación y devolución del saldo comprometido. Falta cerrar todos los fallos/reinicios en la integración actual. Devolver una reserva no revierte transferencias ya confirmadas en otras redes. Deben conservarse los riesgos y obligaciones pendientes de los ejecutores.
5. **Composición privada con DeFi.** El recorrido local de bóveda anterior está aceptado. Hay evidencia parcial real local con Uniswap V3 y pruebas de depósito/retiro. Falta el ciclo completo MetaMorpho, el control manual de mínimo recibido/plazo y su integración de recuperación. No se declara integración completa de Uniswap, Aave, Morpho y Jupiter.
6. **Estado privado global.** Hay separación de disponibles/reservados/pendientes, posiciones y valoración, con desconocido distinto de cero. Falta cerrar la coherencia y recuperación integradas entre todas las redes y propietarios.
7. **Siete redes en profundidad.** Existen observaciones públicas para las siete; Tron tiene transferencia local real y recuperación parcial aceptadas. La integración Tron con el registro nuevo de propietarios todavía tiene conflictos sin resolver. Solana tiene un bloqueo del entorno en la validación nativa; su comprobación final se difirió al entorno compatible del usuario, sin autorizar una migración ahora. Quedan las aceptaciones completas por red y combinadas.

El agente autónomo está excluido: Rafa se encarga de esa parte.

## Críticas adicionales aún abiertas

- Mantenibilidad y documentación: arquitectura modular y documentación presentes; quedan integración y simplificación de los caminos históricos.
- Trust model: todavía hay confianza en operadores/autoridades/RPC. No se puede vender como verificación independiente completa de todas las redes.
- Privacidad del sistema: timing, cantidades y consultas a infraestructura siguen siendo límites relevantes.
- Performance: no se ha demostrado el objetivo de menos de 30 segundos de sobrecoste PAEG warm.
- Auditoría: no hay auditoría criptográfica externa ni certificación obtenida.

## Trabajo de esta última sesión, sin inflarlo

Se restauró exactamente el código y sus respaldos públicos. Se identificaron huecos concretos para los responsables de bloques completos. Al pedir la pausa:
- Wallet/estado: sin nuevas modificaciones de producto
- Privacidad/runtime: dependencias recuperadas por separado; sin implementación nueva de privacidad
- Redes: borrador de integración con dos archivos en conflicto; no instalado
- PAEG: un test de regresión sin terminar; falló su preparación antes de ejecutar casos; el error de reconciliación sigue sin corregir
- DeFi: detectado el hueco del retiro MetaMorpho; no se empezó la implementación

Los borradores no cuentan como funcionalidades terminadas. Las pruebas existentes aceptadas no se vuelven a presentar como nuevas.
