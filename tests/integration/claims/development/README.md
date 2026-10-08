# Laboratorio privado de claims BTC/SOL

`./dev lab claims` crea un laboratorio nuevo con fondos sintéticos. Primero valida o reutiliza la compilación pública revisada de los circuitos CI51 y CO42 originales; después ejecuta el perfil fijo de ingreso y redención. Los runners históricos siguen cerrados y no se recupera una aceptación privada perdida.

El recorrido de cada activo es D27 → ingreso nativo original → CI51 → nota privada → EXIT por HTTP original (W39) → redención por HTTP original → payout original → CO42. Se esperan ocho pruebas reales para BTC y SOL. El sistema conserva los contratos, keys/VK, cuatro operadores registrados, el quorum V4 y las autoridades WeakMap originales. Los peers de graph participan en su cobertura original de fuentes, pero no envían transferencias de graph.

Se comprueban el reinicio limpio del keeper y controller originales; el reinicio del owner y coordinador de cuenta; una respuesta HTTP de admisión descartada; confirmación/resume original y duplicados sin segundo envío. Los procesos nativos y las credenciales originales permanecen vivos durante estos reinicios.

La aceptación queda en `.internal/dev/reports/native-claims-lab.json`, con hashes del resultado, recursos y pruebas. Sólo un intento nuevo puede producir ese resumen. La existencia del comando y las pruebas host no significan que el recorrido haya pasado: se requiere un resultado nuevo aceptado y el cierre confirmado por su supervisor.

Alcance: custodia local BTC regtest y Solana personalizado, EVM local, fondos de prueba y operadores en un mismo host. Quedan fuera redes públicas, autocustodia nativa, operadores independientes, graph completo, pérdida de keeper/keys, reinicio de nodos, certificación de privacidad y wallet completa.

## Factura privada CBTC y entrega Solana

`./dev lab btc-sol` prepara los mismos artefactos públicos CI51/CO42 y ejecuta
un perfil nuevo, fijo y separado del recorrido de ocho pruebas. Es el comando
desde la raíz; el wrapper entra al directorio original requerido y conserva
la supervisión del padre, las señales y un único intento nuevo. No recibe
endpoints, payloads ni una selección de intentos históricos.

El perfil financia una nota privada de 100.000 CBTC del laboratorio y usa el
PAEG original para pagar 20.000 CBTC a un solver que entrega 1.000.000 lamports
desde su liquidez Solana separada. Conserva el cambio de 80.000 CBTC, el mismo
journal y sus autoridades originales. Se esperan dieciséis pruebas genuinas:
D27 y CI51, diez del grafo, dos W39 y dos CO42.

Las dos salidas privadas son distintas, pero ambas redenciones nativas Bitcoin
usan el mismo destinatario fijo de custodia del fixture. No acredita dos wallets
Bitcoin independientes, un puente del mismo activo ni descubrimiento de precio.
La custodia y los nonces de Solana no se gastan en el grafo. La aceptación
requiere entrega finalizada original, ambas redenciones DISCHARGED, duplicados
sin otro envío, fuentes intactas y cierre del supervisor. La existencia del
comando o sus tests host todavía no acredita ese resultado.

El resumen privado queda en `.internal/dev/reports/btc-sol-lab.json`. Une
los bytes originales de result/resources/source-pins, identidad de nacimiento
y salida del supervisor/worker, matriz de pruebas y marcadores específicos de
cada familia. Los diagnósticos de presupuestos sólo se conservan en los archivos
privados del intento; no autorizan renovarlos ni repetir una firma incierta.

El alcance sigue siendo local con valor sintético: excluye móvil, navegador,
recuperación F, pérdida de keeper/nodo/claves, operadores independientes, red
pública y certificación de privacidad.
