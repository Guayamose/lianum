# Visión del producto Lianum

Los objetivos, la arquitectura y los requisitos siguientes proceden de la
[visión original completa](archive/delivery/PROJECT-VISION.md). Son el alcance
del producto. El estado de implementación está en [STATUS.md](STATUS.md) y el
trabajo pendiente en [ROADMAP.md](ROADMAP.md).

## Visión original y alcance vigente

1. **Una wallet para siete redes.** Ethereum, Base, Arbitrum, BNB Chain, Solana,
   Tron y Bitcoin deben funcionar desde una experiencia y una cuenta coherentes.
   No basta mostrar sus saldos mediante lectores RPC: el objetivo incluye los
   flujos autorizados de uso, gasto, conciliación y recuperación de cada red.
2. **Privacidad por defecto.** Proteger saldos, posiciones, direcciones,
   estrategias y rutas. Hay que tratar tanto la información del estado y las
   pruebas como las correlaciones por cantidades, tiempos, financiación,
   retiradas, RPC y actividad entre redes. Una prueba ZK aislada no resuelve
   automáticamente la privacidad del sistema.
3. **PAEG como primitiva genérica de grafos privados.** Expresar pasos,
   dependencias, autorizaciones, condiciones y cumplimiento global. Cada
   ejecutor recibe lo necesario para su parte; el grafo completo y su topología
   no deben exponerse por defecto. Añadir combinaciones de pasos o redes debe
   reutilizar la relación/verificador y los contratos de evidencia, no exigir
   un circuito distinto para cada ruta. El perfil actual tiene cuatro slots;
   esa cota no equivale a soportar grafos arbitrariamente grandes.
4. **Liquidación condicional y recuperación económica.** Pagar o liberar
   reservas según el resultado global, impedir doble cobro y resolver timeout,
   entregas parciales, mensajes perdidos, indisponibilidad y eventos adversos.
   Separar atomicidad del ledger, compromiso/aborto del protocolo y resultado
   económico del usuario mediante reservas/solvers/recuperación. Una transacción
   de otra cadena ya finalizada no se deshace mágicamente; pérdidas, liquidez,
   comisiones y supuestos de solvencia deben quedar asignados explícitamente.
5. **Composición DeFi privada real.** Integrar acciones y posiciones de
   protocolos reales mediante los grafos, con conservación, respaldo,
   autorizaciones y recuperación. Una demo transparente, un saldo observado o
   una estimación de canje no cuentan por sí solos como composición privada ni
   como activos disponibles para gastar.
6. **Estado privado global coherente.** Representar activos, notas, posiciones,
   reservas y operaciones pendientes/finalizadas con identidad por activo y
   dominio. Conservar estados durables, detectar datos obsoletos, conciliar el
   efecto original y recuperarse de reinicios sin duplicar créditos o envíos.
   No sumar unidades de activos distintos ni presentar datos desconocidos como
   saldo cero o como dinero disponible.
7. **Soporte real de modelos heterogéneos.** Tratar correctamente EVM, SVM,
   UTXO y Tron: identidad de red, finalidad, reorganizaciones, firmas, comisiones,
   recepción, observación y reintentos. La interfaz común debe conservar las
   diferencias de seguridad; compatibilidad de formato no implica garantías
   equivalentes de finalidad.
8. **Agente externo a nuestro alcance.** La visión original incluía un agente,
   pero Rafa excluyó toda esa parte de nuestro trabajo el 5 de octubre de 2026.
   Él implementará e integrará su agente. Nuestro alcance termina en la wallet,
   API, SDK, permisos y documentación general: no incluye agente, prompts,
   planner ni lógica autónoma. El 100% de nuestro trabajo excluye ese componente.

## Arquitectura de destino

El destino es un producto corporativo mantenible, no una colección indefinida
de arneses de pruebas. La referencia visual proporcionada por el usuario se
incluye en el paquete bajo `analysis-reference/` cuando está disponible.

- **Mobile iOS/Android:** custodia de las claves raíz del usuario, consentimiento,
  preparación de autorizaciones y recuperación de su estado. El backend y los
  workers no deben recibir esas claves raíz.
- **wallet-platform en Google Cloud / Cloud Run:** monolito modular inicialmente
  desplegable como una unidad, con ocho módulos: API y permisos/límites/
  idempotencia; estado privado global y reservas; núcleo PAEG; solvers, precios
  y ejecución limitada; liquidación y recuperación; adaptadores de cadenas;
  adaptadores DeFi; y monitorización/operaciones.
- **Proof workers separados en Cloud Run Jobs:** entradas privadas acotadas a
  cada trabajo/rol, contratos de datos explícitos, programas y claves de
  verificación fijados, y ausencia de claves raíz del usuario.
- **Servicios de soporte:** Cloud SQL, Pub/Sub o Tasks, almacenamiento GCS
  cifrado y Secrets/KMS para credenciales de infraestructura. KMS no sustituye
  la custodia móvil de claves raíz. El diseño incluye ciclo de vida, retención,
  conciliación, observabilidad y recuperación de fallos.
- **Integración externa futura:** Rafa se ocupa íntegramente de su agente.
  La wallet expone interfaces, permisos y límites generales de producto; no
  implementamos ese consumidor ni su lógica.

Esta es la arquitectura objetivo. Las carpetas `mobile-core`, `wallet-platform`
y `proof-workers` actuales representan separaciones de código; no prueban que
haya apps móviles nativas, aislamiento hostil entre procesos o despliegue de
producción terminado. No se ha autorizado gastar ni desplegar infraestructura
GCP por el mero hecho de utilizarla como arquitectura de destino.

## Seis requisitos que siguen guiando la construcción

1. **Código mantenible y documentación funcional.** Nombres y flujos legibles,
   módulos con responsabilidades claras y documentación que explique qué hace
   el sistema, cómo funciona y cómo se usa. Los diarios, hashes y resultados de
   pruebas son evidencia adicional, no reemplazan esa explicación. El legado
   aún necesita trabajo; no se afirma una migración completa de todo el código.
2. **Generalidad real.** Los compromisos, relaciones, verificadores y evidencia
   deben componer correctamente, no solo el coordinador. Preservar autorización,
   unión con el grafo, nullifiers, finalidad y recuperación al añadir operaciones.
3. **Confianza minimizada.** Sustituir la capacidad de un issuer/authority
   individual de inventar hechos SOL/BTC por verificación criptográfica o por
   mecanismos distribuidos con umbral. Declarar quién puede mentir, bloquear,
   firmar o custodiar; tres claves en una misma máquina no equivalen a tres
   operadores independientes. Custodia de una nota y custodia del activo nativo
   son cosas distintas y deben reflejarse en el producto.
4. **Privacidad del sistema.** Evaluar información de estado y metadatos bajo
   observadores y colusiones explícitos. No usar decoys cosméticos, ocultar datos
   de auditoría o rebautizar una ruta transparente para declarar privacidad.
   Esperas/umbrales de privacidad requieren consentimiento y un comportamiento
   de fallo honesto, sin cambiar silenciosamente a una opción menos privada.
5. **Revisión criptográfica independiente.** Preparar una implementación y
   material auditables. Tests automáticos y revisión interna asistida por IA no
   son una auditoría criptográfica externa, ni se presentarán como tal. Esa
   auditoría sigue pendiente; este trabajo local no autoriza contratación,
   contactos externos, publicación ni gasto.
6. **Rendimiento como requisito de diseño.** Objetivo ambicioso en caliente:
   overhead propio total menor de 30 segundos, generación más verificación de
   pruebas menor de 20 segundos, coordinación más liquidación menor de 5 segundos
   y esperas artificiales aproximadamente cero. La finalidad nativa se mide
   aparte. Deben fijarse carga, hardware y camino causal; no rebajar confirmaciones
   o garantías para aparentar cumplirlo. El objetivo aún no está alcanzado y no
   hay una medición completa en caliente que lo demuestre.

El ritmo acordado es implementar bloques funcionales, comprobar lo afectado y
continuar. Se conservan las verificaciones de seguridad, conservación,
recuperación y comportamiento esperado; se evita repetir campañas inalteradas
por cambios cosméticos o por un error de serialización de un arnés.
