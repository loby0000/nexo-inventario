# Revisión de seguridad — 8 de noviembre de 2026

## Alcance

Revisión del sitio original y lector, API, permisos efectivos de PostgreSQL, asesores de Supabase y dependencias de producción. Las comprobaciones alojadas son de lectura y solicitudes negativas, sin escribir productos, movimientos, ventas ni cuentas de prueba en producción.

## Hallazgos corregidos

- El registro estaba oculto en Nexo pero Supabase permitía altas directas. Se deshabilitaron altas públicas en el proyecto original, conservando cuentas existentes, confirmación de correo y acceso anónimo deshabilitado. Dar de alta personas nuevas requiere un proceso administrativo autorizado hasta que se decida abrir el registro con las protecciones y pruebas correspondientes.
- Métodos incorrectos y rutas desconocidas llegaban al proceso de autenticación. Ahora se rechazan antes de consultar Supabase (405 con Allow o 404).
- Se rechazan solicitudes marcadas cross-site además de verificar Origin, y credenciales Bearer vacías o excesivas.
- Se añaden límites de API por identidad verificada: 240 solicitudes/minuto y 6 intentos de invitación/minuto por usuario, con 429 y Retry-After. No se usa el usuario enviado en el cuerpo. Los límites de Cloudflare son aproximados por ubicación; no sustituyen las autorizaciones ni un sistema completo de protección DDoS, ni limitan directamente los endpoints públicos de Supabase Auth.
- El JSON está acotado por bytes y por 10 segundos de recepción; se verifica MIME exacto, UTF-8, tamaño declarado y tamaño real incluso en streams, cancelando el cuerpo ante error. Lector: 16 KiB; inventario: 256 KiB.
- Las respuestas de API, incluidos errores y rechazos del lector, impiden caché y enmarcado, usan no-referrer, nosniff, HSTS y una CSP sin recursos ejecutables. HTML mantiene cámara, Turnstile y red local, añadiendo HSTS, X-Frame-Options y restricciones de formularios, workers y manifiestos. Se conserva la excepción HTTP del puerto local 47831 para no romper el lector.

## Comprobaciones

- 16 tablas del esquema nexo: RLS activo y sin privilegios directos anon/authenticated de lectura o escritura.
- Las tres funciones públicas nexo_gateway/nexo_legacy_gateway/nexo_v2_gateway no son SECURITY DEFINER y no pueden ejecutarlas anon/authenticated.
- npm audit --omit=dev: 0 vulnerabilidades conocidas en el momento de la revisión. No equivale a ausencia de vulnerabilidades desconocidas.
- TypeScript y 90 pruebas automatizadas pasan. Incluyen bloqueo antes de Auth, rate limit por identidad verificada, límites de invitación antes de escribir/enviar correo, JSON excesivo o estancado, aislamiento de empresas y operaciones idempotentes.
- Registro de cuentas, contraseñas y autenticación no se probaron enviando correos ni creando usuarios de producción.

## Limitaciones pendientes

El asesor de Supabase mantiene la advertencia de protección contra contraseñas filtradas: esa función del proveedor requiere Pro. No se contrata ni se cambia el plan. La auditoría completa identifica 27 avisos en herramientas de desarrollo (9 altos, 17 moderados y 1 bajo), incluidos Vite y herramientas del framework anterior. No se incluyen esos servidores de desarrollo en la aplicación publicada. Su actualización requiere mantenimiento y pruebas de compatibilidad; no se declara resuelta en esta entrega. MFA del usuario/administrador no está implementado en esta entrega. Los dispositivos previamente preparados conservan el plazo offline autorizado de 24 horas; la revocación definitiva se verifica al sincronizar.

Referencias: [Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Supabase: protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Validación alojada: pasan API, aislamiento, firma, integridad del conector y recorrido real de dos navegadores con conector nativo, cambio de operación, borrador durable, pausa y reapertura offline. Son pruebas con fixtures aislados: no confirman inventario de producción.

## Despliegue comprobado

Original: ff7754a3-bf88-4466-9230-28a8e9479153. Lector: 0033dcfb-765b-4539-bbee-0c424a20587f. Pasan 11 comprobaciones HTTP negativas/de cabeceras en producción, API Auth con altas deshabilitadas y confirmación de correo requerida. Conector de producción sin cambios. No se modificó inventario.
