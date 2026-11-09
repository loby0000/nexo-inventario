# Research

## Decisión 1

Supabase Auth; correo verificado obligatorio; contraseñas nuevas de al menos 12 caracteres.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 2

Empresas UUID independientes, membresías admin/operator e invitaciones de siete días.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 3

Servidor Cloudflare con validación de identidad en Auth y autorización transaccional en PostgreSQL.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 4

Traslado por token de 15 minutos emitido desde la sesión antigua del propietario, copia privada y congelación del origen.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

Fuentes: documentación oficial de Supabase Auth, Cloudflare Workers Static Assets, MDN Service Workers y repositorios zxing-js/browser y lindell/JsBarcode. Consultadas el 2026-11-06.
