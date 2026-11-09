# Nexo: lector independiente, etiquetas e invitaciones

## Resultado
Escáner Nexo abre directamente el lector como una PWA separada de Inventario. El usuario inicia sesión con la misma cuenta, elige la empresa del PC y enlaza mediante un QR temporal. El celular puede abrir ventas o compras (solo administradores), pero nunca confirmar documentos. Los borradores se recuperan sin mezclar lecturas y cerrar un formulario pausa el lector conservando el vínculo.

Productos ofrece etiquetas internas Code 128 desde cada fila y después de crear un producto, con PNG/SVG, selección múltiple y papel A4 de 50 × 30 mm. Se conserva el SKU y el código comercial existente.

El acceso y los formularios tienen rutas recuperables. Las invitaciones enlazan a su identificador concreto, explican cómo crear la contraseña y conservan el destino durante el acceso. La aceptación sigue exigiendo el correo verificado y abre la empresa invitante.

## Criterios de aceptación
- Instalar ambas PWA en Android con nombres e iconos distintos; el lector no abre el inventario.
- El PC comprueba el conector por acción explícita y muestra solo la solución necesaria. Android no recibe el ejecutable Windows. La detección se puede corregir manualmente.
- Vincular sin documento abierto. Elegir Venta/Recibir compra en el celular, recuperar cada borrador y pausar hasta que el PC confirme el destino. Rechazar otra cuenta, empresa, rol o revisión.
- Una lectura solo se confirma tras guardarla en IndexedDB. Una repetición no duplica unidades. El celular no puede confirmar documentos.
- Recarga, atrás/adelante y empresa explícita no conceden acceso cruzado. Cambiar de empresa cierra el vínculo; navegar dentro de la misma lo conserva.
- Imprimir/descargar conserva identificadores y existencias. El PNG generado vuelve a leerse como el mismo SKU, incluidos ceros iniciales.
- Registro con contraseña, correo verificado y Turnstile; recuperación e invitación con mensajes claros. No crear otra empresa al aceptar.
- Validación separada de producción; sin dominio ni planes de pago. La comprobación física y los correos reales no se sustituyen con simulaciones.
