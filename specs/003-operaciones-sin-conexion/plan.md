# Implementation Plan: Operaciones sin conexión y sincronización

**Branch**: `chore/spec-kit-adoption` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Aplicar el plan aprobado en una aplicación independiente bajo `standalone/`.

## Technical Context

React 19, TypeScript 5.9, Vite 8, Cloudflare Workers, Supabase Auth y PostgreSQL.
IndexedDB para operaciones locales. Pruebas Vitest con PostgreSQL embebido PGlite,
fake-indexeddb y servidor QA explícitamente separado de producción.
Plataformas objetivo: escritorio y móvil con navegador moderno, HTTPS o localhost.
Dependencias fijadas en package-lock.json. Ninguna clave administrativa en el cliente.

## Constitution Check

Integridad transaccional conservada; separación por empresa en el servidor;
español y COP; comprobaciones proporcionales. El modo offline guarda pendientes,
no cambia la fuente central a D1. La nueva publicación es independiente y no
cambia el acceso privado de la versión anterior.

## Project Structure

- `standalone/client`: acceso, coordinación, cola y escáner.
- `standalone/ui`: interfaz reutilizada y adaptada del inventario existente.
- `standalone/server`: API con validación y acceso privado a Supabase.
- `supabase/migrations`: migración aditiva y transacciones de empresa/sincronización.
- `standalone/tests`: pruebas automatizadas y servidor QA local.

## Implementation Changes

- IndexedDB por usuario y empresa; service worker únicamente para recursos públicos de la aplicación.
- Cola con UUID, contenido inmutable, dependencias, fecha local y estados pending/conflict/blocked/synced/cancelled.
- Transacciones de base de datos para documento y movimientos; conflictos persistidos en el servidor.
- Stock local proyectado, sin representar una escritura local como confirmada en Supabase.
- Volver a validar membresía al sincronizar; bloquear snapshots al cerrar sesión y conservar pendientes.

## Validation and Release

`npm run standalone:check`, `npm run standalone:test`, `npm run standalone:build`.
Usar `quickstart.md` para el navegador y la entrega. La aplicación antigua se
mantiene privada; el despliegue nuevo requiere cuenta de alojamiento, correo,
copia recuperable y ensayo de migración. No declarar completados los casos reales
que todavía requieren credenciales, correos o dispositivos del propietario.
