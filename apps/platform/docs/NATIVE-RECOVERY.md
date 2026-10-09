# Recuperar la cuenta nativa local

El servicio `run-original-native-source-v1.mjs` conserva las fuentes de la
cuenta antes de financiarla. Guarda la cuenta, el estado de los nodos locales,
el proveedor, el ejecutor, el keeper y la vinculación del dispositivo en un
realm privado. Las claves raíz y de las notas siguen en el cliente.

Este servicio utiliza EVM local y fondos de prueba. La aceptación integrada
de caída abrupta y la espera autónoma de ocho horas siguen pendientes.

## Arranque y reapertura

Desde la raíz del repositorio, la configuración se guarda en
`.local/original-native-source-durable-operator-v1/operator.json`. El directorio
debe tener permisos `0700` y el archivo `0600`, pertenecer al usuario actual
y ser archivos físicos. Su estructura es:

```json
{
  "origin": "https://127.0.0.1:PUERTO",
  "devicePublicKey": "CLAVE_PUBLICA_SECP256K1_DEL_DISPOSITIVO",
  "tls": {
    "certificate": "CERTIFICADO_PEM",
    "privateKey": "CLAVE_TLS_PEM"
  }
}
```

La clave pública corresponde a la custodia del cliente. El descriptor de
vinculación se publica en `paired-descriptor.json`, dentro del mismo directorio.
El cliente usa ese descriptor y su consentimiento firmado para cada operación.
Arrancar el servicio prepara los recursos y abre TLS; financiar, reservar y
ejecutar requieren sus autorizaciones propias.

```sh
./dev node --max-old-space-size=384 apps/platform/src/run-original-native-source-v1.mjs
```

Después de que termine el proceso original y sus procesos dependientes, se
reabre conservando la configuración, el descriptor y todos los journals:

```sh
./dev node --max-old-space-size=384 apps/platform/src/run-original-native-source-v1.mjs --open-source
```

La reapertura comprueba la identidad de los archivos, las fuentes del código,
los checkpoints y la ausencia de los procesos originales. Usa una generación
nueva del mismo realm. Una copia de un descriptor o un ID de cuenta no permite
adoptar la cuenta ni concede permisos económicos.

## Qué ocurre después de una caída

| Estado guardado | Comportamiento |
| --- | --- |
| Operación confirmada y checkpoint completo | Reabre las fuentes originales. Las lecturas necesitan una observación nueva. |
| Paso aún no iniciado | Puede iniciarse con consentimiento nuevo sobre la misma cuenta y términos originales. |
| Envío iniciado cuyo resultado sigue incierto | Conserva `UNKNOWN` y bloquea el gasto; una consulta no permite repetir el envío. |
| Mutación de una fuente sin checkpoint confirmado | La entrada devuelve `ORIGINAL_SOURCE_PENDING_UNKNOWN`, con saldo disponible desconocido y sin capacidades económicas. |
| Proceso original aún vivo o fuente alterada | Rechaza la reapertura. |

La autorización de recuperación mantiene la misma reserva y cutoff. El keeper
solo inicia F cuando vence ese cutoff y existe una autorización ARM original.
Una respuesta perdida se concilia contra el envío conservado. No se renuevan
las condiciones de la operación al reiniciar.

El realm local tiene un plazo propio de nueve horas desde su creación. Ese
plazo, el soporte de EVM local y la imposibilidad de restaurar una fuente a
mitad de mutación son límites actuales de esta entrada. Conservar los
archivos permite investigar un resultado incierto; borrarlos elimina esa
posibilidad. El estado conjunto separa activos y dominios, mantiene posiciones
y valoración diferenciadas y presenta `STALE` o `UNKNOWN` hasta observar de
nuevo sus fuentes. Su journal de observaciones no crea crédito ni autorización.
