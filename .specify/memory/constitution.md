# Nexo Inventario Constitution

## Core Principles

### I. Integridad del inventario
Compras y ventas DEBEN guardar el documento, los movimientos y las existencias
como una sola operación. Un reintento NO DEBE duplicar la operación. Las ventas
concurrentes NO DEBEN producir existencias negativas. Los importes se mantienen
en centavos enteros y el historial se corrige con movimientos compensatorios.

### II. Aislamiento por negocio y secretos en el servidor
Toda lectura y escritura DEBE comprobar identidad y permisos del negocio en el
servidor. Las invitaciones requieren aceptación. Las claves privadas y claves
administrativas NO DEBEN aparecer en el navegador, documentación ni repositorio.
El acceso privado del alojamiento se conserva salvo petición expresa del dueño.

### III. Experiencia clara en español
La interfaz DEBE usar español, moneda COP y mensajes comprensibles. Los campos
opcionales DEBEN indicar su propósito cuando pueda confundirse. Se reutilizan
los datos ya registrados, permitiendo cambios por operación cuando corresponda.
Los mensajes de éxito DEBEN corresponder a un guardado confirmado.

### IV. Compatibilidad y alcance acotado
Las mejoras DEBEN reutilizar la arquitectura existente y preservar los datos y
contratos que no sea necesario modificar. Producción usa Supabase; el entorno
local usa D1 con datos de prueba. Una caída de Supabase NO DEBE activar escrituras
en D1 como alternativa. Una modificación de datos requiere una vía de recuperación.

### V. Verificación proporcional y evidencia real
Cada cambio DEBE verificarse con comprobaciones adecuadas a su impacto. Cambios
de contratos, permisos o inventario requieren pruebas de sus invariantes; cambios
visuales requieren revisión del flujo afectado. Una prueba local NO DEBE presentarse
como evidencia de producción. No se agregan datos de prueba al negocio real.

## Límites del producto

Se mantienen los límites documentados en README.md: cantidades enteras, hasta 50
productos por operación y 100 por importación. Nexo registra recepción de compras
y ventas, sin cobros ni facturación electrónica. Las claves se configuran en el
alojamiento, fuera del código. SECURITY.md documenta la frontera de seguridad.

## Flujo de trabajo

Las mejoras nuevas se describen primero con escenarios y criterios verificables.
El plan identifica archivos afectados y pruebas necesarias. Las tareas distinguen
trabajo pendiente de resultados comprobados. Antes de publicar se revisan el cambio,
las comprobaciones y la audiencia existente. No se inventan pruebas aprobadas.
La instalación de herramientas y documentación no requiere desplegar la aplicación.

## Governance

Esta constitución recoge reglas ya establecidas en README.md, SECURITY.md y las
instrucciones del dueño. Las instrucciones expresas del dueño tienen prioridad.
Cada plan revisa estos principios. Los cambios de reglas explican su motivo y su
impacto: MAJOR para incompatibilidades, MINOR para reglas nuevas y PATCH para
aclaraciones. Las especificaciones terminadas se conservan como registro histórico;
las mejoras posteriores crean una especificación nueva vinculada a la anterior.

**Version**: 1.0.0 | **Ratified**: 2026-11-06 | **Last Amended**: 2026-11-06
