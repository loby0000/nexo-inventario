# Implementation Plan: Lector, cámara y etiquetas

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

- Lector USB/Bluetooth en modo teclado, con campo de prueba que detecta Enter.
- ZXing en el dispositivo para EAN-8/EAN-13/UPC-A/Code 128; sin subir imágenes.
- JsBarcode SVG Code 128, nombre y SKU legibles; impresión A4 al 100 %.
- Recursos del decodificador e impresor incluidos en el shell offline.
- Código desconocido informa; no crea productos ni modifica stock automáticamente.

## Validation and Release

`npm run standalone:check`, `npm run standalone:test`, `npm run standalone:build`.
Usar `quickstart.md` para el navegador y la entrega. La aplicación antigua se
mantiene privada; el despliegue nuevo requiere cuenta de alojamiento, correo,
copia recuperable y ensayo de migración. No declarar completados los casos reales
que todavía requieren credenciales, correos o dispositivos del propietario.
