# Contratos v1

## Servidor central

`POST /api/scanner/grant?company=<uuid>` con sesión Supabase y `{device,publicKey}` pública P-256. Valida usuario verificado y membresía real, registra dispositivo y devuelve `{grant:{payload,signature},verifyKey}`. Payload: versión, issuer/origen, usuario, empresa, dispositivo, rol, clave pública del dispositivo, emisión y caducidad máxima 24 h. Nunca devuelve la clave privada del servidor ni confía en rol/usuario del cuerpo.

## Conector local

- `GET /v1/health`: estado y direcciones LAN; solo loopback y origen autorizado.
- `POST /v1/sessions`: crea sesión; solo loopback. Capacidades anfitrión y QR separadas; QR válido 3 minutos.
- `POST /v1/sessions/:id/claim`: consume capacidad QR una sola vez y emite capacidad de teléfono.
- `GET /v1/sessions/:id/:side?after=<cursor>`: paquetes con secuencia; cursor libera entregados. Capacidades separadas; lado anfitrión solo loopback.
- `POST /v1/sessions/:id/:side`: paquete `{v,iv,data}` cifrado. Cuerpo máximo 32 KiB, ciphertext máximo 24.000 caracteres, 256 paquetes por dirección, 40 envíos/s por sesión, cuatro sesiones. Origen ligado a sesión.
- `DELETE /v1/sessions/:id/host`: termina sesión. Inactividad 5 min, duración máxima 8 h. El cierre del programa pierde solo mensajes del puente; los borradores/pendientes continúan en los navegadores.

## Mensajes cifrados

`hello`: permiso firmado del celular, nonce y prueba de posesión. `accepted`: permiso/proof del PC, nonce, borrador, tipo y nombre de empresa. `scan`: UUID estable, borrador y código textual máximo 128 caracteres. `ack`: mismo UUID, resultado, mensaje y cantidad. `closed`: finalización. `heartbeat`: presencia cifrada cada 2 segundos; tras 6,5 segundos sin respuesta del otro navegador se muestra enlace interrumpido, aunque el conector siga abierto.

El ACK de éxito se emite tras guardar líneas y recibo en una sola transacción IndexedDB. Los reintentos conservan UUID y contenido; no hay escritura directa al inventario. Una lectura pendiente de otro borrador se bloquea hasta volver al original o descartarla explícitamente con aviso de posible aplicación previa.

La lectura en tránsito del celular se guarda en IndexedDB (`nexo-scanner-phone-v1`) antes del envío y solo se elimina tras un ACK verificado del mismo UUID. No depende de sessionStorage para sobrevivir al cierre de la aplicación.


## Enlace persistente al cerrar formularios

El enlace pertenece a la sesión de empresa, no al modal. `paused` indica ausencia de una operación abierta y `target` identifica el borrador activo, tipo y empresa. Ambos llevan una revisión creciente para descartar notificaciones atrasadas. El celular permanece emparejado y con latidos; cámara y alta manual se pausan sin una operación activa. Abrir otra compra/venta actualiza el destino sin QR nuevo y verifica los permisos del tipo de operación. Una lectura atrasada nunca se aplica a otro documento: solo se devuelve un recibo ya persistido del borrador original o se pide revisar la operación anterior. Confirmar, cerrar y navegar conservan la conexión; desconectar explícitamente, cambiar de cuenta/empresa, cerrar Nexo o caducar la autorización la terminan.
