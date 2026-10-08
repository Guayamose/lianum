# Trabajo hasta completar el producto Lianum

La referencia de alcance es [PROJECT-VISION.md](PROJECT-VISION.md), que conserva
los objetivos, arquitectura y requisitos de la visión original. Este plan se
organiza por esos objetivos. Las seis tareas de implementación anteriores eran
un orden de trabajo, no una definición distinta del producto. El avance y los
resultados están en [STATUS.md](STATUS.md).

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
privada, posición, acción, salida y redención en Uniswap y MetaMorpho; ampliar
Aave, Morpho y Jupiter conforme a las interfaces generales.

Los recorridos aceptados de Uniswap y MetaMorpho parten de una entrada pública
y producen una nota privada con EXIT y redención. Cerrar la entrada privada y
su composición con el grafo y el estado global. Una posición observada, una
cotización o un canje público no constituye por sí mismo saldo privado gastable.

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
- Tron: resolver finalidad y cierre nativos antes de habilitar el runtime.

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
