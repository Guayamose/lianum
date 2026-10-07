# Programa Memo original

`spl_memo-3.0.0.so` es el artefacto público de Agave, no una compilación nueva.
Se conserva aquí para que las pruebas del host no dependan de un directorio
privado histórico del compilador.

- Fuente: https://raw.githubusercontent.com/anza-xyz/agave/5466f4592b1983adb13ba0a5d53f41ea2de69fba/program-test/src/programs/spl_memo-3.0.0.so
- Bytes: 74800.
- SHA256: `f520eaf096361abbb9639ea4dc3e5388a87b9330e121f476607b87c46ef67954`.

La prueba vuelve a cotejar el hash contra `MEMO_PROGRAM.codeSHA256` antes de
usar los bytes. Las respuestas RPC del host siguen siendo sintéticas; el
artefacto no convierte una prueba del host en aceptación nativa.
