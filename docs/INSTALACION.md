# Instalar Nexo: local o en la web

## 1. Elegir el modo

| Modo | Requisitos | Datos y limitaciones |
| --- | --- | --- |
| Demo local | Node.js 22.13+ y Git | PostgreSQL embebido y cuenta ficticia. La base se reinicia al parar; sin correo real. |
| Desarrollo local con acceso real | Lo anterior + proyecto propio de Supabase + secretos locales | Interfaz en localhost y API local; datos persistentes en tu Supabase. |
| Publicación web | Supabase, Cloudflare Workers, correo y Turnstile | Dos PWA HTTPS, acceso propio y escáner independiente. |

El conector requiere Windows x64. Para compilarlo necesitas SDK .NET 10; quien descarga el `.exe` no necesita SDK ni entorno de desarrollo. Cámara y PWA necesitan HTTPS o localhost. Un sitio HTTP servido en una IP de la LAN no equivale a localhost para la cámara del celular.

## 2. Descargar y ejecutar la demo local

```powershell
git clone https://github.com/loby0000/nexo-inventario.git
cd nexo-inventario
npm ci
npm run standalone:check
npm run standalone:test
npm run standalone:build
node standalone/tests/preview-server.mjs
```

Abre http://127.0.0.1:5191 e inicia sesión con `admin@nexo.test` / `Prueba-nexo-2026`. Son credenciales ficticias incluidas en el arnés, no una cuenta real. Detén con Ctrl+C. Reconstruye con `npm run standalone:build` después de editar la interfaz y vuelve a abrirla.

Esta es la forma más sencilla de revisar el portafolio sin contratar servicios. No publiques `preview-server.mjs`: simula la autenticación y crea datos desechables. No uses datos reales ni supongas que persiste entre reinicios. IndexedDB del navegador sí puede sobrevivir al reinicio, por lo que no mezcles pruebas de distintas bases en el mismo perfil con pendientes.

## 3. Crear una base propia de Supabase

Usa un proyecto nuevo para tu instalación, separado de producción y validación del autor. El repositorio no contiene una base con sus productos ni sus usuarios.

1. Crea el proyecto y conserva su URL, clave **publicable** y clave **secreta**. La secreta se usa solo en el servidor.
2. Aplica los SQL de `supabase/migrations/` por orden de nombre en una base nueva. Con el CLI de Supabase instalado y autenticado:

```powershell
supabase link --project-ref TU_REFERENCIA
supabase db push --dry-run
supabase db push
```

Revisa el destino y las migraciones antes del segundo comando. Si prefieres el editor SQL, ejecuta cada archivo una sola vez por orden y conserva el registro de los que aplicaste. No repitas migraciones en una base existente. Antes de actualizar una instalación con datos, crea una copia recuperable y ensaya en otra base.

3. La versión actual usa `public.nexo_v2_gateway`, exclusiva del servidor, y las tablas privadas `nexo`. No expongas el esquema al navegador ni concedas `service_role` al cliente.
4. En Auth habilita correo/contraseña, confirmación de correo obligatoria y contraseña mínima de 12 caracteres. Para arrancar con el registro cerrado puedes invitar tu propia cuenta desde el panel Auth y establecer su contraseña mediante el correo recibido. Tras verificar e iniciar sesión, crea la primera empresa desde la aplicación. No se crea automáticamente al aceptar una invitación.
5. Configura SMTP en Supabase para verificación y recuperación. El SMTP integrado de prueba tiene restricciones de destinatarios y frecuencia; no lo uses como correo de clientes.
6. Para invitaciones de empresa configura además Brevo API o Resend en el Worker. **Clave SMTP y clave API de Brevo son diferentes**. Comprueba ambos recorridos con correos reales antes de permitir altas públicas.

No necesitas desplegar la Edge Function antigua `nexo-api` para una instalación nueva de `standalone`. Sus archivos se conservan para la implementación histórica; tampoco ejecutes el traslado del negocio del autor.

## 4. Configurar desarrollo local con Supabase propio

Copia `standalone/wrangler.example.jsonc` a `standalone/wrangler.local.jsonc` y cambia:

- `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`: tu proyecto.
- `APP_ORIGIN`: `http://127.0.0.1:5190`.
- `SCANNER_ORIGIN`: tu origen del lector, si ya lo tienes (ver nota de orígenes abajo).
- Para probar acceso local sin CAPTCHA configurado, deja `TURNSTILE_SITE_KEY` vacío. Si tu Supabase exige CAPTCHA, configura una site key válida para localhost y su secreto en Auth.
- Conserva `REGISTRATION_ENABLED` en `false` mientras pruebas correo y CAPTCHA.

Copia `standalone/dev.vars.example` a `standalone/.dev.vars` y completa solo en tu equipo la clave secreta de Supabase, proveedor de correo y remitente. Ambos archivos locales están excluidos de Git. No uses variables `VITE_*` para credenciales privadas.

Abre dos terminales:

```powershell
# API con credenciales privadas solo en el proceso del servidor
node standalone/cloudflare.mjs dev --config standalone/wrangler.local.jsonc --port 8790
```

```powershell
# Interfaz Vite con proxy /api al puerto 8790
npm run standalone:dev
```

Abre http://127.0.0.1:5190. Añade las redirecciones exactas de este origen a Supabase Auth si pruebas acceso por enlace o recuperación. Este recorrido utiliza Supabase alojado: es desarrollo local de la aplicación, **no una instalación totalmente autónoma de Supabase**. El arnés del paso 2 sí permite explorar sin servicios externos. El modo offline de uso real requiere haber preparado el equipo con una sesión válida antes del corte.

## 5. Publicar tu copia en Cloudflare Workers

No basta GitHub Pages: la aplicación necesita una API del servidor y secretos. La distribución preparada utiliza Workers con assets estáticos y un segundo Worker para el lector. Puedes usar los subdominios `workers.dev` de tu cuenta, sin comprar dominio. Revisa los límites actuales de cada proveedor; esta guía no contrata planes ni garantiza costos futuros.

### Configuración

1. Copia `standalone/wrangler.example.jsonc` a `standalone/wrangler.personal.jsonc` y `standalone/wrangler.scanner.example.jsonc` a `standalone/wrangler.scanner.personal.jsonc`.
2. Elige nombres únicos de Worker. Sustituye `TU_SUBDOMINIO` y configura el origen HTTPS real del inventario en `APP_ORIGIN`, el del lector en `SCANNER_ORIGIN`, y tu URL/clave publicable de Supabase.
3. En el archivo del lector, `NEXO_API.service` debe ser el nombre exacto del Worker del inventario; `UPSTREAM_ORIGIN` su origen. `APP_ORIGIN` es el del lector. Este Service Binding evita duplicar claves administrativas.
4. Configura el remitente y `MAIL_PROVIDER`. La clave de API de correo es secreta; el remitente es una variable. Elige y verifica el remitente con tu proveedor; un dominio propio no se compra automáticamente.
5. En Supabase Auth configura la Site URL del inventario y **solo** estas redirecciones exactas para ambos sitios:

```text
https://TU_INVENTARIO.TU_SUBDOMINIO.workers.dev/auth/callback
https://TU_INVENTARIO.TU_SUBDOMINIO.workers.dev/auth/callback?recovery=1
https://TU_LECTOR.TU_SUBDOMINIO.workers.dev/auth/callback
https://TU_LECTOR.TU_SUBDOMINIO.workers.dev/auth/callback?recovery=1
```

### Turnstile y registro

Crea tu widget de Turnstile con los dominios del inventario y del lector. La **site key pública** va en `TURNSTILE_SITE_KEY`; la **secret key** se guarda en Supabase Auth → protección CAPTCHA → Turnstile. La comprobación de Auth la realiza Supabase, no se consume el mismo token una segunda vez en otro servidor.

Prueba creación, verificación, acceso, recuperación e invitación. Solo después cambia `REGISTRATION_ENABLED` a `true` y habilita altas en Supabase. Mantén confirmación obligatoria y límites de reenvío. La instalación publicada del autor tiene cerrado el registro libre; este repositorio no abre su configuración.

### Firma del escáner y secretos

Genera una JWK privada P-256 **propia**:

```powershell
node scripts/generate-scanner-key.mjs
```

Se guarda en `.sites-runtime/scanner-signing-key.json`, ignorado por Git. No se muestra por consola. No copies la clave a los assets, al conector ni a GitHub. La validación y producción deben usar claves diferentes.

Autentica Wrangler y configura secretos de tu Worker (los comandos solicitan el valor sin incluirlo en el historial de argumentos):

```powershell
node standalone/cloudflare.mjs login
node standalone/cloudflare.mjs secret put SUPABASE_SECRET_KEY --config standalone/wrangler.personal.jsonc
node standalone/cloudflare.mjs secret put SCANNER_SIGNING_KEY --config standalone/wrangler.personal.jsonc
node standalone/cloudflare.mjs secret put BREVO_API_KEY --config standalone/wrangler.personal.jsonc
# Si elegiste Resend, utiliza RESEND_API_KEY en lugar de BREVO_API_KEY.
```

En `SCANNER_SIGNING_KEY` pega el JSON completo generado. Estos secretos se almacenan en Cloudflare, no en Git. Si el Worker todavía no existe, Wrangler puede solicitar crearlo al guardar el primer secreto; comprueba el nombre de destino. No uses `configure-production.mjs` de la instalación del autor: sus comprobaciones están fijadas a su despliegue.

### Orígenes de tu instalación y conector

El Worker admite `SCANNER_ORIGIN` para devolver al navegador el origen del lector propio. Los valores por defecto conservan los sitios del autor por compatibilidad. Antes de compilar el conector para otra instalación actualiza `standalone/connector/Program.cs`:

- `AppOrigin`: el origen del inventario que abrirá el botón.
- `Origins`: lista cerrada de tus orígenes HTTPS, inventario y lector.
- `ReaderOrigin(...)`: relación entre el inventario y el lector de tu entorno.

No uses comodines ni aceptes cualquier origen. En `standalone/client/scanner-environment.ts` puedes cambiar también los valores de respaldo a tus orígenes; la configuración `/api/config` prevalece. Mantén el emisor de la firma en el origen del inventario de ese entorno.

### Compilar y desplegar

Para ofrecer la descarga del conector, compílalo **antes** que los assets del inventario en Windows con SDK .NET 10:

```powershell
$env:NEXO_DOTNET = (Get-Command dotnet).Source
npm run connector:build -- --production
npm run standalone:check
npm run standalone:test
npm run standalone:build
npm run scanner:build
node standalone/cloudflare.mjs deploy --config standalone/wrangler.personal.jsonc --dry-run
node standalone/cloudflare.mjs deploy --config standalone/wrangler.scanner.personal.jsonc --dry-run
node standalone/cloudflare.mjs deploy --config standalone/wrangler.personal.jsonc
node standalone/cloudflare.mjs deploy --config standalone/wrangler.scanner.personal.jsonc
```

Los ejecutables y las partes descargables se generan localmente y no entran en Git. Si despliegas desde otro sistema, prepara esos artefactos en Windows y cópialos al directorio ignorado antes de compilar los assets; sin ellos el inventario puede funcionar, pero no tendrá una descarga del conector utilizable. El lector usa Service Binding hacia el inventario, por eso se despliega después.

### Verificar

- Abre `/api/config` en ambos sitios: debe indicar **tu** Supabase, tu emisor y tu lector, sin ninguna clave secreta.
- Entra, crea una empresa de prueba y comprueba recarga, rutas y cierre de sesión.
- Prueba dos empresas y cuentas con roles diferentes; no debe permitirse acceso cruzado ni compras a empleados.
- Comprueba correos reales y aceptación de invitación en la empresa correcta.
- Instala ambas PWA, verifica cámara y sigue [el enlace Android/Windows](ESCANER.md).
- Prepara offline, crea un producto, recibe 3 unidades y vende 1; reabre y sincroniza: 2 confirmadas, sin duplicados.
- Actualizar archivos no borra IndexedDB. Si una PWA sigue en la versión vieja, cierra todas sus ventanas/pestañas y vuelve a abrirla con internet; no borres pendientes para forzar una actualización.

## 6. Pruebas adicionales

`npm run standalone:test` utiliza datos sintéticos y PostgreSQL embebido, sin proyectos reales. Para los arneses de navegador instala Playwright en tu equipo y configura `NEXO_BROWSER_MODULES` donde el script lo admita. Algunos arneses conservan rutas de herramientas del entorno de desarrollo del autor y necesitan adaptarlas; no son requisitos para iniciar la demo o desplegar. Los scripts `hosted-*.mjs` y `scanner:test:hosted/reader` están fijados al entorno de validación del autor y a fixtures privados que no se publican: no los ejecutes sobre tu producción ni los presentes como una prueba portable lista para usar.

El `.exe` no tiene firma comercial. No desactives las protecciones de Windows para ejecutarlo; revisa el origen o compílalo tú mismo. No abras el puerto 47831 en el router. El enlace está limitado a la red local y no puede unir equipos en redes diferentes.

Referencias oficiales: [Supabase: configuración y secretos](https://supabase.com/docs/guides/local-development/managing-config), [Supabase: migraciones](https://supabase.com/docs/guides/deployment/database-migrations), [Wrangler](https://developers.cloudflare.com/workers/wrangler/), [Chrome: permiso de red local](https://developer.chrome.com/blog/local-network-access), [.NET: publicación autónoma](https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview).
