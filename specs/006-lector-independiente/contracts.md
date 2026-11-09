# Contratos

## Orígenes
Producción: `nexo-inventario.loby207.workers.dev` ↔ `nexo-escaner.loby207.workers.dev`.
Validación: `nexo-inventario-validacion.loby207.workers.dev` ↔ `nexo-escaner-validacion.loby207.workers.dev`.
Cada pareja usa un mismo emisor firmado; no se acepta el emisor de otro entorno. El QR abre `https://<lector>/#vincular=<NEXO1...>`: se consume el fragmento antes de cualquier petición y se retira de la dirección. Los secretos no viajan en query ni cabeceras al alojamiento.

## Mensajes cifrados v2
- `hello`, `accepted`: autorización firmada, nonce y prueba de posesión. `accepted.active` permite vincular sin documento.
- `open_operation`: UUID estable, revisión, `mode=sale|purchase`. No hay comando de confirmación ni de escritura de inventario.
- `command_result`: mismo UUID, revisión, `ok`, texto. Los reintentos conservan contenido y recibo; se rechazan permisos insuficientes y revisiones antiguas.
- `target`: revisión creciente, UUID de borrador, tipo y empresa. Habilita lecturas solo cuando el formulario está listo.
- `paused`: revisión creciente. El emparejamiento continúa sin aceptar nuevas lecturas.
- `scan`: UUID estable, borrador explícito, código como texto. `ack` se envía después del guardado durable; un recibo de otro borrador nunca modifica el activo.
- `heartbeat`, `closed`: salud/cierre del canal, separados de la conexión al servidor.

## API del lector
GET: `/api/config`, `/api/bootstrap`, `/api/inventory`.
POST: `/api/scanner/grant`, `/api/device`.
Cualquier mutación de existencias o confirmación es rechazada por el puente. Las peticiones autenticadas conservan bearer y empresa explícita, y el servidor principal vuelve a verificar sesión y membresía. No se reenvían cookies ni claves privadas. Cuerpos limitados a 16 KiB.

## Rutas
`/acceso`, `/crear-cuenta`, `/verificar-correo`, `/recuperar-contrasena`, `/invitaciones/:id`, `/auth/callback`.
`/app/resumen`, `/app/productos`, `/app/movimientos`, `/app/reportes`, `/app/configuracion`, `/app/empresas`, `/app/ventas/nueva`, `/app/compras/recibir`.
Las antiguas raíz/acceso/invitations se normalizan a las nuevas rutas. Un ID de empresa en la URL nunca reemplaza la comprobación de membresía.
