# Próximo trabajo

Orden actualizado el 8 de octubre de 2026. La restauración y la organización
física están hechas; el siguiente avance debe cerrar comportamiento de
producto. [STATUS.md](STATUS.md) distingue lo comprobado, lo histórico y las
estimaciones por los puntos originales.

## 1. Establecer una base de desarrollo verificable

- Revisar qué fuentes y evidencias entran en Git y crear un commit inicial
  de la restauración. No incorporar claves, dependencias locales ni el estado
  privado del laboratorio. El repositorio actual todavía no tiene commits.
- Corregir el mock del servidor y la expectativa de exportaciones del
  cliente. La selección habitual debe pasar y ejecutar los casos del servidor.
- Identificar si los dos artefactos ausentes de los tests de encoding pueden
  recuperarse o requieren generación en un laboratorio nuevo. Mantener su
  estado explícito y no omitir silenciosamente esas pruebas.
- Convertir cada punto original en criterios concretos de aceptación. Los
  porcentajes orientativos no sustituyen esa lista.

Resultado esperado: base versionada, pruebas habituales correctas y fallos
adicionales inventariados con su causa y alcance.

## 2. Corregir la reconciliación y la recuperación nativas

El primer defecto funcional identificado está en
`packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs`:
la reconciliación espera al adaptador antes de observar una recuperación
terminal ya conservada.

- Completar una regresión que reproduzca el adaptador sin respuesta y la
  recuperación confirmada; el borrador histórico no llegó a ejecutar sus casos.
- Corregir el flujo conservando las comprobaciones de identidad, transacción,
  inclusión canónica, respaldo y estado. Una observación incierta no debe
  convertirse en éxito ni justificar un segundo envío.
- Verificar recuperación, liquidación, entrega parcial y reinicio sobre lo
  afectado, con resultados durables y sin doble crédito o doble pago.

Resultado esperado: reconocer una recuperación finalizada sin depender de la
disponibilidad del ejecutor anterior y conservar las garantías del protocolo.

## 3. Cerrar un recorrido de usuario en un laboratorio nuevo

Preparar un laboratorio local desechable con identidades y claves de prueba
nuevas, arranque y parada explícitos. Empezar por una ruta EVM que permita
acotar los problemas antes de ampliar redes.

El recorrido debe cubrir: abrir cuenta, financiarla, revisar y autorizar una
operación, reservar saldo, generar/verificar la prueba, ejecutar, observar la
finalidad y actualizar el estado visible en la wallet. Repetir el recorrido
pertinente con reinicio, respuesta perdida y recuperación.

Resultado esperado: un usuario completa el flujo desde la aplicación, no solo
desde un script aislado; el estado se reconstruye tras reinicio sin duplicar
efectos y la aceptación puede repetirse desde un laboratorio vacío.

## 4. Ampliar el mismo recorrido a las siete redes

- EVM: comprobar Ethereum, Base, Arbitrum y BNB con identidad, comisiones,
  finalidad y configuración propias. Compartir un adaptador no cierra las
  aceptaciones de las cuatro redes.
- Bitcoin: cerrar recepción/gasto, finalidad, reorganizaciones, reintentos y
  recuperación, indicando los supuestos de custodia y respaldo de las notas.
- Solana: validar el runtime personalizado restaurado en un laboratorio nuevo
  y cerrar los flujos nativos y sus fallos; comprobar la versión no basta.
- Tron: resolver la integración pendiente y los conflictos del registro,
  verificar la versión que corresponda y cumplir los criterios del gate
  canónico antes de habilitarlo. No sustituirlo por un bypass.
- Reutilizar el PAEG y el estado global en operaciones combinadas, conservando
  las diferencias entre redes y los riesgos de una entrega parcial.

Resultado esperado: matriz de aceptación por red y entre redes para observar,
autorizar, ejecutar, reconciliar y recuperar, con evidencia actual.

## 5. Cerrar DeFi y posiciones sobre ese recorrido

Conservar el ciclo local de bóveda existente y completar una integración de
protocolo real cada vez. Priorizar los huecos actuales de Uniswap V3 y el
ciclo completo MetaMorpho antes de afirmar soporte de otros protocolos.

Comprobar depósito/acción, posición resultante, retirada/redención, mínimo
recibido, plazo y recuperación. Ya existe código de mínimo/plazo en la
retirada genérica: hay que verificar su aplicación al recorrido externo.
Una posición observada o una cotización no se convierte automáticamente en
saldo privado gastable.

Resultado esperado: ciclo completo y repetible con conservación y respaldo,
autorización manual y estados honestos ante fallos.

## 6. Convertir la integración en la arquitectura de producto

Definir desde los primeros flujos el contrato entre custodia, backend y
workers. Las claves raíz deben permanecer con el usuario. La construcción
completa de móvil y operación se apoya en esos contratos validados.

- Crear la aplicación móvil con custodia en el dispositivo, consentimiento,
  recuperación y experiencia de usuario completa.
- Preparar el monolito modular desplegable, persistencia, jobs, colas,
  observabilidad y recuperación operativa. Preparar infraestructura GCP
  reproducible; el despliegue y gasto son acciones separadas.
- Extraer bibliotecas compartidas de `backend`, `engine` y `protocol`, reducir
  dependencias de fixtures/experimentos y consolidar variantes en los flujos
  que se estén cerrando.
- Hacer explícitas las rutas de recursos y retirar por componentes la copia
  interna de compatibilidad. Revisar los pines de fuente cuando corresponda.
- Preparar instalación desde otra máquina y CI, declarando todos los materiales
  públicos necesarios. Dividir módulos grandes según responsabilidades y
  contratos comprobados, sin nuevas reorganizaciones masivas por estética.

Resultado esperado: aplicación y servicios instalables, contratos de módulos
claros y operación reproducible sin depender del laboratorio de una persona.

## 7. Validar los requisitos transversales durante todo el cierre

El modelo de privacidad y confianza debe guiar cada implementación; no se
deja su diseño para el final. Documentar observadores, colusiones, autoridades,
custodia y filtraciones por cantidades, tiempos y RPC.

Medir en un flujo integrado, con hardware y carga declarados, el sobrecoste
en caliente: total <30 s, pruebas <20 s, coordinación/liquidación <5 s,
esperas artificiales aproximadamente cero y finalidad nativa medida aparte.
No reducir garantías para mejorar una cifra.

Preparar documentación y material de revisión criptográfica independiente,
obtener la revisión externa y resolver sus hallazgos antes de dar ese requisito
por cerrado. Su contratación no está incluida en esta evaluación.

Resultado esperado: evidencia conjunta del cumplimiento de los siete puntos
y de los requisitos transversales. El agente externo de Rafa queda excluido.

La referencia de alcance sigue siendo
[la visión original](archive/delivery/PROJECT-VISION.md).
