# Trabajo hasta completar el producto Lianum

La referencia de alcance es [PROJECT-VISION.md](PROJECT-VISION.md), que conserva
los objetivos, arquitectura y requisitos de la visión original. Este plan se
organiza por esos objetivos. Las seis tareas de implementación anteriores eran
un orden de trabajo, no una definición distinta del producto. El avance y los
resultados están en [STATUS.md](STATUS.md).

## Avance comprobado y próximo cierre

Corte del 8 de octubre de 2026 con las aceptaciones privadas originales de
Uniswap y Aave.
Mantener los siete objetivos y seis requisitos de la visión, con los rangos
orientativos de STATUS sin recalcularlos por pruebas, módulos o commits.

- **Wallet y estado:** APK autónomo actualizado aceptado sin Metro, con
  custodia/firma nuevas, doce joins originales y pico RSS de grupo de
  2.339.147.776 bytes bajo el mismo límite de 3 GiB. La raíz, backup/restauración
  y firmas locales D26/D27 tienen diecinueve pruebas móviles de custodia y TSC correcto;
  Poseidon2 BigInt pasó seis vectores contra BB oficial. El SDK vinculado pasó
  dos pruebas genuinas, owners Linux y saldo privado 500→0. Cerrar financiación
  y PAEG desde la raíz React Native, recuperación y recorrido en dispositivo,
  además de las siete redes; los checks locales no cierran ese ciclo económico.
  El puente con firmas separadas PROVE_D26/FUND_D26 y su perfil fijo de una prueba
  quedaron aceptados en el perfil Node/TLS `03953f4a`: una prueba real,
  financiación única de 500 y respuesta perdida observada sin reenvío. No
  acredita SecureStore ni custodia física; la compilación APK nueva sigue
  pendiente. El último APK aceptado precede este puente.
- **Privacidad y generalidad:** preservar las garantías y el núcleo PAEG al
  añadir las entradas privadas DeFi. Resolver el modelo de observadores y
  colusiones y la privacidad de topología; los cuatro slots y un único host
  siguen siendo límites explícitos.
- **DeFi y liquidación:** los intentos Meta `2f5683bc` y `d35d8dfa` llegaron a
  quince pruebas/EXIT/redención real, pero conservan sus rechazos del driver.
  Las correcciones `a135359` y `4dc79b8` están aplicadas; los checks enfocados de
  reapertura/dedup pasaron, sin repetir ni reclasificar los ensayos originales.
  Uniswap `f485446e` está aceptado con quince pruebas genuinas: reserva privada,
  PAEG, swap, T, EXIT de origen/destino, pago al solver y replay sin efecto
  duplicado. Aave `2014f34a` quedó aceptado con quince pruebas reales, rendimiento,
  redención y replay, tras compilación genuina y verificación de fuentes/pins
  con los doce verificadores originales. Su cierre conservó los 34 procesos
  ausentes, sin señales. Uniswap F `c3a3b888` está aceptado con diez pruebas
  genuinas en 418,573 s: swap irreversible, F original, salida privada conservada
  y pérdida del solver sin pago T. Cerrar Meta completo y ampliar F/posiciones/protocolos;
  ninguna de estas aceptaciones locales cierra el objetivo 5 completo.
- **Redes heterogéneas:** conservar la composición BTC/SOL aceptada. El round
  trip `f9c90308` tuvo siete pruebas y auditoría caducada durante `BEGIN_PAYOUT`,
  sin envío de payout SOL; cerrar su resultado original sin firmar o pagar otra
  vez. Tron `attempt-3RVzzq` pasó las 12 comprobaciones nativas originales con
  JNI/RocksDB y cierre ordenado; el rechazo previo `EACCES` se conserva. El
  recorrido wallet V5 `a7e3da95` quedó rechazado con financiación real y cinco
  pruebas D26/U/S/P/R, sin I84 ni entrega nativa, por escritura original incierta
  durante preparación del proveedor; conserva el bloqueo de sustitución.
  Los nodos quedaron cerrados. El rechazo previo por
  publicación generada desfasada se conserva y el build la actualizó manteniendo
  los guards. Cerrar el recorrido con estado privado y GRAPH. Base, Arbitrum
  y BNB siguen pendientes con sus stacks y finalidad propios.
- **Rendimiento:** conservar los 2²¹ puntos, G2, VK y verificaciones originales.
  El cache público redujo la llamada API de inicialización de 27,017 a 0,612 s y
  ya intervino en pruebas genuinas verificadas: el nuevo Meta midió
  inicialización 1,063–1,311 s y prove del owner-envelope 87,310 s. Los cuatro
  hilos fijos ya se usaron en Uniswap con la misma VK y guard de RAM:
  pico 3.046.023.168 bytes bajo 3 GiB, prove U 37,369 s y verificación 17,262 ms.
  La variante fija U8 conserva los originales y el mismo guard: el nuevo Tron
  midió prove 28,520 s, verificación propia 17,513 ms y total 31,856 s; pico de
  pruebas 3.112.554.496 bytes bajo 3 GiB. Su recorrido completo quedó rechazado
  antes de entrega nativa y prove aún supera 20 s. F10 aceptado midió U12:
  prove 25,541 s, verificación 15,162 ms, total 28,102 s y pico 3.188.391.936 bytes.
  U16 `b3bcc678` permanece rechazado por RSS 3.244.568.576 bytes; el preflight
  `95900` no inició worker y ningún claim de job se eliminó. Mejorar su coste y medir su
  generalidad; los objetivos en caliente
  <30/<20/<5 s y la revisión criptográfica independiente siguen pendientes.

Preparar Google Cloud sólo localmente y comprobar el teléfono al final, según
la decisión vigente. Priorizar cierres funcionales y comprobar lo afectado;
conservar los rechazos originales y repetir recorridos cuando un cambio o fallo
lo justifique. Ninguna aceptación local cierra por sí sola un objetivo completo.

## 1. Wallet unificada para siete redes

Completar una experiencia y cuenta coherentes para Ethereum, Base, Arbitrum,
BNB, Solana, Tron y Bitcoin: financiación, revisión, autorización, reserva,
prueba, ejecución, finalidad, actualización de estado, salida y recuperación.

El recorrido web EVM está aceptado en laboratorio, incluida recuperación F,
reinicio de custodias y respuesta perdida. Completar el recorrido financiero
móvil sobre la cuenta y custodia originales; conectar las operaciones de cada
red a esa misma cuenta y a una interfaz que refleje su estado económico real.

Las claves raíz permanecen en el dispositivo del usuario. Completar
consentimiento, recuperación de custodia y operaciones pendientes. Un APK o una
consulta de RPC es un avance; el cierre exige los flujos completos del producto.
La comprobación física del teléfono se hace al final, según la decisión de Rafa.

## 2. Privacidad por defecto

Proteger saldos, posiciones, direcciones, estrategias y rutas, incluyendo las
correlaciones por importes, tiempos, financiación, retiradas, RPC y actividad
entre redes. Definir observadores y colusiones y cerrar las filtraciones del
estado, las pruebas, el transporte, los workers, el almacenamiento y la API.

La API móvil actual ve identidad estable, importes y destinos; el host del
worker ve testigos. Resolver esas exposiciones conforme al modelo de amenaza.
No declarar anonimato ni privacidad sistémica a partir de una prueba ZK o de
procesos con claves distintas en un único host. Toda espera o umbral de
privacidad exige consentimiento y comportamiento explícito ante fallo.

## 3. PAEG genérico

Conservar pasos, dependencias, autorizaciones, condiciones y cumplimiento
global. Cada ejecutor recibe sólo lo necesario para su parte; el grafo completo
y su topología no se exponen por defecto.

Componer nuevas acciones y redes reutilizando relaciones, verificadores y
contratos de evidencia, sin un circuito distinto por combinación de ruta.
Cerrar la generalidad real y los límites del perfil de cuatro slots; ese perfil
no equivale a admitir grafos arbitrariamente grandes.

El grafo Bitcoin → Solana está aceptado con el núcleo existente. Integrar las
acciones DeFi oficiales y las restantes redes conservando unión con el grafo,
nullifiers, autorización, finalidad, conservación y recuperación.

## 4. Liquidación condicional y recuperación económica

Pagar o liberar reservas según el resultado global y evitar doble cobro.
Completar timeout, entregas parciales, mensajes perdidos, indisponibilidad,
reinicio, reorganizaciones y pérdida de keeper, nodos o custodia. Asignar
explícitamente pérdidas, liquidez, comisiones y supuestos de solvencia.

La reconciliación terminal y la recuperación F desde la wallet están aceptadas.
Cerrar el payout Solana pendiente y ampliar los recorridos a los fallos de
procesos aún no cubiertos. Conservar el primer envío y su identidad; un resultado
incierto no autoriza otra firma o pago. Una entrega nativa finalizada se respeta
durante la recuperación del estado privado.

## 5. Composición DeFi privada real

Integrar acciones y posiciones de protocolos reales mediante el mismo PAEG,
con respaldo, conservación, autorización y recuperación. Completar entrada
privada, posición, acción, salida y redención en los protocolos originales
mediante las interfaces generales; ampliar las acciones de Aave y cerrar
MetaMorpho, Morpho y Jupiter conservando esos mismos criterios.

Uniswap ya tiene un recorrido aceptado desde reserva privada, con autorización,
estado común, respaldo, quorum, liquidación T y EXIT de ambas notas. Aave tiene
aceptación original de quince pruebas con rendimiento y redención reales,
compilación genuina y fuentes/pins íntegros. MetaMorpho llegó a redención real
pero conserva el rechazo del driver; completar su aceptación y ampliar F DeFi.
Uniswap F ya tiene aceptación genuina de diez pruebas, con entrega irreversible,
recuperación original del origen, salida privada del destino conservada y pérdida
del solver declarada sin T. Los ciclos públicos anteriores siguen acreditando entrada
pública a una nota privada y no se reclasifican como entrada privada. Una posición
observada, cotización o canje público no basta para emitir saldo privado gastable.

## 6. Estado privado global coherente

Representar activos, notas, posiciones, reservas y operaciones con identidad
por activo y dominio. Mantener estado durable, detectar datos obsoletos,
conciliar el efecto original y recuperarse de reinicios sin doble crédito,
reserva o envío. No sumar unidades incompatibles ni convertir desconocido en
cero o disponible.

Conectar el estado autenticado de la cuenta original al cliente móvil y a los
módulos del backend. Los registros SQL de permisos no sustituyen el estado
económico del ledger. Completar recuperación y coherencia durante las
operaciones de las siete redes y las posiciones DeFi.

## 7. Modelos heterogéneos y siete redes en profundidad

Conservar las diferencias de EVM, SVM, UTXO y Tron: identidad, firmas, comisiones,
recepción, finalidad, reorganizaciones, observación y reintentos.

- Ethereum: recorrido completo sobre sus garantías y configuración propias.
- Base, Arbitrum y BNB: aceptar sus stacks, identidad y finalidad propios;
  cambiar el chainId de Anvil no acredita OP Stack, Nitro o BSC.
- Bitcoin: completar recepción, gasto, respaldo, reorganizaciones y recuperación.
- Solana: cerrar payout original y su recuperación, además del ingreso y solver
  ya aceptados en Agave nuevo.
- Tron: conservar el factory nativo aceptado y completar su integración original
  con wallet, respaldo privado y GRAPH antes de habilitar el runtime.

Completar operaciones entre redes con el mismo PAEG y estado. Sustituir las
facultades de una autoridad individual SOL/BTC de inventar hechos por
verificación criptográfica o mecanismos distribuidos con umbral; claves
separadas en un host no son operadores independientes. Distinguir custodia de
nota y custodia del activo nativo.

## Arquitectura y requisitos transversales

Completar móvil iOS/Android con claves raíz del usuario; monolito modular en
Cloud Run; proof workers separados en Cloud Run Jobs sin claves raíz; Cloud SQL,
colas, GCS cifrado y Secrets/KMS para credenciales de infraestructura. Los ocho
módulos y sus responsabilidades están en la visión original. Preparar transporte
privado de jobs, retención, permisos, observabilidad, backups y recuperación.
GCP se prepara localmente hasta disponer de proyecto; desplegar y gastar siguen
siendo acciones separadas. KMS no sustituye la custodia móvil.

Mantener módulos legibles y documentación funcional; consolidar variantes y
reducir la dependencia de fixtures y de `.internal/runtime/`. Preparar material
auditable, obtener revisión criptográfica independiente y resolver hallazgos.
La revisión interna y los tests no sustituyen esa auditoría; contratarla no
está autorizado por este trabajo local.

Cumplir los objetivos en caliente con hardware, carga y camino causal declarados:
sobrecoste propio total <30 s, generación y verificación de pruebas <20 s,
coordinación y liquidación <5 s y esperas artificiales aproximadamente cero.
La finalidad nativa se mide aparte; las garantías se conservan al optimizar.

Convertir cada objetivo original y requisito transversal en criterios concretos
de aceptación y cerrar su cumplimiento conjunto. Desarrollar bloques funcionales,
comprobar lo afectado y continuar; repetir campañas cuando cambios o fallos lo
justifiquen. El agente externo permanece fuera del alcance y a cargo de Rafa.
