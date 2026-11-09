# Research

## Decisión 1

IndexedDB por usuario y empresa; service worker únicamente para recursos públicos de la aplicación.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 2

Cola con UUID, contenido inmutable, dependencias, fecha local y estados pending/conflict/blocked/synced/cancelled.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 3

Transacciones de base de datos para documento y movimientos; conflictos persistidos en el servidor.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 4

Stock local proyectado, sin representar una escritura local como confirmada en Supabase.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

## Decisión 5

Volver a validar membresía al sincronizar; bloquear snapshots al cerrar sesión y conservar pendientes.

**Motivo**: corresponde al plan aprobado y reutiliza los controles existentes.
**Alternativa descartada**: mantener una identidad ChatGPT obligatoria o escribir en otra base al perder conexión, porque no satisface el acceso independiente y crea inventarios divergentes.

Fuentes: documentación oficial de Supabase Auth, Cloudflare Workers Static Assets, MDN Service Workers y repositorios zxing-js/browser y lindell/JsBarcode. Consultadas el 2026-11-06.
