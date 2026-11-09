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
