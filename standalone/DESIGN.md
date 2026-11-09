# Diseño integral de Nexo

Publicado y comprobado en validación el 8 de noviembre de 2026.

## Lenguaje visual
`client/experience.css` se importa al final en Inventario y Escáner. Centraliza colores, tipografía, tamaños, espaciado, estados de foco y adaptación móvil. El inventario mantiene verde profundo y superficies claras; el lector conserva su identidad azul.

- Navegación con una sola selección interactiva de empresa en el encabezado y contexto de empresa en la barra lateral.
- Resumen, Productos, Movimientos y Reportes con títulos por sección, tarjetas y tablas legibles, números alineados y desplazamiento horizontal contenido.
- Configuración con ancho máximo, columnas proporcionadas y distribución de una columna en móvil.
- Modales con encabezado completo y acciones persistentes, campos táctiles y ayudas legibles. La venta elimina una advertencia repetida; la compra mantiene el aviso de recibir únicamente mercancía real.
- Acceso, selección de empresas, selector, etiquetas y lector con componentes visualmente consistentes. Foco visible y movimiento reducido respetado.

## Comprobación
TypeScript y compilación de las dos aplicaciones. Revisión visual automatizada en 1440 × 1000 y 390 × 844: cinco secciones, acceso y modales de venta, compra, producto, empresa y escáner. Sin desbordamiento horizontal de la página; acciones de venta dentro del área visible. Rutas, historial y etiquetas PNG/impresión de 50 × 30 mm comprobados con el arnés existente.

Evidencia local: `work/design-review/` (22 capturas y resultado de las comprobaciones). La descarga física de etiquetas sigue fuera del alcance del navegador QA, como se documentó previamente.

Los dos sitios públicos de validación responden 200 y sirven `index-Cl3qk1BL.css` / `scanner-Cl3qk1BL.css`. Publicado en el sitio original el 8 de noviembre de 2026 por solicitud explícita del propietario. Inventario: versión 7e8f2e23-5fd1-4d96-9f5b-803b6b0ef4ac. Escáner: versión 98b03ceb-ff64-46bc-88e7-ba60d508175a. Comprobados HTTP 200, CSS nuevo, base de producción, service worker protocolo 2, API privada 401 y conector 2.0.0 de producción. No se alteraron datos ni configuración de acceso; el registro público sigue cerrado. La prueba física del enlace Android/Windows continúa pendiente.
