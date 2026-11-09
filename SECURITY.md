# Seguridad

La versión actual utiliza Supabase Auth y una API de Cloudflare Workers. El servidor verifica usuario, correo y membresía antes de llamar a la RPC privada `nexo_v2_gateway`. Las tablas de `nexo` están fuera del acceso directo de los roles del navegador; no se debe ampliar ese acceso para resolver errores de configuración.

- Nunca publiques `SUPABASE_SECRET_KEY`, claves `service_role`, SMTP, API de correo, tokens de Cloudflare o `SCANNER_SIGNING_KEY`.
- Las claves publicables de Supabase y Turnstile son públicas por diseño; no conceden acceso administrativo.
- Guarda secretos solo en archivos locales ignorados y en los secretos del servicio correspondiente. Si se filtran, revócalos y rótalos; borrar un archivo del último commit no elimina el historial.
- El conector valida los orígenes permitidos, usa capacidades temporales y transporta mensajes cifrados; no almacena inventario ni credenciales de Supabase.
- El modo offline está separado por usuario/empresa, pero el perfil local del navegador no es una caja fuerte. Bloquea el equipo y no habilites offline en dispositivos compartidos que no controles.
- Las autorizaciones definitivas, permisos y existencias se comprueban al sincronizar. No se confirma una venta sin stock ni se aplica parcialmente un documento conflictivo.
- Conserva copias recuperables antes de migraciones. Las migraciones ya aplicadas no se deben editar ni repetir.

Las pruebas del repositorio no constituyen una auditoría independiente. Si encuentras una vulnerabilidad, evita publicar claves o datos en un issue: utiliza el canal privado de seguridad de GitHub cuando esté disponible.
