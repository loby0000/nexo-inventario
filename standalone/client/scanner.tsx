import { ModalHeading } from "../ui/modal-heading";
import { useDialog } from "../ui/use-dialog";
import { ContinuousCamera } from "./continuous-camera";
import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import type { Product } from "../ui/inventory";
export function Scanner({
  products,
  admin,
  onCode,
  onClose,
  initialTab = "reader",
}: {
  products: Product[];
  admin: boolean;
  initialTab?: "reader" | "camera" | "labels";
  onCode?: (code: string) => void;
  onClose: () => void;
}) {
  useDialog(true, onClose);
  const [tab, setTab] = useState<"reader" | "camera" | "labels">(initialTab),
    [code, setCode] = useState(""),
    [result, setResult] = useState(""),
    [enter, setEnter] = useState(false);
  function read(value: string) {
    setCode(value);
    const p = products.find(
      (p) =>
        !p.archived &&
        (p.barcode === value || p.sku.toUpperCase() === value.toUpperCase()),
    );
    setResult(
      p
        ? `${p.name} · ${p.sku}`
        : admin
          ? "Código desconocido. Puedes asociarlo al crear o editar un producto."
          : "Código desconocido. Solicita al administrador que lo asocie.",
    );
    if (p && onCode) onCode(value);
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Escáner y etiquetas"
      >
        <ModalHeading
          title="Escáner y etiquetas"
          eyebrow="HERRAMIENTAS"
          description="Lee códigos, prueba tu lector o imprime etiquetas para tus productos."
          onClose={onClose}
          icon={ScanLine}
        />
        <div className="button-row">
          {(["reader", "camera", "labels"] as const).map((t) => (
            <button
              className={"btn " + (tab === t ? "selected-tab" : "")}
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
            >
              {t === "reader"
                ? "Probar escáner"
                : t === "camera"
                  ? "Cámara del móvil"
                  : "Etiquetas"}
            </button>
          ))}
        </div>
        {tab === "reader" && (
          <>
            <p>
              Conecta un lector USB o Bluetooth en modo teclado. Escanea aquí;
              el lector debe enviar Enter al final.
            </p>
            <label>
              Código recibido
              <input
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setEnter(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setEnter(true);
                    read(code.trim());
                  }
                }}
              />
            </label>
            <p role="status">
              {enter
                ? "Enter recibido. Lectura completa."
                : "Esperando lectura y Enter…"}
            </p>
            <button className="btn" onClick={() => read(code.trim())}>
              Buscar código manualmente
            </button>
          </>
        )}
        {tab === "camera" && (
          <ContinuousCamera
            onRead={async (value) => {
              read(value);
            }}
          />
        )}
        {tab !== "labels" && <p role="status">{result}</p>}
        {tab === "labels" && (
          <Labels products={products.filter((p) => !p.archived)} />
        )}
      </section>
    </div>
  );
}
export function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current)
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        margin: 8,
        height: 42,
        width: 1.4,
      });
  }, [value]);
  return <svg ref={ref} role="img" aria-label={`Código ${value}`} />;
}
export function labelSVG(p: Pick<Product, "name" | "sku">) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  JsBarcode(svg, p.sku, {
    format: "CODE128",
    displayValue: false,
    margin: 10,
    height: 110,
    width: 2,
  });

  const bars = svg.innerHTML,
    width = Number(svg.getAttribute("width"));

  const escape = (v: string) =>
    v
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360"><rect width="600" height="360" fill="white"/><text x="300" y="48" text-anchor="middle" font-family="Arial" font-size="25" fill="#142d25">${escape(p.name.slice(0, 36))}</text><svg x="24" y="75" width="552" height="195" viewBox="0 0 ${width} 130" preserveAspectRatio="xMidYMid meet">${bars}</svg><text x="300" y="315" text-anchor="middle" font-family="Arial" font-size="26" fill="black">${escape(p.sku)}</text></svg>`;
}

export async function downloadLabel(p: Product, format: "svg" | "png") {
  const source = new Blob([labelSVG(p)], {
    type: "image/svg+xml;charset=utf-8",
  });

  let blob = source;

  if (format === "png") {
    const url = URL.createObjectURL(source);

    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 360;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("No se pudo generar la etiqueta.")),
          "image/png",
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = p.sku + "-etiqueta." + format;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function ProductLabels({
  products,
  onClose,
}: {
  products: Product[];
  onClose: () => void;
}) {
  useDialog(true, onClose);

  return (
    <div className="modal-backdrop">
      <section
        className="modal wide-modal label-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Código y etiqueta"
      >
        <ModalHeading
          title={
            products.length === 1 ? products[0].name : "Etiquetas de productos"
          }
          eyebrow="CÓDIGOS Y ETIQUETAS"
          description="Descarga una etiqueta o prepara una hoja para imprimir."
          onClose={onClose}
          icon={ScanLine}
        />
        <Labels products={products} />
      </section>
    </div>
  );
}

export function Labels({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<string[]>(
      products[0] ? [products[0].id] : [],
    ),
    [count, setCount] = useState(1),
    [error, setError] = useState("");

  const chosen = products.filter((p) => selected.includes(p.id));

  async function download(p: Product, format: "svg" | "png") {
    try {
      await downloadLabel(p, format);
      setError("");
    } catch {
      setError("No pudimos generar la imagen. Puedes imprimir la etiqueta.");
    }
  }

  return (
    <div className="labels-content labels-studio">
      <p className="labels-intro">
        La etiqueta interna usa tu SKU. Si el producto ya trae un código
        comercial, puedes escanearlo directamente; no necesitas reemplazarlo.
      </p>

      <div className="labels-workspace">
      <aside className="labels-selection">
      <h3>Elige tus productos</h3><p>Selecciona los que necesitan una etiqueta.</p>
      {products.length > 0 && (
        <fieldset className="label-product-list">
          <legend className="labels-list-legend">Productos para etiquetar</legend>
          {products.map((p) => (
            <label key={p.id} className={selected.includes(p.id) ? "label-product-option is-selected" : "label-product-option"}>
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, p.id]
                      : ids.filter((id) => id !== p.id),
                  )
                }
              />
              <span>
                {p.name}
                <small>{p.sku}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="labels-selection-count">{chosen.length} de {products.length} seleccionados</div>
      </aside><div className="labels-output">
      <div className="labels-output-heading"><h3>Vista previa y descarga</h3><span>Code 128 · SKU interno</span></div>
      {!chosen.length && <p className="labels-empty">Selecciona un producto para ver su etiqueta.</p>}
      {chosen.map((p) => (
        <div className="label-preview-card" key={p.id}>
          <div className="label-preview-surface"><article className="barcode-label"><strong>{p.name}</strong><Barcode value={p.sku}/><span>{p.sku}</span></article></div>
          <div className="label-download-row">
          <div>
            <strong>{p.name}</strong>
            <small>
              SKU: {p.sku}
              {p.barcode
                ? " · Código del producto: " + p.barcode
                : " · Sin código comercial"}
            </small>
          </div>
          <button className="btn" onClick={() => void download(p, "png")}>
            Descargar etiqueta PNG
          </button>
          <button className="btn" onClick={() => void download(p, "svg")}>
            Descargar SVG
          </button>
          </div>
        </div>
      ))}

      </div></div>
      <div className="labels-print-panel">
      <div className="labels-print-heading"><h3>Imprimir y pegar</h3><p>Hoja A4 · etiquetas de 50 × 30 mm</p></div>
      <div className="label-controls">
        <label>
          Etiquetas de cada producto
          <input
            type="number"
            min="1"
            max={Math.max(1, Math.floor(100 / Math.max(1, chosen.length)))}
            value={count}
            onChange={(e) =>
              setCount(
                Math.max(
                  1,
                  Math.min(
                    Math.floor(100 / Math.max(1, chosen.length)),
                    Number(e.target.value) || 1,
                  ),
                ),
              )
            }
          />
        </label>
        <button
          className="btn primary"
          disabled={!chosen.length}
          onClick={() => window.print()}
        >
          Imprimir etiqueta{chosen.length > 1 ? "s" : ""}
        </button>
      </div>

      </div>
      <p className="help labels-print-help">
        Papel A4 · etiquetas de 50 × 30 mm · escala 100 %, sin ajustar a la
        página. Recorta y pega la etiqueta en una superficie plana. Escanea el
        SKU para añadir el producto; imprimir no cambia sus identificadores ni
        existencias.
      </p>
      {error && <p role="alert">{error}</p>}

      <div className="label-sheet">
        {chosen.flatMap((p) =>
          Array.from({ length: count }, (_, i) => (
            <article className="barcode-label" key={p.id + ":" + i}>
              <strong>{p.name}</strong>
              <Barcode value={p.sku} />
              <span>{p.sku}</span>
            </article>
          )),
        )}
      </div>
    </div>
  );
}
