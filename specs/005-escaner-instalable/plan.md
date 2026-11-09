# Implementación

- Reutilizar React/Vite, ZXing, Supabase Auth, transacciones y cola offline. Añadir módulos de escáner, protocolo compartido y base IndexedDB separada `nexo-scanner-v1` sin migrar datos centrales.
- SDK .NET 10: ejecutable autónomo Windows x64 con ventana de estado y botón para abrir Nexo; puerto HTTP 47831. CORS exacto para los dos orígenes de Nexo, direcciones privadas, creación/control de anfitrión solo por loopback, capacidades aleatorias, colas acotadas y caducidad. `--dev` añade únicamente los dos orígenes locales QA.
- Transporte por polling HTTP y permisos de red local del navegador. No cambiar flags ni desactivar controles de Chrome. Usar un botón explícito tras leer QR. Probar también los permisos desde el origen HTTPS publicado: localhost no demuestra LNA.
- AES-256-GCM extremo a extremo, nonce aleatorio por paquete y sesión como datos autenticados. Secreto compartido solo en QR, nunca enviado al conector. El conector no almacena credenciales ni estado en disco.
- Claves de dispositivo P-256 no exportables en IndexedDB; permiso firmado P-256 desde Worker, con rol consultado en membresías del servidor. Confianza pública obtenida por HTTPS y conservada en cada equipo. Prueba de posesión ligada a sesión/nonce/borrador.
- Ejecutable comprimido de unos 61 MiB, distribuido en partes de 8 MiB para cumplir el límite de archivo de Cloudflare. El navegador verifica SHA-256 por parte y global y descarga un único `.exe`. No precachear estas partes en el service worker. Binarios generados excluidos de Git; script reproducible.
- Preparación offline exige shell, catálogo y permiso firmado. Validación definitiva de permisos/existencias al sincronizar. No compra de dominio, certificado de firma comercial ni otros servicios.

## Despliegue

Compilar conector y web, probar API/protocolo/borradores, ejecutar Windows real con clientes Chromium aislados y publicar solo en Nexo Validación. Instalar y comprobar Android/Windows físicos; después configurar una clave de firma distinta para producción y publicar. Conservar la versión anterior de producción hasta ese punto. No reutilizar credenciales de validación en producción.


Actualización de entrega: el propietario pidió publicar en el sitio final para probar allí. Esa instrucción reemplaza la espera de publicación descrita arriba. Se configuró una clave independiente, se compiló el conector `--production` y se publicó, conservando las pruebas físicas como pendientes explícitos.
