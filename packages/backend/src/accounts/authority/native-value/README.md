# Operaciones de la autoridad de cuenta

La entrada sigue siendo `../native-value-account-authority-v2.mjs`. Allí se
crean y registran la cuenta original, el Vault, el bloqueo de operaciones y
los estados de captura, cierre y recuperación. Las funciones de esta carpeta
son privadas del backend; no son nuevas entradas del paquete ni servicios.

| Archivo `native-value-authority-…` | Responsabilidad |
| --- | --- |
| `deposits.mjs` | Instalar el bridge, observar, probar y registrar depósitos del dispositivo |
| `reservations.mjs` | Validar consentimiento, presupuesto y reserva de la nota original |
| `execution.mjs` | Ejecutar, observar el terminal, tratar reorganizaciones y recuperación armada |
| `withdrawals.mjs` | Calcular notas de salida, validar su titular y retirar con conciliación |
| `operations.mjs` | Autorizar operaciones del propietario, enviar, reconciliar y consultar su resultado |
| `manual.mjs` | Ciclo manual de revisión, keeper y justificantes de no envío |
| `interface.mjs` | Construir la interfaz de cuenta, cancelación y cierre |

Cada factory recibe el contexto privado del mismo propietario. Sus getters
leen las variables vivas de la autoridad: una actualización del Vault no deja
copias antiguas del registro en otros módulos. Los setters enumerados actualizan
esas mismas variables. Las escrituras siguen pasando por `write` y los accesos
por `exclusive`, `healthy` y las verificaciones originales de cada operación.
El contexto no sale de la composición ni se acepta desde HTTP.

Los `WeakMap` y `WeakSet` que acreditan cuentas, consentimientos y recuperaciones
siguen en su módulo original. Extraer una función o construir una factory con
objetos de prueba no registra una cuenta ni concede permiso de envío. La
identidad entre procesos y la custodia no se rediseñan aquí.

Para un cambio de retirada, comienza por `withdrawals.mjs`; para conocer su
estado y permisos, consulta la composición de `createAccountAuthority` en la
entrada. Los tests HOST de recuperación y custodia cubren pérdida de respuesta,
cierre durante una espera, reorganización y continuidad de estado. Las pruebas
criptográficas y económicas tienen sus laboratorios explícitos.
