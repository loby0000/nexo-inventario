"use client";
import {ModalHeading} from "./modal-heading";
import { useState, useRef, useEffect, useLayoutEffect, FormEvent, KeyboardEvent } from "react";
import { ContinuousCamera } from "../client/continuous-camera";
import type {ScannerIdentity} from "../client/scanner-link";
import {useScannerSession} from "../client/scanner-session";
import {loadDraft,updateDraft,addDraftScan,finishDraft,freezeDraft,reopenDraft,type ScanDraft,type DraftLine} from "../client/scanner-store";
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
  Package,
  Camera,
  Smartphone,
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
  className = "",
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide-modal" : "") + " " + className}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
      >
        <ModalHeading title={title} eyebrow={eyebrow} id="panel-title" busy={busy} onClose={onClose} description={title==="Recibir compra"?"Añade los productos recibidos y revisa las cantidades antes de confirmar.":title==="Registrar venta"?"Selecciona lo que vendiste y confirma la salida del inventario.":title.includes("Importar")?"Carga tu catálogo y revisa los datos antes de guardarlos.":"Actualiza los datos que identifican a tu empresa."}/>
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
      title="Editar empresa"
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
type Line = DraftLine;
export function TransactionPanel({type,products,onSave,onClose,busy,error,identity,companyName='Tu empresa'}:{type:'purchase'|'sale';products:Product[];onSave:Save;onClose:()=>void;busy:boolean;error:string;identity?:ScannerIdentity;companyName?:string}) {
  const [draft,setDraft]=useState<ScanDraft>(),[scan,setScan]=useState(''),[localError,setLocalError]=useState(''),[writing,setWriting]=useState(false);
  const [camera,setCamera]=useState(false);
  const scannerSession=useScannerSession();
  const receiveRef=useRef(receive);receiveRef.current=receive;
  useLayoutEffect(()=>{if(!scannerSession||!draft||draft.submitted||busy)return;return scannerSession.attach({draft:draft.id,mode:type,companyName,busy:()=>pendingWrites.current>0||submitting.current,read:(id,code)=>receiveRef.current(id,code)});},[scannerSession?.attach,draft?.id,draft?.submitted,busy,type,companyName]);
  const pendingWrites=useRef(0),submitting=useRef(false);
  const queue=useRef<Promise<unknown>>(Promise.resolve()),alive=useRef(true),current=useRef<ScanDraft|undefined>(undefined);current.current=draft;
  const isSale=type==='sale',lines=draft?.lines??[],contactOverride=draft?.contact??null;
  useEffect(()=>{alive.current=true;void loadDraft(identity?.user??'local',identity?.company??'local',type).then(d=>{if(alive.current){current.current=d;setDraft(d);}}).catch(e=>setLocalError(e.message));return()=>{alive.current=false;};},[identity?.user,identity?.company,type]);
  function enqueue<T>(fn:()=>Promise<T>):Promise<T>{
    pendingWrites.current++;setWriting(true);const result=queue.current.then(fn);queue.current=result.catch(()=>{});void result.finally(()=>{pendingWrites.current--;if(alive.current&&pendingWrites.current===0)setWriting(false);}).catch(()=>{});return result;
  }
  function change(fn:(d:ScanDraft)=>ScanDraft){
    if(!current.current||busy)return;
    void enqueue(async()=>{const value=await updateDraft(current.current!.key,fn);current.current=value;if(alive.current)setDraft(value);}).catch(e=>setLocalError(e.message));
  }
  function setLines(next:Line[]|((old:Line[])=>Line[])){change(d=>({...d,lines:typeof next==='function'?next(d.lines):next}));}
  function setContactOverride(contact:string|null){change(d=>({...d,contact}));}
  async function receive(id:string,code:string){
    return enqueue(async()=>{
      if(!current.current||busy)throw Error('Espera a que termine el guardado.');
      const result=await addDraftScan(current.current.key,id,code,products);current.current=result.draft;if(alive.current){setDraft(result.draft);setLocalError(result.ack.ok?'':result.ack.message);}return result.ack;
    });
  }
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
  function add(id:string){const p=products.find(p=>p.id===id);if(p)void receive(crypto.randomUUID(),p.sku).catch(e=>setLocalError(e.message));}
  function barcode(e:KeyboardEvent<HTMLInputElement>){if(e.key!=='Enter')return;e.preventDefault();const value=scan.trim();if(value)void receive(crypto.randomUUID(),value).catch(e=>setLocalError(e.message));setScan('');}
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
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!lines.length||invalid||busy||writing||!draft||submitting.current)return;submitting.current=true;
    setCamera(false);setLocalError('');
    try{
      await queue.current;
      const d=await freezeDraft(current.current!.key,current.current!.updatedAt,suggestedSupplier);setDraft(d);current.current=d;
      const ok=await onSave({action:'document',id:d.id,type,reference:d.reference,contact:d.contact??suggestedSupplier,note:d.note,lines:d.lines.map(l=>({productId:l.productId,quantity:Number(l.quantity),unitPrice:Math.round(Number(l.unitPrice)*100)}))},isSale?'Venta registrada. Las existencias se descontaron automáticamente.':'Compra recibida. Las existencias se añadieron automáticamente.');
      if(ok){await finishDraft(d.key,d.id);onClose();}else{await reopenDraft(d.key);current.current={...d,submitted:false};setDraft(current.current);}
    }catch(e){setLocalError((e as Error).message);}finally{submitting.current=false;}
  }
  return (
    <Panel
      title={isSale ? "Registrar venta" : "Recibir compra"}
      eyebrow="OPERACIONES AUTOMÁTICAS"
      onClose={onClose}
      busy={busy}
      wide
      className="transaction-modal"
    >
      {!isSale && <p className="transaction-notice">Registra únicamente productos que ya recibiste. Al confirmar, aumentarán las existencias.</p>}
      {(error || localError) && (
        <div className="error" role="alert">
          {localError || error}
        </div>
      )}
      {!draft&&<p role="status">Recuperando borrador…</p>}
      {draft&&<p className="draft-status" role="status">{writing?'Guardando borrador…':draft.submitted?'Guardado por confirmar. Reintenta sin cambiar los datos.':'Borrador guardado en este equipo · Las existencias no cambian hasta confirmar.'}</p>}
      {camera&&<div className="transaction-camera"><ContinuousCamera disabled={busy||!!draft?.submitted} onRead={async code=>{await receive(crypto.randomUUID(),code);}}/><button className="text-btn" type="button" onClick={()=>setCamera(false)}>Cerrar cámara</button></div>}

      <form className="transaction-form" onSubmit={submit}>
        <fieldset className="transaction-fieldset" disabled={!draft||busy||!!draft.submitted}>
        <section className="transaction-products">
          <div className="transaction-section-heading"><span>01</span><h3>Productos de la {isSale ? 'venta' : 'compra'}</h3><div className="transaction-scan-actions"><button className="btn camera-action" type="button" disabled={!draft||!!draft.submitted} onClick={()=>setCamera(v=>!v)}><Camera size={16}/>Usar cámara</button>{identity&&scannerSession&&<button className="btn camera-action" type="button" disabled={!draft||!!draft.submitted} onClick={()=>scannerSession?.show()}><Smartphone size={16}/>Conectar celular</button>}</div></div>
        <div className="scan-box">
          <ScanBarcode size={22} />
          <input
            aria-label="Escanear código de barras o SKU"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={barcode}
            placeholder="Código de barras o SKU"
            autoComplete="off"
          />
        </div>
        <p className="help">
          Con lector USB/Bluetooth, escanea y pulsa Enter. También puedes buscar en el catálogo.
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
                <div className="line-item-heading"><span className="line-item-icon"><Package size={19}/></span>
                <div className="line-product">
                  <strong>{p.name}</strong>
                  <small>
                    {p.sku} · {p.stock}{" "}
                    {p.stock === 1 ? "disponible" : "disponibles"}
                  </small>
                </div>
                <button
                  className="close"
                  type="button"
                  aria-label={"Quitar " + p.name}
                  onClick={() => setLines(old=>old.filter(v=>v.productId!==l.productId))}
                >
                  <Trash2 size={16} />
                </button>
                </div>
                <div className="line-fields">
                <label>
                  Cantidad
                  <input
                    aria-label={"Cantidad de " + p.name}
                    type="number"
                    min="1"
                    max={isSale ? p.stock : 1000000}
                    step="1"
                    value={l.quantity}
                    onChange={e=>{const quantity=e.target.value;setLines(old=>old.map(v=>v.productId===l.productId?{...v,quantity}:v));}}
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
                    onChange={e=>{const unitPrice=e.target.value;setLines(old=>old.map(v=>v.productId===l.productId?{...v,unitPrice}:v));}}
                    required
                  />
                </label>

                  <div className="line-subtotal"><small>Subtotal</small><strong>{Number.isFinite(Number(l.quantity)*Number(l.unitPrice))?money(Math.round(Number(l.unitPrice||0)*100)*Number(l.quantity||0)):"—"}</strong></div>
                </div>
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
        {invalid && (
          <p className="error">
            Revisa cantidades, precios y existencias antes de confirmar.
          </p>
        )}
        </section>
        <details className="transaction-details" open={catalogSuppliers.length>1}>
          <summary><span className="details-icon">02</span><span><strong>Datos adicionales</strong><small>{contact?(isSale?"Cliente: ":"Proveedor: ")+contact:"Factura, "+(isSale?"cliente":"proveedor")+" y observaciones · Opcional"}</small></span><ChevronDown size={16}/></summary>
        <div className="form-grid">
          <label>
            {isSale ? "Referencia de la venta" : "N.º de factura o pedido"}{" "}
            (opcional)
            <input
              name="reference"
              value={draft?.reference??""}
              onChange={e=>{const reference=e.target.value;change(d=>({...d,reference}));}}
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
            <textarea name="note" value={draft?.note??""} onChange={e=>{const note=e.target.value;change(d=>({...d,note}));}} maxLength={300} rows={2} />
          </label>
        </div>
        </details>
        </fieldset>
        <div className="modal-footer transaction-footer">
          <div className="transaction-footer-total"><span>{lines.length} {lines.length===1?"producto":"productos"} · Total</span><strong>{money(total)}</strong></div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Guardar y cerrar
          </button>
          <button
            className="btn primary"
            disabled={busy || writing || !draft || !lines.length || invalid}
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
