# Tasks

- [x] T001 Implementar login, registro, verificación, recuperación y cierre.
- [x] T002 Implementar empresas, membresías, invitaciones y revocación.
- [x] T003 Implementar migración aditiva y traslado protegido con copia recuperable.
- [x] T004 Verificar aislamiento y permisos con PostgreSQL local.
- [x] T005 Configurar y probar correo real y alojamiento independiente.

Los casos pendientes requieren evidencia propia antes de marcarse completos.

Avance de T005: alojamiento final y de validación publicados en Cloudflare Free;
aislamiento, roles, revocación, reintentos concurrentes y traslado de la copia
restaurada comprobados contra Supabase alojado. El traslado real de NexusPro se
completó desde la sesión firmada del propietario, con respaldo recuperable,
conservación de productos y movimientos y bloqueo de escrituras del origen.

También se comprobó con el propietario la invitación de Auth, correo verificado,
contraseña propia, recuperación por correo e inicio de sesión posterior. Es el
remitente de pruebas de Supabase para un miembro autorizado, no SMTP para clientes
externos ni envío de invitaciones de empresa.

Con autorización del propietario se guardó SMTP de Brevo en Supabase final. La
autenticación STARTTLS devolvió 235 y el mensaje directo de prueba llegó a Gmail.
La clave API correcta se cargó como secreto en ambos Workers. Una invitación real
enviada por el Worker de validación llegó a Gmail; su aceptación desde la cuenta
verificada añadió únicamente la membresía de operador en «QA correo Brevo»,
conservando «Colombia S.A.S». La interfaz y la base confirman rol operator y cero
invitaciones pendientes para ese identificador. Además, una recuperación solicitada
desde la interfaz final generó un correo de Supabase entregado mediante Brevo.
Esta última prueba comprueba la entrega con el nuevo SMTP; no repitió el cambio de
contraseña completo ya probado anteriormente con el remitente integrado.
Se configuró el mismo SMTP en validación con autorización. El propietario registró
la cuenta de prueba propietario@example.com, recibió el correo de verificación de
Brevo y entró: Supabase confirmó email verificado e inicio de sesión. El registro
de validación se cerró de nuevo al terminar el alta; el final permaneció cerrado.

La prueba nueva descubrió que el botón del resumen enviaba la aceptación por la
ruta de inventario. Ambos botones usan ahora el mismo callback y la ruta de
invitaciones. Se reprodujo el error antes de publicar el arreglo y se verificó
después con la invitación real pendiente: abrió QA correo Brevo como operador,
añadió la empresa al selector y conservó su empresa propia sin crear otra. SQL
confirmó las dos membresías, una empresa propia y cero invitaciones restantes.
Las demás condiciones de lanzamiento, especialmente hardware y offline físico,
siguen abiertas en sus especificaciones; T005 no declara terminado todo el plan.
