# Feature Specification: Operaciones sin conexión y sincronización

**Feature Branch**: `chore/spec-kit-adoption`
**Created**: 2026-11-06
**Status**: Implementación local; lanzamiento y validación externa pendientes.
**Input**: Plan aprobado por el propietario el 2026-11-06.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar un equipo del negocio (Priority: P1)

Autorizar explícitamente un dispositivo con conexión y conservar acceso offline durante 24 horas.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 1 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Preparar un equipo del negocio», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### User Story 2 - Registrar productos, compras y ventas sin servidor (Priority: P1)

Guardar duraderamente antes de confirmar, mostrar pendientes y existencias estimadas.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 2 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Registrar productos, compras y ventas sin servidor», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### User Story 3 - Sincronizar y resolver conflictos (Priority: P1)

Reintentar los mismos identificadores, impedir duplicados y resolver ventas sin existencias con revisión administrativa.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 3 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Sincronizar y resolver conflictos», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### Edge Cases

- No se garantizan existencias globales mientras varios dispositivos estén desconectados.
- No admite offline invitaciones, importación, edición de productos existentes ni ajustes manuales.
- El navegador puede borrar almacenamiento: la cola local no sustituye una copia de seguridad.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: IndexedDB por usuario y empresa; service worker únicamente para recursos públicos de la aplicación.
- **FR-002**: Cola con UUID, contenido inmutable, dependencias, fecha local y estados pending/conflict/blocked/synced/cancelled.
- **FR-003**: Transacciones de base de datos para documento y movimientos; conflictos persistidos en el servidor.
- **FR-004**: Stock local proyectado, sin representar una escritura local como confirmada en Supabase.
- **FR-005**: Volver a validar membresía al sincronizar; bloquear snapshots al cerrar sesión y conservar pendientes.

### Key Entities

- Cuenta verificada, empresa y membresía: identidad separada de autorización.
- Operación: identificador estable, empresa, autor, contenido y resultado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: todos los recorridos anteriores tienen una comprobación reproducible en `quickstart.md`.
- **SC-002**: ninguna prueba de aislamiento concede acceso a una empresa ajena.
- **SC-003**: las pruebas de reintentos conservan un documento por identificador y ninguna existencia negativa.
- **SC-004**: toda comprobación externa pendiente se registra como pendiente, sin presentar un simulador como producción.

## Assumptions

- COP, cantidades enteras y límites del catálogo existente se mantienen.
- La especificación 001 aporta estados de consulta, guardado confirmado y resultado incierto.
- No se contratan servicios ni se traslada el negocio real durante las pruebas locales.
