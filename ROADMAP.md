# Trabajo hasta completar el producto Lianum

La referencia de alcance es [PROJECT-VISION.md](PROJECT-VISION.md), que conserva
los objetivos, arquitectura y requisitos de la visión original. Este plan se
organiza por esos objetivos. Las seis tareas de implementación anteriores eran
un orden de trabajo, no una definición distinta del producto. El avance y los
resultados están en [STATUS.md](STATUS.md).

## Avance comprobado y próximo cierre

El plan conserva los siete objetivos y los requisitos de la visión. STATUS
explica los cierres funcionales y las estimaciones orientativas del corte;
ninguna cifra es una medida ni sustituye la cobertura y los pendientes concretos.

- **Wallet y estado:** EVM9 acepta D26/U/S, ejecución nativa, F, ambas W39 y
  cinco READ firmadas: diez secciones originales reabiertas en otro PID, una
  entrega y disponible final cero, sin efecto duplicado. La captura es ordenada
  y el Vault móvil permanece en el padre. Caída abrupta, teléfono y red pública
  siguen pendientes. La app conserva la operación cifrada y vuelve a observar
  el D26 original antes de preparar. Desconocido no significa cero.
- **Posiciones móviles:** pestaña, SDK y TLS implementados sobre catálogo,
  sesión y vault originales, con dos permisos propios y UNKNOWN/STALE/null.
  Pasaron cuatro HOST, dos de instalación/cierre y TSC. Meta y Aave aceptaron lecturas
  tras mint y redención, con las mismas quince pruebas y cierre antes de captura.
  Reabrieron cinco secciones por backend en otro PID sin envío nuevo. Custodia Linux;
  teléfono, caída abrupta y recuperación de GRAPH pendientes.
- **Entrada local y recuperación:** NativeEconomicNote y executor nacen antes
  de D26, con proveedores y tres bridges originales, sin financiación automática.
  La entrada manual reabre desde F ya confirmado. La entrada observada activa
  o desactiva recuperación con permiso fresco y conserva UNKNOWN sin reenviar.
  HOST/TSC pasaron. La regresión de timeout ya ejecuta el tick, recovery,
  envío y reconciliación originales con reloj controlado: antes del cutoff no
  prueba ni envía; al alcanzarlo conserva un único efecto incluso con respuesta
  perdida. El cutoff de 28.800 s permanece intacto. Por instrucción del usuario,
  no se ejecutan ni se exigen esperas reales de ocho horas para este cierre.
  El perfil LIVE_ARMED nuevo conserva su permiso armado y diez secciones
  originales con issuer propio de nueve horas; fuente y HOST del bridge pasaron.
  La variante corta `b923b217` aceptó tres pruebas D26/U/S→ARM→nuevo PID:
  misma reserva, autorización armada, Vault, journal y provider, diez secciones
  originales y nueva READ firmada, sin F antes del cutoff. Veinte procesos
  cerrados, fuentes/cleanup/lock confirmados, sin señales. No acredita F autónomo
  después de ocho horas, pérdida abrupta ni teléfono.
  F reorg `b4329b70` aceptó nueve pruebas, UNKNOWN durable, ambos outputs
  bloqueados, reapertura del Vault y la segunda reconciliación del mismo F.
  Conservó una única reemisión del wire original y ambas W39 sin doble pago.
  Sus 25 procesos cerraron, con fuentes/cleanup/lock confirmados y sin señales.
  La reorganización se acota al padre original exacto de F; los rechazos
  anteriores permanecen conservados.
- **Nota ERC20 propia del dispositivo:** el recorrido `da603751` está aceptado:
  D26/W39 originales, dos pruebas, dos envíos/receipts y backing 500→0, con
  respuestas perdidas reconciliadas en los mismos trabajos y sin duplicados.
  Reabrió cuatro secciones originales en otro PID para observar los mismos
  trabajos/nota sin nuevo efecto. Siete procesos cerrados, fuentes y cleanup
  confirmados, sin señales. No acredita teléfono ni caída abrupta. La entrada
  local crea la cuenta antes de aprobación exacta y TLS, sin financiar ni
  probar automáticamente; captura/reapertura tiene un productor propio.
- **Android:** APK `d07f578f` compilado y archivado para su corte:
  79 inputs iguales y 36 joins, Hermes y firma Debug/V2 comprobados, sin Metro.
  Diez procesos propios ausentes y cero señales en el informe original.
  Incluye el contrato de ambos outputs bloqueados. Instalación y uso físico
  quedan para el final. Los cortes anteriores siguen históricos;
  `6adc78c0` mantiene su preservación limitada.
- **DeFi y liquidación:** Uniswap15, Aave15, Meta15 ordinario y Uniswap F10
  conservan aceptación original. Aave lee shares/previewRedeem/maxRedeem del
  mismo bloque. Meta19 acepta quince relaciones, EXIT/redención, dos READ y
  reapertura del backend retenido en otro PID: mismas identidades/receipt,
  cinco secciones originales y envíos 79→79. No acepta recuperación del backend retenido
  ante pérdida abrupta ni salida del padre. Aave retenido acepta el mismo ámbito con envíos
  93→93, quince pruebas y dos READ. GRAPH conserva
  su autoridad y TOP_UP→EXIT la preparación original creada antes de financiar.
  MetaMorpho F1 acepta diez pruebas: mint irreversible, recuperación original
  y tres W39, sin efecto duplicado. Contabilidad Morpho conservada y ambos
  pools cerrados. Es un recorrido local con cutoff controlado; el destinatario
  original de shares es el solver, sin pérdida neta de riqueza acreditada.
- **Redes heterogéneas:** BTC/SOL combinado y Claims9 están aceptados en sus
  perfiles locales. Claims9 completó ocho pruebas y confirmó el cierre de
  205 procesos, sin señales; Claims8 conserva su raw rechazado. Jupiter tiene swap
  público y materiales oficiales. SPL29 pasó la autorización antes de clave
  en 22,493 s y auditó en 7,272 s bajo el mismo guard de 30 s, pero conserva
  rechazo tras trece pruebas por preparación caducada antes del envío. El cambio
  de firmantes se recorrió; UNKNOWN y su intento retenido no acreditan RPC,
  observación ni finalidad. Sus 109 procesos están ausentes, sin señales.
  No hay ingreso privado destino ni SPL20 completo aceptados. Tron tiene fábrica
  y entregas observadas, pero wallet/GRAPH siguen pendientes: Tron13 rechazó
  su auditoría completa a 35,152 s bajo el plazo original de 30 s, con una entrega
  observada. No hay otro cambio causal de Tron pendiente de aceptación.
  Base, Arbitrum y BNB requieren stacks/finalidad propios.
- **Privacidad y rendimiento:** el historial exige READ del mismo propietario
  y Origin exacto. Faltan privacidad sistémica/topología y operadores independientes.
  U, I84 y D26 midieron 13,174 s, 7,750 s y 1,331 s de prove/verificación,
  respectivamente, con sus ACIR/VK originales; son fases individuales. El
  almacén pasó 53 HOST y SPL29 midió auditoría final de 7,272 s; ningún HOST ni
  fase parcial acepta rendimiento global o permite renovar plazos.

La unión de estado original ya está conectada al backend y a la wallet, con
Vault/CAS y checkpoint capturado en la sección original del wallet. Reabre
STALE hasta observación y distingue dominio, importe disponible, reserva,
UNKNOWN y valoración. El consumidor móvil reúne sólo respuestas autenticadas
con permisos separados, sin permiso ni total global. HOST y TSC pasaron;
native/wrapped ya se instalan en sus arranques reales y conservan el checkpoint
en la sección original; HOST pasó (11.870 ms). El ancla ahora nace antes de
financiar y conserva las credenciales y checkpoints confirmado/pendiente con
AEAD/CAS/readback. Pasó el caso de sesión/Vault real (26.313,361 ms):
respuesta perdida, candidato no escrito y revisión ajena rechazada. Su opener
requiere las mismas fuentes ya restauradas. Conectar y aceptar la restauración
abrupta de esas fuentes sigue siendo el trabajo activo.
La actividad BTC/SOL original ya se muestra y Conciliar usa su ruta original.
El journal compara la estructura sin falsos cambios por orden JSON; conserva
los mismos bindings, checkpoints, comprobaciones frescas y permisos.

Próximos cierres funcionales:

1. Cerrar los puntos originales **4 y 6**: persistir antes de financiar las
   fuentes, credenciales y checkpoints originales; reabrir runtime, cuenta y
   keeper tras una caída sin renovar permisos ni duplicar efectos. Si un envío
   quedó incierto, conservar UNKNOWN y bloquear gasto hasta su conciliación.
2. Ampliar recuperación a fallos combinados y posiciones DeFi, comprobando
   los timeouts con reloj controlado y los efectos originales sin esperas largas.
3. Continuar los demás objetivos: ingreso privado SPL, Tron wallet/GRAPH,
   siete redes, acciones DeFi y privacidad/independencia de la visión.
4. Comprobar el teléfono al final según la decisión del usuario. El APK
   actualizado ya está compilado. Cloud permanece preparado sólo localmente;
   la réplica API/SQL conserva readiness 503 hasta unir cada job con su cuenta
   y consentimiento económicos originales.

[STATUS](STATUS.md#evidencia-funcional-y-límites-del-corte) conserva evidencia,
medidas y rechazos originales. Las 45 dependencias de compilación siguen iguales;
la publicación `a62ec91` conserva 819 módulos y doce roles con build cerrado.
El recorrido ERC20 `da603751`, LIVE_ARMED corto y F reorg `b4329b70` están
aceptados en sus ámbitos originales. Meta y Aave aceptaron su
ámbito original de quince pruebas, dos READ y backend retenido en otro PID por protocolo;
no aceptan recuperación del backend retenido ante pérdida abrupta, salida del
padre ni teléfono.
MetaMorpho F1 acepta su perfil local original de diez pruebas y tres W39;
no acepta recuperación autónoma con reloj real ni pérdida neta del solver.
SPL29 conserva rechazo tras trece pruebas por preparación caducada antes del
envío, sin observación ni finalidad. Tron13 rechazó la auditoría completa bajo
su plazo original. No hay crédito privado SPL destino ni
wallet/GRAPH Tron aceptados. Los rechazos previos se conservan.
<!-- META_AAVE_ACCEPTED_SCOPE_ONLY: GRAPH/abrupt/parent/phone siguen pendientes. -->
<!-- PENDING_SPL20: actualizar sólo con cierre original. -->
<!-- PENDING_TRON13: actualizar sólo con cierre original. -->
<!-- CONTROLLED_CUTOFF: causal HOST accepted; unchanged28800s; no real8h required. -->
<!-- HISTORICAL_APK_6ADC_LIMITED: compiled76/34; newAPKrequiredByFunctionalVaultFix. -->

Corte del 9 de octubre: SOURCE y GRAPH están conectados y sus correcciones
quedaron en commits separados. El APK85/36 ya está compilado; faltan las
aceptaciones reales SOURCE de dos caídas y GRAPH14 antes de cerrar 4 y 6.

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
El payout SOL nativo ya está cerrado en Claims9: ambos activos fueron redimidos,
con un envío por transacción, nonces originales avanzados y pasivos finales cero.
El crédito privado SPL USDC sigue pendiente y pertenece a un recorrido distinto.
Ampliar los recorridos a los fallos de procesos aún no cubiertos. Conservar el primer envío y su identidad; un resultado
incierto no autoriza otra firma o pago. Una entrega nativa finalizada se respeta
durante la recuperación del estado privado.

## 5. Composición DeFi privada real

Integrar acciones y posiciones de protocolos reales mediante el mismo PAEG,
con respaldo, conservación, autorización y recuperación. Completar entrada
privada, posición, acción, salida y redención en los protocolos originales
mediante las interfaces generales; ampliar las acciones de Aave/MetaMorpho y
cerrar Morpho y Jupiter conservando esos mismos criterios.

Uniswap ya tiene un recorrido aceptado desde reserva privada, con autorización,
estado común, respaldo, quorum, liquidación T y EXIT de ambas notas. Aave tiene
aceptación original de quince pruebas con rendimiento y redención reales,
compilación genuina y fuentes/pins íntegros. Su valoración generacional usa
previewRedeem/maxRedeem de la bóveda Static original en el mismo bloque, sin
inferir liquidez disponible. MetaMorpho conserva su aceptación ordinaria de
quince pruebas con keeper superviviente. Meta19 acepta además cierre de cinco
secciones originales y reapertura del backend retenido en otro PID tras EXIT y
redención, con dos READ móviles y sin nuevo envío. Conserva la misma referencia,
receipt e identidad de EXIT, y el catálogo reabre sin nuevas admisiones. GRAPH
recovery, caída abrupta, salida del padre y teléfono siguen pendientes. Aave
retenido aceptó por separado el mismo ámbito: quince pruebas, dos READ, cinco
secciones originales reabiertas y envíos 93→93. Las lecturas mantienen
custodia del backend y no crean crédito por valoración. Los rechazos anteriores
se conservan en STATUS; ampliar F y posiciones DeFi.
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
módulos del backend. El siguiente corte es deviceFlat: notas ERC20 y shares
propias del dispositivo, preparadas antes de TOP_UP. La consulta de posiciones
Linux conserva su custodia y no adopta esas cuentas. Este corte necesita seis
enlaces conectados, antes de exponer acciones financieras:

1. Vault móvil multinota, con fuente ERC20 y share separadas por activo, dominio
   y pool; ambas aperturas nacen antes de financiar.
2. Solicitud D27 acotada desde la intención original móvil, con consentimiento,
   nonce y CAS propios; raíz y claves permanecen en el dispositivo.
3. Autoridad y actor deviceFlat originales del mismo realm, con preparación
   TOP_UP/U y destino D27; ningún ID o shape adopta el owner Linux.
4. Admisión de la share contra entrega y recibo originales, cabeza fresca,
   inclusión PC23, nullifier no gastado y respaldo del mismo activo.
5. W39 de fuente/share desde su apertura móvil y registro original, sin
   reutilizar los roles de la reserva nativa.
6. Wallet, TLS y SDK conectados al productor privado antes de efectos,
   conservando consentimiento explícito, UNKNOWN y cierre de recursos.

Las preparaciones y los consumidores originales deben unirse en cada corte;
no se habilitan endpoints sin autoridad económica. Los registros SQL de permisos
no sustituyen el ledger. Completar recuperación y coherencia durante las
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
