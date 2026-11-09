# Feature Specification: Estado de conexión y confirmación de guardado

**Feature Branch**: `chore/spec-kit-adoption`

**Created**: 2026-11-06

**Status**: Draft — propuesta de primera mejora; implementación pendiente.

**Input**: Adoptar Spec Kit en Nexo. Primera propuesta basada en la duda del dueño:
«¿Sí está conectado a Supabase? Parece que no».

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber si se consultó el inventario (Priority: P1)

Como administrador u operador quiero distinguir una consulta en curso, datos
confirmados y un fallo, para saber si puedo confiar en la información mostrada.

**Why this priority**: evita interpretar una pantalla visible como conexión activa.

**Independent Test**: abrir el inventario con el servicio disponible y después con
un fallo controlado; comprobar que cada resultado muestra un estado diferente.

**Acceptance Scenarios**:

1. **Given** que se abre o recarga el inventario, **When** la consulta está pendiente,
   **Then** se muestra «Consultando inventario…», sin afirmar que está conectado.
2. **Given** una consulta completa correcta, **When** se muestran los datos,
   **Then** se indica «Inventario actualizado» y la hora de esa consulta.
3. **Given** un fallo, **When** termina la consulta, **Then** se indica «No pudimos
   actualizar el inventario», se ofrece reintentar y se distingue cualquier dato
   anterior como información de la última consulta confirmada.
4. **Given** que se cambia de negocio, **When** la nueva consulta está pendiente,
   **Then** no se presenta el estado ni los datos del negocio anterior como propios
   del nuevo negocio.

### User Story 2 - Saber si una operación quedó guardada (Priority: P1)

Como usuario quiero una confirmación fiable de cada cambio y conservar lo escrito
si falla, para recuperar una operación sin duplicar movimientos.

**Why this priority**: el inventario depende de saber qué operaciones se confirmaron.

**Independent Test**: guardar una compra de prueba, recargar y comprobar su presencia;
interrumpir una segunda respuesta y reintentar sin crear dos documentos.

**Acceptance Scenarios**:

1. **Given** un formulario válido, **When** se envía, **Then** se muestra «Guardando…»
   y se evita enviar otra copia mientras la operación esté pendiente.
2. **Given** un guardado confirmado, **When** llega la confirmación, **Then** se muestra
   éxito y se actualiza el inventario; una recarga conserva el resultado.
3. **Given** que se pierde la respuesta, **When** no puede confirmarse el resultado,
   **Then** se informa «No pudimos confirmar el guardado», se conserva el formulario
   y el reintento representa la misma operación.
4. **Given** que el guardado se confirmó pero falló la recarga posterior, **When** se
   presenta el resultado, **Then** se comunica «Guardado; no pudimos actualizar la
   vista» y la acción disponible vuelve a consultar, sin guardar otra operación.

### Edge Cases

- Una sesión vencida pide iniciar sesión y no se presenta como caída de la base.
- Una denegación de permisos comunica falta de acceso y no revela otro negocio.
- Una respuesta tardía del negocio anterior no reemplaza la vista del negocio actual.
- Una respuesta perdida puede corresponder a un guardado ya realizado: no se afirma
  que falló definitivamente ni se genera otra operación para el reintento.
- Al no tener productos se muestra inventario vacío después de la consulta confirmada;
  una consulta fallida no se representa con existencias iguales a cero.
- La última consulta correcta no garantiza disponibilidad continua entre solicitudes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La vista DEBE diferenciar consulta pendiente, confirmada y fallida (US1.1–3).
- **FR-002**: El estado confirmado DEBE mostrar la hora de la última consulta correcta
  del negocio actual, sin prometer conexión permanente (US1.2).
- **FR-003**: Los datos anteriores DEBEN identificarse como anteriores tras un fallo;
  un cambio de negocio DEBE retirar los datos y estados del anterior (US1.3–4).
- **FR-004**: Un éxito DEBE mostrarse únicamente tras confirmación del guardado (US2.1–2).
- **FR-005**: Un fallo sin confirmación DEBE conservar los valores editados y permitir
  reintentar la misma operación sin duplicarla (US2.3).
- **FR-006**: Un fallo al actualizar la vista después de un guardado confirmado DEBE
  permitir consultar de nuevo sin repetir la escritura (US2.4).
- **FR-007**: Los estados DEBEN poder entenderse mediante texto, sin depender del color,
  y anunciarse a quienes utilizan lectores de pantalla (todos los escenarios).
- **FR-008**: Los mensajes DEBEN diferenciar sesión vencida, falta de permisos y fallo
  temporal, sin mostrar claves, datos de otros negocios ni errores internos (edge cases).

### Key Entities

- **Estado de consulta**: negocio actual, resultado y hora de la última consulta confirmada.
- **Operación pendiente**: identificador estable, valores del formulario y resultado de
  confirmación; se conserva durante los reintentos de esa operación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Los cuatro escenarios de US1 muestran el estado correcto y ningún dato
  del negocio anterior se atribuye al nuevo.
- **SC-002**: En diez reintentos controlados de una misma compra o venta se conserva
  exactamente un documento y una sola variación de existencias por operación.
- **SC-003**: En todos los fallos controlados sin confirmación se conserva el formulario;
  no se muestra un mensaje de éxito ni un inventario vacío inventado.
- **SC-004**: Tras un guardado confirmado y una recarga correcta, las existencias y el
  historial coinciden con la operación, incluso si la primera actualización de vista falló.
- **SC-005**: En pantalla móvil y con lector de pantalla se identifican los estados de
  consulta y guardado mediante texto, sin tener que interpretar un color.

## Assumptions

- Es una propuesta acotada para aplicar Spec Kit; no autoriza cambios de proveedor,
  nuevas credenciales, acceso público ni una migración de base de datos.
- Se reutilizan la autenticación, los permisos y la protección contra duplicados existentes.
- No incluye trabajo sin conexión, sincronización en segundo plano ni monitoreo continuo.
- La hora representa la consulta confirmada de esa sesión; no la última modificación
  realizada por cualquier usuario.
- Las comprobaciones usan un negocio de pruebas; el negocio real no recibe datos sintéticos.
