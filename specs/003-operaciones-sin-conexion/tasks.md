# Tasks

- [x] T001 Implementar snapshots, autorización de 24 h y cola IndexedDB.
- [x] T002 Implementar proyección de existencias, reintentos y bloqueo por cuenta.
- [x] T003 Implementar sincronización transaccional y revisión administrativa.
- [x] T004 Verificar persistencia, idempotencia y pérdida de respuesta en pruebas locales.
- [ ] T005 Validar desconexión completa y dos dispositivos reales antes del lanzamiento.

Los casos pendientes requieren evidencia propia antes de marcarse completos.

Se completaron pruebas en Chrome local con rechazo de sesión y QuotaExceededError
inyectados: no hubo éxito falso, el pendiente se conservó tras bloquear/cerrar
sesión y la misma identidad pudo revalidar y sincronizar una sola copia. Detalles
y alcance en quickstart.md y en el informe externo nexo-browser-failures.json.

El propietario pospuso la repetición física identificable con SKU OFF-CEL-002.
La afirmación anterior de 2 unidades aún no coincide con los productos encontrados
en el servidor final (0 y 69 en la empresa de prueba). T005 continúa abierto.
