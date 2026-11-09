# Plan técnico

1. React Router mantiene historial y URL; la empresa viaja en `?empresa=` y se comprueba contra las membresías. ScannerSessionProvider envuelve las páginas autenticadas y se recrea solo al cambiar cuenta/empresa.
2. Escáner Nexo usa una entrada Vite, manifiesto, iconos y service worker propios en otro origen. Su Worker solo reenvía config/bootstrap/inventory/device/scanner-grant mediante Service Binding al inventario del mismo entorno, con la sesión original. No almacena claves Supabase privadas.
3. Autorización ES256 de 24 h con emisor canónico del inventario de ese entorno. IndexedDB separa identidad/empresa, preparación offline y lectura pendiente. El conector conserva únicamente mensajes cifrados en RAM.
4. Protocolo 2 separa enlace y documento, añade comandos para abrir operaciones y recibos. El sobre AES-GCM y las autorizaciones firmadas conservan su versión 1. Los formularios alternados se montan por tipo para no asociar un ID antiguo al tipo nuevo.
5. Conector 2 permite únicamente los pares de orígenes esperados por entorno; informa versión/protocolo/sitio en health y ventana. La prueba nativa usa otro puerto para no detener el conector del propietario.
6. Las etiquetas se generan bajo demanda con JsBarcode. La impresión usa milímetros y el nombre/SKU legible; ningún generador cambia el catálogo.
7. Supabase verifica Turnstile nativamente y limita reenvíos; el navegador renueva el desafío después de cada solicitud y al caducar. La interfaz añade una espera de 60 s tras un envío correcto. El registro final permanece cerrado hasta la prueba real.

## Publicación
Primero los Workers de validación y Conector Nexo de validación. Completar correo real, instalación Android, Wi-Fi/hotspot y descarga/impresión física. Después aplicar la configuración aprobada y publicar producción, manteniendo separados sus emisores y Supabase.
