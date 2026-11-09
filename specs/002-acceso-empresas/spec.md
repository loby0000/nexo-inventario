# Feature Specification: Acceso propio y empresas independientes

**Feature Branch**: `chore/spec-kit-adoption`
**Created**: 2026-11-06
**Status**: Publicado en Cloudflare; acceso, empresas, correo y traslado verificados. Lanzamiento general condicionado a las pruebas restantes de las especificaciones 003 y 004.
**Input**: Plan aprobado por el propietario el 2026-11-06.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar con una cuenta verificada (Priority: P1)

Crear una cuenta con correo y contraseña, verificar correo, recuperar acceso y cerrar sesión en Nexo.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 1 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Entrar con una cuenta verificada», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### User Story 2 - Crear una empresa o aceptar una invitación (Priority: P1)

No crear empresas vacías para empleados invitados. Mostrar únicamente empresas autorizadas.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 2 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Crear una empresa o aceptar una invitación», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### User Story 3 - Aislar empresas y trasladar el negocio (Priority: P1)

Comprobar membresía en cada solicitud y preservar el inventario durante un traslado autorizado.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 3 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Aislar empresas y trasladar el negocio», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### Edge Cases

- Registro, recuperación y correos reales requieren SMTP y remitente configurados.
- Los Workers final y de validación están publicados; SMTP de Brevo e invitaciones por API están configurados y comprobados. El sitio original sigue privado y bloqueado para escrituras tras el traslado; el registro libre final sigue cerrado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Supabase Auth; correo verificado obligatorio; contraseñas nuevas de al menos 12 caracteres.
- **FR-002**: Empresas UUID independientes, membresías admin/operator e invitaciones de siete días.
- **FR-003**: Servidor Cloudflare con validación de identidad en Auth y autorización transaccional en PostgreSQL.
- **FR-004**: Traslado por token de 15 minutos emitido desde la sesión antigua del propietario, copia privada y congelación del origen.

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
