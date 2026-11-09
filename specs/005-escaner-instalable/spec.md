# Nexo como escáner instalable

## Resultado

Android: instalar Nexo desde Chrome y trabajar en el celular o enviar lecturas al borrador de una compra/venta en Windows. Ambas sesiones usan la misma cuenta, empresa y autorización vigente. No se modifica inventario hasta confirmar el documento.

Windows: ejecutar Conector Nexo y conservarlo abierto. Compartir Wi-Fi/hotspot; no se requiere internet para una vinculación nueva si ambos equipos se prepararon previamente. No incluye conexión entre redes diferentes, APK, tienda de aplicaciones ni servicios de pago.

## Aceptación

- Dos opciones de escáner, instalación PWA, lector manual y cámara local, sin enviar imágenes.
- Lectura continua: una unidad por lectura, confirmación durable y retirada del código durante al menos 800 ms antes de otra lectura. Pausar al ocultar la cámara.
- QR temporal de un solo uso y aprobación en el PC; denegar otra cuenta, empresa, entorno, autorización caducada o compras de empleados.
- Mensajes cifrados, identificadores estables, reintentos y recibos persistentes; ningún «Añadido» antes de terminar IndexedDB.
- Borradores recuperables por usuario/empresa/tipo. Al confirmar se congela el documento y se reutiliza su identificador estable.
- Vincular de cero sin internet dentro de las 24 h; conservar pendientes si se pierde el enlace o caduca el acceso.
- Validación física Android/Windows por Wi-Fi y hotspot antes de publicar en producción. Una prueba de Chromium con dimensiones móviles no sustituye esta evidencia.
