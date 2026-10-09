# Usar Uniswap y MetaMorpho desde la wallet local

La aplicación está en [apps/wallet](../README.md). Abre la dirección local que
imprima el servidor original. `npm run dev`, desde la raíz del proyecto, abre la
interfaz desconectada: no crea fondos ni selecciona un protocolo. Para operar,
el host local debe haber conectado la cuenta y las autorizaciones originales.
Si aparece `DISCONNECTED`, las acciones económicas permanecen deshabilitadas.

En cada paso pulsa **Revisar operación**, comprueba los términos, recibe el
permiso exacto del host, marca el consentimiento y confirma una vez. La pantalla
no crea preparaciones del titular ni elige otra ruta. Usa **Actualizar estado**
para consultar el resultado; no hay ejecución ni reintento automático.

| Paso | Acción en la wallet | Qué observar después |
| --- | --- | --- |
| Entrada privada | En **Cuenta privada**, **Vincular preparación** (`accountPrepare`) para el TOP_UP ya preparado; después **Ejecutar original** (`accountExecute`). | El mismo ID en `CONFIRMED` y el activo original con saldo privado `LIVE`. El HTTP 200 sólo acusa la cola local; no confirma fondos. |
| Acción DeFi | Revisa el GRAPH original registrado y sus importes, destinos, generación y plazos. Vincula su preparación y ejecuta cuando el diario diga `PREPARED`. | El diario original y la lectura de los activos de salida. El mismo núcleo conserva autorización, respaldo y liquidación; la página no verifica la cadena por sí misma. |
| Posición | Consulta **Cartera** y las posiciones. | Uniswap muestra su token de salida ERC20; ese swap no crea una posición LP. MetaMorpho muestra shares por activo/generación y una estimación conservadora del subyacente. El subyacente estimado no es otro saldo privado gastable. |
| Salida privada | Vincula el EXIT autorizado y usa **Ejecutar original**, conservando su ID y referencia. | EXIT `CONFIRMED` en el diario original y el estado actualizado de la nota. No confundas esa salida con una redención del vault. |
| Redención MetaMorpho | En **Redención pública de shares**, usa **Preparar redención** (`defiPrepare`) con el ID del EXIT, mínimo y deadline; después **Ejecutar original** (`defiExecute`). | `READY_TO_REDEEM` antes del envío; `REDEEMED` y el importe retenido después. El subyacente llega a la dirección externa original del titular, sin nuevo crédito privado. |
| Resultado perdido o recuperación | Usa **Conciliar cuenta**, **Conciliar redención** o **Recuperar GRAPH original**, según la operación. **Reabrir servicio** conserva el servicio de redención original. | El mismo ID y recibo. `UNKNOWN`, `STALE`, `UNAVAILABLE` o `REDEMPTION_UNRESOLVED` conservan incertidumbre: no cambies el ID ni repitas el envío. La recuperación GRAPH mantiene su corte y permiso originales. |

**Revisar cotización** sólo cambia mínimo/deadline de una redención original
nunca enviada. Las cantidades usan las unidades atómicas del activo mostrado;
los buckets disponibles, reservados y de recuperación no se suman entre sí ni
entre generaciones. Si una valoración falla, el importe permanece desconocido.

Los recorridos locales originales aceptados de Uniswap y MetaMorpho acreditan
su economía bajo sus fuentes y recursos originales. La nueva captura y
reapertura MetaMorpho/Aave en otro proceso sigue pendiente de aceptación; **Reabrir
servicio** no demuestra recuperación tras perder todo el backend. La aceptación
económica tampoco acredita interacción visual del navegador ni despliegue público.

Contrato detallado: [UI](UI.md), [consentimiento del host](MANUAL-HANDOFF.md) y
[alcance de las aceptaciones](../../../packages/backend/docs/LOCAL-ACCEPTANCE.md).
