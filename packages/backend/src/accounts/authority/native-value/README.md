# Operaciones de la autoridad de cuenta

La entrada es `../native-value-account-authority-v2.mjs`. Allí se crean y registran la cuenta original, el Vault, el bloqueo de operaciones y el estado de captura, cierre y recuperación. Los módulos de esta carpeta son privados del backend: construir una factory no registra una cuenta ni otorga autorización económica.

| Archivo `native-value-authority-…` | Responsabilidad | Estado propio |
| --- | --- | --- |
| `journals.mjs` | Vistas y mutaciones acotadas a depósitos, reservas, cotizaciones, salidas y operaciones | Ninguna copia persistente del registro |
| `deposits.mjs` | Instalar, observar, probar y registrar depósitos del dispositivo | Bridge de depósito de esa instancia |
| `reservations.mjs` | Validar consentimiento, presupuesto y reserva de la nota original | Bridge de reserva de esa instancia |
| `execution.mjs` | Ejecutar, observar el terminal, tratar reorganizaciones y recuperación armada | Admisión temporal de conciliación de reorganización |
| `withdrawals.mjs` | Calcular notas de salida, validar su titular y retirar con conciliación | Bridge de salida de esa instancia |
| `operations.mjs` | Autorizar operaciones del propietario, enviar, conciliar y consultar resultados | Observador terminal retenido |
| `manual.mjs` | Ciclo manual de revisión, keeper y justificantes de no envío | Keeper, portafolio y marcas privadas de parada/justificantes |
| `interface.mjs` | Construir la interfaz pública de cuenta | Delega cancelación y cierre al propietario de la cuenta |

Cada factory recibe puertos nombrados con los miembros concretos que utiliza. La composición de `createAccountAuthority` los construye y congela. No hay un objeto general que permita leer o escribir cualquier variable del propietario.

| Puerto | Qué permite | Qué conserva el propietario |
| --- | --- | --- |
| `journal` | Leer filas de su dominio y efectuar sus mutaciones explícitas | Vault, contraseña, registro completo, revisión, autenticación y CAS |
| `lifecycle` | Entrar en exclusión, comprobar salud, consultar estado o registrar una prueba activa según el módulo | Bloqueo, cancelación, cierre y referencias a los procesos activos |
| `account` | Obtener la capacidad original mediante `capability()` cuando ya está construida | Registro de identidad y autoridad de esa capacidad |
| `profile` | Leer configuración e identidades necesarias para ese dominio | Creación y validación original de la cuenta |
| `chain` | Consultar o ejecutar mediante los componentes originales suministrados | Vinculación al runtime, pool y titular originales |
| `deposits`, `reservations`, `exits`, `execution`, `operations`, `manual` | Invocar operaciones concretas del dominio correspondiente | El estado interno y las comprobaciones del módulo que las implementa |
| `proofs` | Usar el runner y callbacks declarados | Seguimiento de procesos y cancelación conjunta |
| `continuity`, `approvals` | Acceder solo a las referencias de continuidad o registros requeridos | Propiedad y validación original de esas referencias |
| `format`, `selection` | Usar transformaciones o selección explícitas | No añaden autoridad |

Los puertos describen colaboración interna; no se aceptan desde HTTP. Algunas referencias originales son capacidades con estado: congelar el contenedor de un puerto no las convierte en datos ni sustituye sus verificaciones.

## Diario y escritura

`createNativeValueAccountJournals` recibe solo `readRecord` y `write` del propietario. Cada lectura consulta el registro actual; una sustitución tras escritura o recuperación se ve en la siguiente lectura. Las filas devueltas son copias congeladas en profundidad. Conservar una vista anterior conserva una instantánea, no una referencia mutable al Vault.

`append`, `appendQuote` y `patch` copian los datos del llamador antes de esperar a la escritura. El cambio se aplica al registro vigente cuando el propietario ejecuta su callback. Cada tabla selecciona su propio campo e identidad; compartir un ID entre depósito y reserva no comparte sus filas. Los perfiles son identificadores escalares del protocolo.

La autorización y durabilidad siguen en `write`: verifica salud, clona el estado, aplica CAS y comprueba la lectura posterior antes de sustituir el registro vivo. Los puertos de diario no implementan otra persistencia, reintentos ni conciliación. Propagan el error original de escritura; el propietario decide cómo bloquear la cuenta ante incertidumbre.

## Cambiar y comprobar

Para una retirada, comienza por `withdrawals.mjs`; para cambiar sus permisos o colaboradores, revisa la composición en la entrada. Para modificar un dato persistente, identifica primero el dominio de diario y conserva las comprobaciones del propietario. Una dependencia nueva debe añadirse de forma explícita al puerto mínimo que la necesita.

Los tests HOST `native-value-authority-journals.test.mjs` comprueban copias inmutables, sustitución viva del registro, separación de dominios, mutación del llamador durante una espera y propagación de errores sin reintentos. `native-value-withdrawal-context.test.mjs` comprueba la capacidad utilizada y el aislamiento del bridge entre instancias con un guard HOST simulado y caminos Merkle reales. Estas pruebas no acreditan custodia, CAS autenticado ni ejecución económica; los laboratorios explícitos cubren esos recorridos.
