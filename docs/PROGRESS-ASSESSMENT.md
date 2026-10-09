# Evaluación de los objetivos originales

Recalculada el 9 de octubre de 2026 sobre el código de `22a0069` y los resultados
conservados. La referencia es [PROJECT-VISION](../PROJECT-VISION.md); no se
modifican sus objetivos, arquitectura ni exclusiones.

Esta es una **estimación de cobertura funcional**, con un cálculo reproducible.
Las notas de cobertura siguen siendo juicios técnicos; no son medidas de tiempo,
esfuerzo restante, probabilidad de éxito ni preparación para producción. Se
revisaron los flujos y módulos citados, no cada archivo del repositorio. Se
leyeron las evidencias existentes; no se ejecutó otra campaña financiera.

## Criterio de cálculo

Cada objetivo se descompone en cinco requisitos que cubren sus cláusulas
originales. Cada requisito pesa el 20%. La nota del objetivo es la media:

`porcentaje = (nota1 + nota2 + nota3 + nota4 + nota5) / 5`

| Nota | Significado |
| --- | --- |
| 0 | No se ha encontrado implementación del requisito. |
| 25 | Implementación parcial; falta una parte sustancial o su conexión. |
| 50 | Implementado y conectado, sin acreditar el recorrido completo del requisito. |
| 75 | Funcionamiento completo acreditado en un ámbito limitado; falta cubrir el alcance restante. |
| 100 | Requisito cubierto en su alcance original. |

El alcance de cada nota se declara en su fila. Una prueba focal completa puede
acreditar almacenamiento o custodia, pero no una liquidación económica. Una
compilación acredita que se construye la app, pero no acredita siete redes.
El código conectado pendiente de integración cuenta como implementación;
un intento rechazado no se convierte en un recorrido aprobado.

Estos pesos son una convención explícita de seguimiento. Se mantienen para
las siguientes revisiones. Las cifras anteriores eran rangos sin este desglose:
no se puede interpretar su diferencia como un incremento medido durante una
sesión. Los commits y la cantidad de pruebas no añaden puntos por sí mismos.

## Resultado

| Punto original | Notas de los cinco requisitos | Estimación actual |
| --- | --- | ---: |
| 1. Wallet unificada para siete redes | 75 / 25 / 75 / 75 / 75 | 65% |
| 2. Privacidad por defecto | 75 / 75 / 25 / 0 / 25 | 40% |
| 3. PAEG genérico | 75 / 75 / 75 / 50 / 75 | 70% |
| 4. Liquidación y recuperación económica | 75 / 75 / 75 / 75 / 50 | 70% |
| 5. Composición DeFi privada real | 75 / 50 / 75 / 75 / 75 | 70% |
| 6. Estado privado global coherente | 75 / 75 / 75 / 75 / 100 | 80% |
| 7. Modelos de redes heterogéneos | 50 / 75 / 75 / 75 / 50 | 65% |
| 8. Agente | Fuera del alcance autorizado | No se puntúa |

No se calcula un porcentaje único del producto: los siete objetivos tienen
alcances y costes diferentes y los requisitos transversales también deben
cumplirse. Ninguno de los siete está completo.

## 1. Wallet unificada para siete redes — 65%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Experiencia y cuenta coherentes | 75 | [App móvil](../apps/mobile/App.tsx), [estado común](../apps/mobile/src/state/private-wallet-state-v1.mjs) y [wallet web](../apps/wallet/README.md): conexiones propias, identidad protegida y estado por origen/activo. EVM y SDK tienen recorridos locales aceptados. | Completar esa experiencia para las siete redes y las autoridades de cada operación; una vista común no concede gasto. |
| Operación real de las siete redes | 25 | EVM, BTC/SOL y partes de Tron tienen productores y recorridos originales. [Registro de redes](../packages/backend/src/chains/shared/portfolio/portfolio-registry.mjs). | Base, Arbitrum y BNB propios; wallet/GRAPH Tron y el crédito privado SPL. Heredar formato EVM o mostrar un RPC no completa una red. |
| Financiar, autorizar, reservar, probar, ejecutar y salir desde la wallet | 75 | Web EVM, EVM9 `f36e603b` y nota ERC20 propia `da603751` aceptados en sus ámbitos. [Pantalla ERC20](../apps/mobile/src/screens/ExternalTokenNoteScreen.tsx) conecta las acciones originales. | Aceptar el GRAPH completo con participaciones del dispositivo y extender el recorrido a las demás redes. |
| Custodia local, consentimiento y copia recuperable | 75 | [Identidad y firmas](../apps/mobile/src/custody/key-store.ts), [copia cifrada](../apps/mobile/src/custody/sealed-custody-backup-v1.mjs) y [Vault de notas](../apps/mobile/src/custody/device-external-flat-note-vault-v1.ts). Pruebas focales acreditan la misma identidad restaurada y las restricciones de gasto. APK actualizado, sin Metro. | Uso nativo físico al final, según la decisión de Rafa, y recuperación integrada de todos los tipos de custodia. Los puertos nativos de HOST no son hardware real. |
| Saldo, conciliación y continuidad de la misma cuenta/operación | 75 | EVM9 y ERC20 aceptan reapertura ordenada en otro PID, mismos trabajos y ausencia de efectos nuevos. El saldo usa lecturas originales. | Recuperación abrupta SOURCE y GRAPH completo; continuidad equivalente para todas las redes. |

## 2. Privacidad por defecto — 40%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Proteger el estado de notas, saldos y posiciones | 75 | [Pool privado](../contracts/wallet/PrivateFlatAssetNotePool.sol), relaciones ZK y [lectura privada](../packages/backend/src/api/mobile/paired-original-defi-position-reader-v1.mjs). Hay notas privadas y READ propio en recorridos locales. | Protección en todo el alcance y frente a los observadores definidos; los importes públicos permiten correlación. |
| Restringir revelación, custodiar claves y cifrar almacenamiento/transporte | 75 | [Firmas locales](../apps/mobile/src/custody/key-store.ts), permisos separados, TLS y [copias AES-GCM](../apps/mobile/src/custody/sealed-custody-backup-v1.mjs). La clave raíz no se entrega a la API. | Fronteras reales entre operadores y transporte/borrado de testigos en Cloud; los workers y su host ven sus testigos consentidos. |
| Ocultar direcciones, estrategias, rutas y topología | 25 | [Framing y compromisos](../packages/crypto/src/framing.mjs) y paquetes por rol proporcionan partes de la protección. | La API ve identidad estable, importes y destinos; falta demostrar ocultación de rutas y topología bajo el modelo completo. |
| Evitar correlaciones por importe, tiempo, financiación, retirada, RPC y actividad entre redes | 0 | [Fronteras actuales](PRIVACY-AND-OPERATIONS.md) declaran estas exposiciones. No se encontró un mecanismo integrado que resuelva este requisito. | Diseñar e integrar protección efectiva de esos metadatos, con consentimiento y fallo explícitos. TLS y quitar logs no resuelven la correlación. |
| Definir observadores/colusiones y aplicar privacidad por defecto | 25 | [Modelo operativo documentado](PRIVACY-AND-OPERATIONS.md), límites por rol y permisos; [worker](../packages/proofs/src/jobs/worker.mjs) evita logs de testigos. | Completar el modelo y comprobar sus garantías entre API, worker, RPC, cadena, almacenamiento, red y dispositivo. |

## 3. PAEG genérico — 70%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Representar pasos y dependencias en un grafo válido | 75 | [Grafo](../packages/engine/src/execution/graph/graph.mjs): nodos, aristas, ciclos, orden y compromisos; usado por los recorridos DeFi aceptados. | Mayor cobertura de tamaños y topologías; el productor actual tiene de uno a cuatro slots. |
| Unir autorizaciones y condiciones con cada operación | 75 | [Grafo financiado](../packages/engine/src/execution/graph/funded-graph.mjs) y [pool](../contracts/wallet/PrivateFlatAssetNotePool.sol): conservación, política, plazo, autorización y nullifiers unidos a U/S. | Combinaciones y redes restantes; el GRAPH móvil completo aún no tiene aceptación. |
| Comprobar cumplimiento global antes de liquidar | 75 | [Relación de liquidación](../packages/proofs/circuits/settlement/src/main.nr) y pool: completions, identidad, evidencias, ventanas y consumo único. Aave, Meta y Uniswap aceptan esos pasos. | Ampliar fuera de las rutas y perfiles locales acreditados. |
| Dar información mínima a cada ejecutor y ocultar el grafo completo | 50 | [Paquetes nativos](../packages/engine/src/execution/native/dispatch/native-capsules.mjs) y grafo definen paquetes/roles cerrados. Declaran no colusión y host común. | Acreditar la ocultación entre operadores independientes y ante correlación. Privacidad sistémica no aceptada. |
| Reutilizar relaciones/verificadores/evidencia al combinar acciones y redes | 75 | [Catálogo de relaciones](../packages/proofs/src/catalog.mjs) y [ejecución común](../packages/backend/src/execution/account/execution/flat-native-execution.mjs). BTC/SOL y composiciones DeFi reutilizan el núcleo. | Generalidad fuera de las combinaciones comprobadas y del perfil de cuatro slots. No se acredita tamaño arbitrario. |

## 4. Liquidación y recuperación económica — 70%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Pagar/liberar reservas según el resultado global, sin doble cobro | 75 | [Pool](../contracts/wallet/PrivateFlatAssetNotePool.sol) y [ejecución común](../packages/backend/src/execution/account/execution/flat-native-execution.mjs): U/S/N/T/F/W39. Recorridos DeFi y F con ambas retiradas aceptados localmente. | Todas las rutas/activos y sus fallos. |
| Resolver timeout con plazo y autoridad originales | 75 | [Cuenta original](../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs) y [regresión del keeper](../packages/backend/tests/accounts/authority/device-live-recovery-arm-v1.test.mjs): reloj controlado, cutoff 28.800 s, un solo efecto, repetición y respuesta perdida sin nuevo envío. | Ampliar disponibilidad y lifetimes del producto. No se exige esperar ocho horas reales. |
| Resolver entregas parciales, respuesta perdida, indisponibilidad y eventos adversos | 75 | [Reconciliación nativa](../packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs). Uniswap F10, Meta F1, EVM9, LIVE_ARMED y F reorg aceptados en ámbitos concretos. | Pérdida abrupta de keeper/nodos/custodia, GRAPH completo, reorganizaciones más amplias y fallos combinados. |
| Separar ledger, compromiso/aborto y resultado económico | 75 | Pool, ejecución común y cuenta mantienen incertidumbre y salidas bloqueadas. Meta F1 respeta la entrega externa irreversible al recuperar las notas. | Extender la separación a los fallos y combinaciones restantes. Recuperar una nota no revierte una transferencia finalizada. |
| Asignar pérdidas, liquidez, comisiones y solvencia explícitamente | 50 | [Admisión nativa](../packages/engine/src/execution/native/dispatch/native-admission.mjs) y [proveedor EVM](../packages/backend/src/providers/evm-vault-provider.mjs): adelanto del solver, términos de pérdida y comisión. | Escenarios de insolvencia, liquidez y comisiones; pérdidas netas acreditadas. Meta F1 no demuestra por sí solo pérdida neta independiente del solver. |

El código nuevo de SOURCE y GRAPH está conectado. Su almacenamiento/captura
tiene evidencia focal, pero su recuperación económica completa sigue pendiente.
Esto no eleva los criterios económicos que ya estaban en 75 por otros
recorridos limitados. Corregir un bloqueo del recorrido pendiente es avance de
implementación, pero aún no añade un escenario económico completado.

## 5. Composición DeFi privada real — 70%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Protocolos, acciones y posiciones reales mediante PAEG | 75 | [Recorrido de bóvedas](../tests/integration/chains/evm/evm-vault-flow.mjs): Uniswap15, Aave15, Meta15/19 aceptados localmente sobre protocolos originales. | Más acciones y posiciones; crédito privado Jupiter completo. |
| Composición efectivamente privada | 50 | [GRAPH del dispositivo](../packages/backend/src/accounts/authority/device-external-flat-source-graph-v1.mjs) y [estado de posiciones](../packages/backend/src/defi/positions/private-position-state-v2.mjs) conectan notas, pruebas y lecturas propias. | Privacidad de ruta/topología/correlación y GRAPH móvil completo. El swap público Jupiter no puntúa como crédito privado. |
| Autorización y custodia originales | 75 | GRAPH y [lector DeFi](../packages/backend/src/api/mobile/paired-original-defi-position-reader-v1.mjs) unen reserva, permisos, pruebas y receipts a los originales. | Autoridad móvil completa sobre shares/GRAPH; las posiciones Meta/Aave leídas permanecen bajo custodia Linux. |
| Conservación, respaldo y disponible correcto | 75 | [Redención Morpho](../packages/backend/src/defi/vaults/morpho-vault-redemption-accounting-v1.mjs), [redención Aave](../packages/backend/src/defi/vaults/aave-static-redemption-accounting-v1.mjs) y estado de posiciones comprueban shares/deltas; valoración no crea dinero gastable. | Generalizar activos, deuda, posiciones y liquidez adversa. |
| Recuperación de las acciones y posiciones | 75 | [Wallet de bóvedas retenida](../packages/backend/src/accounts/recovery/external-defi-retained-vault-wallet-v1.mjs): Meta/Aave reabren en otro PID sin nuevos envíos; Uniswap F10 y Meta F1 aceptados. | Caída abrupta y fallos combinados; F1 no acredita pérdida neta del solver. |

## 6. Estado privado global coherente — 80%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Identificar por activo/dominio notas, posiciones, reservas y operaciones | 75 | [Modelo de backend](../packages/backend/src/accounts/state/original-wallet-economic-state-v1.mjs) y [modelo móvil](../apps/mobile/src/state/private-wallet-state-v1.mjs) incluyen fuente, generación, activo, red, génesis, pool y dominio. | Todos los productores de las siete redes y las posiciones restantes. |
| Reunir originales y conciliar su efecto en backend/wallet/app | 75 | [Proyección web](../apps/wallet/src/client/features/portfolio/original-economic-state-v1.mjs), estado móvil y backend consumen las capacidades originales; EVM9 aceptó cinco READ y Meta/Aave dos por protocolo. La fuente ERC20 comprueba nota, nullifier y respaldo. | GRAPH del dispositivo completo y extensión a todas las fuentes. La unión de lecturas no crea una autorización global. |
| Conservar estado y credenciales durables y recuperables | 75 | Backend con Vault/CAS/ancla; [SOURCE cifrado](../packages/backend/src/operations/recovery/native-original-source-capsule-v1.mjs) con dos cuerpos y confirmado/candidato; copia cifrada de identidad y notas. HOST reales de AES/CAS pasan y hay reaperturas ordenadas aceptadas. | Continuidad integrada de esas fuentes durante las caídas abruptas, almacenamiento completo de cada tipo de custodia y operación Cloud real. |
| Recuperarse de reinicios conciliando la misma operación sin duplicar créditos/envíos | 75 | EVM9, ERC20 y backends Meta/Aave aceptan reinicio ordenado en otro PID y observación del mismo efecto sin nuevo pago. SOURCE abrupt y GRAPH están conectados, pero sus recorridos actuales no están aceptados. | SOURCE con dos caídas, GRAPH con pérdida/restauración de custodia, reapertura y fallos combinados. El opener del estado necesita fuentes originales restauradas. |
| Tratar STALE/UNKNOWN/valoración correctamente, sin sumar unidades incompatibles ni inventar disponible | 100 | Validadores comunes rechazan saldos conocidos cuando falta observación; las vistas muestran No disponible, separan posición/valoración y activo/dominio. El modelo móvil fija `aggregateBalance:null` y `readOnly:true`; la proyección web impide crédito por valoración. | Conservar estas mismas reglas en cada nueva integración. Esta nota cierra las reglas del modelo compartido; no acredita los productores aún ausentes ni la restauración económica completa. |

El 100 de la última fila corresponde a esas reglas de representación, no al
objetivo completo. Los cuatro requisitos anteriores siguen limitados, de modo
que la media es 80 y el estado global no se declara terminado.
El trabajo reciente de copia/restauración, saldo original disponible/SPENT,
checkpoints completos, cuerpos cifrados grandes y reapertura de observación
forma parte de esta valoración; no se omite por faltar todavía el recorrido
financiero completo.

## 7. Modelos de redes heterogéneos — 65%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Identidad de red y runtimes propios | 50 | [Registro](../packages/backend/src/chains/shared/portfolio/portfolio-registry.mjs) y runtimes/observadores verifican identidad y génesis de EVM, Bitcoin, Solana y Tron. | Stacks y recorridos propios de Base, Arbitrum y BNB; un chainId común no acredita sus garantías. |
| Firmas, nonces y comisiones según el modelo | 75 | [Runtime Solana](../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs) y [payout](../packages/backend/src/claims/payouts/payout-final-send.mjs). Claims9 acredita redenciones BTC/SOL, nonces y envío único. | Recursos/comisiones completos de Tron y operaciones SPL privadas restantes. |
| Recepción y observación nativa original | 75 | BTC/SOL combinado y Claims9 están aceptados en laboratorio. Los observadores no convierten una entrega o un saldo RPC en crédito privado automáticamente. | Wallet/GRAPH/crédito privado Tron y SPL USDC destino. |
| Finalidad y reorganizaciones propias de cada modelo | 75 | Runtime Solana, [observador Tron](../packages/backend/src/chains/tron/observations/tron-native-transfer-observer.mjs), Bitcoin y F reorg EVM preservan diferencias de finalidad. | Cobertura adversa de BTC/SVM/Tron y redes/operadores independientes. Confirmaciones BTC, finalized SVM y solidified Tron no son intercambiables. |
| Reintentos y conciliación comunes sin rebajar garantías | 50 | [Envío Solana](../packages/backend/src/chains/solana/transfers/owned-solana-send.mjs), payout y registry preservan transacción e identidad; observar de nuevo no concede pagar de nuevo. | Recuperación abrupta y fallos combinados de los cuatro modelos, con independencia de operadores. |

Claims9 conserva su aceptación; Claims8 su rechazo. SPL29 y Tron13 siguen
rechazados en sus ámbitos originales. Jupiter acredita swap público, no crédito
privado completo. Ninguna nota reclasifica esos resultados.

## Evidencia del trabajo reciente y límites

Se contrastaron los resultados originales EVM9 `f36e603b`, LIVE_ARMED
`b923b217`, F reorg `b4329b70`, ERC20 `da603751`, Meta19 `8c4c6bad` y
Aave `4fbd29a9`: completados en sus ámbitos locales, con restricciones
explícitas. Los ámbitos y enlaces permanecen en [STATUS](../STATUS.md).

El último SOURCE `c3f5e405` está rechazado: completó el nacimiento del backend,
pero no generó pruebas financieras antes de D26. El identificador del lector
se corrigió en `22042f6`, sin un recorrido completo aprobado posterior.
GRAPH `d6cd7992` sigue rechazado antes de completar el grafo. La corrección del
retainer y la integración de reapertura no cambian ese resultado.

Los informes conservados y comprobados para los subrequisitos actuales son:

- SOURCE, AES/CAS y checkpoints: tres pruebas focales aprobadas, cero fallos.
  `.internal/dev/reports/original-source-large-aead-body-and-recovery-host-12876931-65d2-4752-8b75-433d03935822/host.log`.
- Copia móvil actual y restricciones de restauración: una prueba focal aprobada.
  `.internal/dev/reports/original-mobile-prepared-copy-final-invalidation-host-40b6f7bf-0f96-49b1-aa39-c2207bc67538/host.log`.
- Retención/reapertura GRAPH con CAS: una prueba focal aprobada.
  `.internal/dev/reports/original-graph-ordered-backend-cas-host-8e24882e-a281-4e83-8dec-406b2ac9d7f8/host.log`.
- APK actual: compilación completada, 85 fuentes iguales antes/después, 36
  uniones con el bundle y sin Metro. Instalación física pendiente.
  `.internal/dev/reports/mobile-android-standalone-local.json`.

No se ejecutaron nuevas pruebas largas ni se esperó el cutoff real para
recalcular estas notas. La prueba del teléfono se mantiene para el final según
la decisión de Rafa.

## Arquitectura y requisitos transversales

La media de un punto no elimina los requisitos de la visión:

| Requisito original | Situación que sigue abierta |
| --- | --- |
| Mantenibilidad | Estructura modular y entradas documentadas; sigue existiendo legado dependiente del runtime de compatibilidad. |
| Generalidad | Núcleo reutilizado, pero cuatro slots y cobertura limitada de combinaciones. |
| Confianza minimizada | Autoridades y claves separadas en laboratorio; faltan operadores independientes y garantías distribuidas completas. |
| Privacidad sistémica | Faltan protección y comprobación de correlaciones y colusiones; el punto 2 lo refleja. |
| Revisión criptográfica externa | Pendiente; la revisión de código y las pruebas internas no la sustituyen. |
| Rendimiento | Medidas individuales, sin acreditar el objetivo completo en caliente. No se amplía trabajo de optimización durante este recálculo. |
| Móvil y Cloud | APK Android construido; uso físico al final. Cloud preparado sólo localmente, sin proyecto ni despliegue; el puente API/SQL económico aún no está conectado y readiness permanece en 503. |

Para cambiar una cifra se revisa su requisito y se registra qué cobertura
cambió. Una corrección posterior no altera un resultado histórico rechazado y
una revisión documental no representa desarrollo funcional adicional.
