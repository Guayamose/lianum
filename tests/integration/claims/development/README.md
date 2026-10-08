# Laboratorio privado de claims BTC/SOL

`./dev lab claims` crea un laboratorio nuevo con fondos sintéticos. Primero valida o reutiliza la compilación pública revisada de los circuitos CI51 y CO42 originales; después ejecuta el perfil fijo de ingreso y redención. Los runners históricos siguen cerrados y no se recupera una aceptación privada perdida.

El recorrido de cada activo es D27 → ingreso nativo original → CI51 → nota privada → EXIT por HTTP original (W39) → redención por HTTP original → payout original → CO42. Se esperan ocho pruebas reales para BTC y SOL. El sistema conserva los contratos, keys/VK, cuatro operadores registrados, el quorum V4 y las autoridades WeakMap originales. Los peers de graph participan en su cobertura original de fuentes, pero no envían transferencias de graph.

Se comprueban el reinicio limpio del keeper y controller originales; el reinicio del owner y coordinador de cuenta; una respuesta HTTP de admisión descartada; confirmación/resume original y duplicados sin segundo envío. Los procesos nativos y las credenciales originales permanecen vivos durante estos reinicios.

La aceptación queda en `.internal/dev/reports/native-claims-lab.json`, con hashes del resultado, recursos y pruebas. Sólo un intento nuevo puede producir ese resumen. La existencia del comando y las pruebas host no significan que el recorrido haya pasado: se requiere un resultado nuevo aceptado y el cierre confirmado por su supervisor.

Alcance: custodia local BTC regtest y Solana personalizado, EVM local, fondos de prueba y operadores en un mismo host. Quedan fuera redes públicas, autocustodia nativa, operadores independientes, graph completo, pérdida de keeper/keys, reinicio de nodos, certificación de privacidad y wallet completa.
