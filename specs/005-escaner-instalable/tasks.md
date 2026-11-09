# Tareas y evidencia

- [x] Flujo PWA, opciones de escáner, lectura continua y fallback manual.
- [x] Permisos firmados y prueba de posesión por dispositivo.
- [x] Puente local .NET autónomo con transporte cifrado, límites y QR de un solo uso.
- [x] Borradores y recibos persistentes con aislamiento y confirmación explícita.
- [x] TypeScript, compilación y 72 pruebas automáticas.
- [x] Enlace persistente al cerrar formularios, pausa sin operación activa, cambio compra/venta sin QR y aislamiento de recibos atrasados, comprobado con dos navegadores y el conector Windows real.
- [x] Ejecutable Windows real: orígenes, capacidades, consumo único, colas y cierre.
- [x] Dos clientes Chromium aislados: QR, aprobación, lectura durable, desconocidos, recuperación de borrador y confirmación de venta; viewport móvil sin desbordamiento.
- [x] Vinculación nueva con servidor indisponible, recarga y sincronización en QA (indisponibilidad de API simulada; no sustituye un corte físico).
- [x] Publicación y comprobación del entorno aislado de validación: sesión Supabase sintética real, firma y membresía, rechazo de otra empresa, CSP/PWA e integridad SHA-256 de la descarga. No usa ni modifica inventario de producción.
- [ ] Chrome Android real: permisos de cámara y red local, lectura continua, Wi-Fi sin internet y hotspot.
- [x] Publicación final autorizada expresamente por el propietario para realizar allí la prueba física. Se verificaron el servidor, la descarga y el panel con la cuenta real; la compatibilidad física Android sigue pendiente.
