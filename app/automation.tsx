"use client";
import { useState, useRef, FormEvent, KeyboardEvent } from "react";
import {
  X,
  Plus,
  Trash2,
  ScanBarcode,
  ArrowDownLeft,
  ArrowUpRight,
  Upload,
  Download,
  Check,
  LoaderCircle,
  ChevronDown,
  Building2,
  Settings,
  Copy,
} from "lucide-react";
import type { Product, Data } from "./inventory";
import {
  readImportFile,
  previewImport,
  importTemplate,
  PreviewRow,
} from "./lib/import";
const money = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n / 100);
type Save = (
  body: Record<string, unknown>,
  message: string,
) => Promise<boolean>;
export function WorkspaceMenu({
  data,
  onChoose,
  onConfigure,
}: {
  data: Data | null;
  onChoose: (id: string) => void;
  onConfigure: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="workspace-wrapper">
      <button
        className="workspace"
        aria-expanded={open}
        aria-label="Seleccionar negocio"
        onClick={() => setOpen(!open)}
      >
        <span className="workspace-icon">
          {data?.workspace.name.slice(0, 1).toUpperCase() ?? "N"}
        </span>
        <span>
          <strong>{data?.workspace.name ?? "Mi negocio"}</strong>
          <small>{data?.workspace.description || "Espacio de trabajo"}</small>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <>
          <button
            className="menu-dismiss"
            aria-label="Cerrar selector de negocio"
            onClick={() => setOpen(false)}
          />
          <div className="workspace-menu">
            <p>TUS NEGOCIOS</p>
            {data?.workspaces.map((w) => (
              <button
                key={w.owner}
                onClick={() => {
                  onChoose(w.owner);
                  setOpen(false);
                }}
              >
                <Building2 size={16} />
                <span>
                  {w.name}
                  <small>
                    {w.role === "admin" ? "Administrador" : "Operador"}
                  </small>
                </span>
                {w.owner === data.workspace.owner && <Check size={15} />}
              </button>
            ))}
            {data?.user.role === "admin" && (
              <button
                onClick={() => {
                  setOpen(false);
                  onConfigure();
                }}
              >
                <Settings size={16} />
                Configurar este negocio
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
export function Panel({
  title,
  eyebrow,
  onClose,
  busy,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide-modal" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="panel-title">{title}</h2>
          </div>
          <button
            className="close"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function WorkspacePanel({
  data,
  onSave,
  onClose,
  busy,
  error,
}: {
  data: Data;
  onSave: Save;
  onClose: () => void;
  busy: boolean;
  error: string;
}) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await onSave(
        {
          action: "workspace",
          name: f.get("name"),
          description: f.get("description"),
        },
        "Datos del negocio actualizados.",
      )
    )
      onClose();
  }
  return (
    <Panel
      title="Configurar negocio"
      eyebrow="TU ESPACIO DE TRABAJO"
      onClose={onClose}
      busy={busy}
    >
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full">
            Nombre del negocio
            <input
              name="name"
              defaultValue={data.workspace.name}
              required
              minLength={2}
              maxLength={60}
            />
          </label>
          <label className="full">
            Descripción breve
            <input
              name="description"
              defaultValue={data.workspace.description}
              maxLength={160}
              placeholder="Ej. Tienda de calzado · Sede principal"
            />
          </label>
        </div>
        <p className="help">
          Estos datos identifican el negocio. Los permisos del equipo se
          administran en Configuración.
        </p>
        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            <Check size={16} />
            Guardar cambios
          </button>
        </div>
      </form>
    </Panel>
  );
}
type Line = { productId: string; quantity: string; unitPrice: string };
export function TransactionPanel({
  type,
  products,
  onSave,
  onClose,
  busy,
  error,
}: {
  type: "purchase" | "sale";
  products: Product[];
  onSave: Save;
  onClose: () => void;
  busy: boolean;
  error: string;
}) {
  const [lines, setLines] = useState<Line[]>([]),
    [scan, setScan] = useState(""),
    [localError, setLocalError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const isSale = type === "sale";
  const [contactOverride, setContactOverride] = useState<string | null>(null);
  const catalogSuppliers = Array.from(
    new Map(
      lines
        .map(
          (line) =>
            products.find((p) => p.id === line.productId)?.supplier.trim() ??
            "",
        )
        .filter(Boolean)
        .map((supplier) => [supplier.toLocaleLowerCase("es"), supplier]),
    ).values(),
  );
  const suggestedSupplier =
    !isSale && catalogSuppliers.length === 1 ? catalogSuppliers[0] : "";
  const contact = contactOverride ?? suggestedSupplier;
  function add(id: string) {
    const p = products.find((p) => p.id === id);
    if (!p) return;
    setLines((old) => {
      const found = old.find((l) => l.productId === id);
      if (found)
        return old.map((l) =>
          l.productId === id
            ? { ...l, quantity: String(Number(l.quantity || 0) + 1) }
            : l,
        );
      if (old.length >= 50) {
        setLocalError("Cada operación admite hasta 50 productos.");
        return old;
      }
      return [
        ...old,
        {
          productId: id,
          quantity: "1",
          unitPrice: String((isSale ? p.price : p.cost) / 100),
        },
      ];
    });
    setLocalError("");
  }
  function barcode(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = scan.trim();
    const p = products.find(
      (p) =>
        (p.barcode && p.barcode === code) ||
        p.sku.toUpperCase() === code.toUpperCase(),
    );
    if (!p) {
      setLocalError("No encontramos un producto activo con ese código.");
      return;
    }
    add(p.id);
    setScan("");
  }
  const total = lines.reduce(
    (s, l) =>
      s + Math.round(Number(l.unitPrice || 0) * 100) * Number(l.quantity || 0),
    0,
  );
  const invalid = lines.some(
    (l) =>
      !Number.isInteger(Number(l.quantity)) ||
      Number(l.quantity) < 1 ||
      Number(l.quantity) > 1000000 ||
      !/^\d+(\.\d{1,2})?$/.test(l.unitPrice) ||
      Number(l.unitPrice) > 1000000000 ||
      (isSale &&
        Number(l.quantity) >
          (products.find((p) => p.id === l.productId)?.stock ?? 0)),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lines.length || invalid) return;
    const f = new FormData(e.currentTarget);
    if (
      await onSave(
        {
          action: "document",
          id: requestId.current,
          type,
          reference: f.get("reference"),
          contact: f.get("contact"),
          note: f.get("note"),
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Math.round(Number(l.unitPrice) * 100),
          })),
        },
        isSale
          ? "Venta registrada. Las existencias se descontaron automáticamente."
          : "Compra recibida. Las existencias se añadieron automáticamente.",
      )
    )
      onClose();
  }
  return (
    <Panel
      title={isSale ? "Registrar venta" : "Recibir compra"}
      eyebrow="OPERACIONES AUTOMÁTICAS"
      onClose={onClose}
      busy={busy}
      wide
    >
      <p className="panel-intro">
        {isSale
          ? "Al confirmar se descontarán todos los productos de la venta."
          : "Confirma únicamente cuando los productos hayan llegado: al guardar aumentarán las existencias."}
      </p>
      {(error || localError) && (
        <div className="error" role="alert">
          {localError || error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="scan-box">
          <ScanBarcode size={22} />
          <input
            aria-label="Escanear código de barras o SKU"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={barcode}
            placeholder="Escanea un código de barras o escribe el SKU y pulsa Enter"
            autoComplete="off"
          />
        </div>
        <p className="help">
          Compatible con lectores USB o Bluetooth que escriben el código y
          envían Enter.
        </p>
        <label className="add-product">
          Añadir producto
          <select
            aria-label="Añadir producto a la operación"
            value=""
            onChange={(e) => add(e.target.value)}
          >
            <option value="" disabled>
              Selecciona un producto del catálogo
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.sku} · {p.stock}{" "}
                {p.stock === 1 ? "disponible" : "disponibles"}
              </option>
            ))}
          </select>
        </label>
        <div className="operation-lines">
          {lines.map((l, i) => {
            const p = products.find((p) => p.id === l.productId)!;
            return (
              <div className="operation-line" key={l.productId}>
                <div className="line-product">
                  <strong>{p.name}</strong>
                  <small>
                    {p.sku} · {p.stock}{" "}
                    {p.stock === 1 ? "disponible" : "disponibles"}
                  </small>
                </div>
                <label>
                  Cantidad
                  <input
                    aria-label={"Cantidad de " + p.name}
                    type="number"
                    min="1"
                    max={isSale ? p.stock : 1000000}
                    step="1"
                    value={l.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((v, j) =>
                          j === i ? { ...v, quantity: e.target.value } : v,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <label>
                  {isSale ? "Precio" : "Costo"} unitario (COP)
                  <input
                    aria-label={"Valor unitario de " + p.name}
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) =>
                      setLines(
                        lines.map((v, j) =>
                          j === i ? { ...v, unitPrice: e.target.value } : v,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <button
                  className="close"
                  type="button"
                  aria-label={"Quitar " + p.name}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          {!lines.length && (
            <div className="empty compact">
              <ScanBarcode />
              <p>Añade o escanea los productos de esta operación.</p>
            </div>
          )}
        </div>
        <div className="operation-total">
          <span>
            {lines.length} {lines.length === 1 ? "producto" : "productos"}
          </span>
          <strong>Total: {money(total)}</strong>
        </div>
        {invalid && (
          <p className="error">
            Revisa cantidades, precios y existencias antes de confirmar.
          </p>
        )}
        <div className="form-grid">
          <label>
            {isSale ? "Referencia de la venta" : "N.º de factura o pedido"}{" "}
            (opcional)
            <input
              name="reference"
              maxLength={80}
              placeholder={isSale ? "Ej. VENTA-102" : "Ej. FAC-2026-105"}
              aria-describedby="reference-help"
            />
            <span className="field-help" id="reference-help">
              {isSale
                ? "Identifica la venta con un comprobante o pedido."
                : "Sirve para relacionar la compra con el comprobante del proveedor."}{" "}
              Si lo dejas vacío, Nexo genera un código automáticamente.
            </span>
          </label>
          <label>
            {isSale ? "Cliente" : "Proveedor de esta compra"} (opcional)
            <input
              name="contact"
              maxLength={120}
              value={contact}
              onChange={(e) => setContactOverride(e.target.value)}
              aria-describedby={isSale ? undefined : "supplier-help"}
              placeholder={
                isSale
                  ? "Nombre del cliente"
                  : "Se completa al elegir un producto"
              }
            />
            {!isSale && (
              <>
                <span className="field-help" id="supplier-help">
                  {catalogSuppliers.length > 1
                    ? "Los productos tienen proveedores habituales distintos. Indica el proveedor de esta compra o registra las compras por separado."
                    : suggestedSupplier
                      ? "Usamos el proveedor habitual del catálogo. Puedes cambiarlo para esta compra."
                      : "Si el producto tiene un proveedor registrado, lo completaremos aquí. También puedes escribir uno."}
                </span>
                {contactOverride !== null && suggestedSupplier && (
                  <button
                    className="text-btn field-reset"
                    type="button"
                    onClick={() => setContactOverride(null)}
                  >
                    Usar proveedor del catálogo
                  </button>
                )}
              </>
            )}
          </label>
          <label className="full">
            Observaciones (opcional)
            <textarea name="note" maxLength={300} rows={2} />
          </label>
        </div>
        <p className="form-note">
          La operación completa se guarda una sola vez. Si falta stock, no se
          registra ninguna línea.
        </p>
        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={busy || !lines.length || invalid}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : isSale ? (
              <ArrowUpRight size={16} />
            ) : (
              <ArrowDownLeft size={16} />
            )}
            Confirmar {isSale ? "venta" : "recepción"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
export function ImportPanel({
  products,
  onSave,
  onClose,
  busy,
  error,
}: {
  products: Product[];
  onSave: Save;
  onClose: () => void;
  busy: boolean;
  error: string;
}) {
  const [rows, setRows] = useState<PreviewRow[]>([]),
    [name, setName] = useState(""),
    [localError, setLocalError] = useState(""),
    [reading, setReading] = useState(false);
  const id = useRef(crypto.randomUUID());
  const failures = rows.filter((r) => r.errors.length).length;
  async function select(file?: File) {
    if (!file) return;
    setReading(true);
    setRows([]);
    setName(file.name);
    setLocalError("");
    id.current = crypto.randomUUID();
    try {
      setRows(previewImport(await readImportFile(file), products));
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  function template() {
    const url = URL.createObjectURL(
      new Blob([importTemplate], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexo-plantilla-productos.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Panel
      title="Importar productos"
      eyebrow="CATÁLOGO SIN TRABAJO REPETIDO"
      onClose={onClose}
      busy={busy || reading}
      wide
    >
      <p className="panel-intro">
        Carga hasta 100 productos desde Excel (.xlsx) o CSV. Revisaremos los
        datos y los duplicados antes de guardarlos.
      </p>
      <div className="import-guide">
        <button className="btn" onClick={template}>
          <Download size={16} />
          Descargar plantilla
        </button>
        <p>
          Completa la plantilla sin cambiar las columnas. Los valores están en
          COP, sin separadores de miles. Deja el SKU vacío para generarlo
          automáticamente. Las existencias se añaden mediante una compra o
          entrada.
        </p>
      </div>
      <label className="file-input">
        <Upload size={22} />
        <strong>
          {reading
            ? "Leyendo archivo…"
            : name || "Seleccionar archivo Excel o CSV"}
        </strong>
        <small>Hasta 2 MB · Una hoja · Sin fórmulas ni macros</small>
        <input
          type="file"
          aria-label="Seleccionar archivo de productos"
          accept=".csv,.xlsx"
          disabled={busy || reading}
          onChange={(e) => select(e.target.files?.[0])}
        />
      </label>
      {(error || localError) && (
        <div className="error" role="alert">
          {localError || error}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="import-summary">
            {rows.length} {rows.length === 1 ? "fila" : "filas"} ·{" "}
            <strong className={failures ? "warning-text" : "positive"}>
              {failures
                ? `${failures} ${failures === 1 ? "fila" : "filas"} por corregir`
                : "Todo listo para importar"}
            </strong>
          </div>
          <div className="table-scroll import-preview">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Producto / SKU</th>
                  <th>Costo / Precio</th>
                  <th>Validación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>
                      <strong>{r.product?.name ?? "Datos no válidos"}</strong>
                      <small>{r.product?.sku}</small>
                    </td>
                    <td>
                      {r.product
                        ? `${money(r.product.cost)} / ${money(r.product.price)}`
                        : "—"}
                    </td>
                    <td>
                      {r.errors.length ? (
                        <span className="warning-text">
                          {r.errors.join(" ")}
                        </span>
                      ) : (
                        <span className="badge green">
                          <Check size={13} />
                          Correcto
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="form-note">
        Se crean productos nuevos; no se sobrescriben los existentes. Si alguna
        fila falla, no se importa ninguna.
      </p>
      <div className="modal-footer">
        <button className="btn" onClick={onClose} disabled={busy || reading}>
          Cancelar
        </button>
        <button
          className="btn primary"
          disabled={busy || reading || !rows.length || !!failures}
          onClick={async () => {
            if (
              await onSave(
                {
                  action: "import",
                  id: id.current,
                  rows: rows.map((r) => r.product),
                },
                `${rows.length} ${rows.length === 1 ? "producto importado" : "productos importados"} correctamente.`,
              )
            )
              onClose();
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Importar {rows.length || ""}{" "}
          {rows.length === 1 ? "producto" : "productos"}
        </button>
      </div>
    </Panel>
  );
}
