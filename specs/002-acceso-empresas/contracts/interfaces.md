# Interfaces

- `GET /api/config`: URL y clave pública de Supabase; nunca claves del servidor.
- `GET /api/bootstrap`: empresas e invitaciones de la identidad verificada.
- `POST /api/companies`: UUID estable y nombre; crea empresa y membresía administrativa.
- `POST /api/invitations/accept`: UUID; exige correo verificado coincidente y vigencia.
- `GET|POST /api/inventory?company=UUID`: sesión Bearer y empresa explícita.
- `POST /api/device?company=UUID`: UUID del dispositivo; devuelve expiración.
- `POST /api/sync?company=UUID`: id, user, company, body, dependencies, createdAt.
  La identidad real procede de la sesión; user debe coincidir, no concede permisos.
  Devuelve state pending/synced/conflict/cancelled y error seguro opcional.
- `GET /api/conflicts?company=UUID`: solo administrador.
- `POST /api/conflicts/resolve?company=UUID`: id, decision retry/cancel y reason.
- `POST /api/transfer`: token temporal de propietario; reclama empresa una sola vez.

Errores: 400 datos inválidos, 401 sesión, 403 acceso, 409 conflicto de operación,
413 tamaño y 503 resultado no confirmado. Una consulta fallida nunca representa
un inventario vacío. El modo offline usa una copia autorizada; no acepta escrituras
como confirmadas por Supabase hasta recibir su resultado.

Escaneo: coincidencia exacta del código de barras o SKU sin distinguir mayúsculas.
La cámara espera confirmación explícita para la próxima lectura. Etiqueta interna
Code 128 con SKU; las imágenes no salen del dispositivo.
