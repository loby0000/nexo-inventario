# Feature Specification: Lector, cámara y etiquetas

**Feature Branch**: `chore/spec-kit-adoption`
**Created**: 2026-11-06
**Status**: Implementación local; lanzamiento y validación externa pendientes.
**Input**: Plan aprobado por el propietario el 2026-11-06.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar un código existente (Priority: P1)

Leer el código como texto y buscarlo únicamente en el catálogo de la empresa.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 1 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Usar un código existente», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### User Story 2 - Usar la cámara del móvil (Priority: P2)

Solicitar permiso al activar, procesar localmente y exigir Escanear siguiente para otra lectura.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 2 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Usar la cámara del móvil», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### User Story 3 - Etiquetar productos sin código (Priority: P2)

Imprimir el SKU como Code 128 en etiquetas A4 de 50 x 30 mm, sin asignar EAN comercial.

**Why this priority**: protege el acceso, la continuidad operativa y la integridad del inventario.

**Independent Test**: ejecutar el recorrido 3 con datos sintéticos y comparar el resultado visible con el estado persistido.

**Acceptance Scenarios**:

1. **Given** una cuenta y empresa de prueba autorizadas, **When** se completa el recorrido «Etiquetar productos sin código», **Then** se obtiene el resultado descrito sin alterar otro negocio.
2. **Given** un fallo de conexión, permisos o datos, **When** se intenta el mismo recorrido, **Then** se informa el resultado real, no se muestra éxito falso y se conservan las operaciones pendientes existentes.

### Edge Cases

- Compatibilidad física depende del lector, cámara, navegador e impresora utilizados.
- Sin acceso al hardware del usuario no se declara compatibilidad física comprobada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Lector USB/Bluetooth en modo teclado, con campo de prueba que detecta Enter.
- **FR-002**: ZXing en el dispositivo para EAN-8/EAN-13/UPC-A/Code 128; sin subir imágenes.
- **FR-003**: JsBarcode SVG Code 128, nombre y SKU legibles; impresión A4 al 100 %.
- **FR-004**: Recursos del decodificador e impresor incluidos en el shell offline.
- **FR-005**: Código desconocido informa; no crea productos ni modifica stock automáticamente.

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
