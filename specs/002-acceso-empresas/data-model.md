# Data Model

`companies`: UUID, nombre, creador y fecha. `company_members`: empresa/usuario únicos, rol.
`company_invitations`: UUID, empresa/correo únicos, caducidad y entrega.
`devices`: dispositivo/usuario/empresa, validación y expiración de 24 horas.
`sync_operations`: UUID, empresa, usuario, cuerpo inmutable, hash, dependencias,
fecha del dispositivo, recepción, estado, error y decisión auditada.
`business_transfers`: hash de token temporal, origen, caducidad y destino consumido.
`transfer_backups`: copia privada previa al cambio; `frozen_legacy_owners`: origen cerrado.
El catálogo, documentos y movimientos existentes mantienen sus identificadores;
`owner` corresponde al UUID de la empresa para los negocios de la nueva versión.

En IndexedDB los snapshots se separan por cuenta/empresa. Una operación local pasa
de pending a synced, conflict o blocked; una anulación administrativa produce cancelled.
Los códigos de barras son texto y conservan ceros iniciales. Son únicos por empresa.
