# Validation Quickstart

1. Ejecutar `npm ci` en la raíz del repositorio.
2. Ejecutar `npm run standalone:check`, `npm run standalone:test` y `npm run standalone:build`.
3. Ejecutar `node standalone/tests/preview-server.mjs`.
4. Abrir http://127.0.0.1:5191. Es un simulador de identidad con PostgreSQL local;
   NO usa Supabase ni envía correos reales.
5. Entrar con `admin@nexo.test` / `Prueba-nexo-2026` y ejecutar los recorridos de spec.md.
6. Habilitar el equipo, registrar compra/venta y comprobar pendientes durante una caída
   simulada de API. Restaurar conexión, sincronizar y comprobar una sola operación.
7. Probar lector mediante texto + Enter, cámara con permiso y etiquetas en vista de impresión.

Para el lanzamiento real: seguir `standalone/README.md`, configurar correo/Cloudflare,
repetir las pruebas con usuarios externos y dos dispositivos, y ensayar la transferencia.
No usar credenciales QA ni el servidor de prueba como configuración de producción.

## Fallos observables en el navegador local

El servidor de `standalone/tests/preview-server.mjs` añade un panel amarillo
«Solo QA local». Este panel no se incluye en Vite ni en los Workers publicados.

1. Entrar con la cuenta sintética y habilitar el equipo con conexión.
2. Pulsar «QA: API sin conexión» y «Sincronizar» para utilizar el catálogo local.
3. Pulsar «QA: llenar almacenamiento» e intentar crear un producto válido. Debe
   mantenerse el formulario con error; no debe aparecer éxito ni un pendiente nuevo.
4. Restaurar almacenamiento y reintentar el mismo formulario: ahora debe guardarse
   un pendiente. El fallo simula `QuotaExceededError`; no llena el disco físico.
5. Con ese pendiente, restaurar API y caducar la sesión desde el panel. Sincronizar:
   la autorización rechazada no debe confirmar ni eliminar la operación local.
6. Entrar de nuevo con la cuenta sintética y habilitar el equipo si se bloqueó;
   sincronizar y comprobar una única operación confirmada.

Estas pruebas usan autenticación simulada y PostgreSQL embebido, no una sesión
real caducada de Supabase. Registrar ambos alcances por separado en la entrega.
