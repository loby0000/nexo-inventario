"use client";
import { TransferBusiness } from "./transfer-business";
import { useEffect, useMemo, useState, useRef, FormEvent } from "react";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Boxes,
  Download,
  X,
  AlertTriangle,
  Check,
  LogOut,
  Menu,
  Archive,
  RotateCcw,
  Pencil,
  LoaderCircle,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  Copy,
  Upload,
  ShoppingCart,
  Truck,
} from "lucide-react";
export type Product = {
  barcode: string;
  id: string;
  name: string;
  sku: string;
  category: string;
  supplier: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  minimum: number;
  archived: number;
};
type Movement = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  type: "in" | "out";
  quantity: number;
  note: string;
  actor: string;
  created_at: string;
};
export type Data = {
  workspace: { owner: string; name: string; description: string };
  workspaces: { owner: string; name: string; role: string }[];
  invitations: { id: string; name: string }[];
  documents: {
    id: string;
    type: string;
    reference: string;
    contact: string;
    note: string;
    actor: string;
    total: number;
    created_at: string;
  }[];
  products: Product[];
  movements: Movement[];
  members: { id: string; email: string; role: string; accepted: number }[];
  user: { name: string; email: string; role: string };
};
import {
  WorkspaceMenu,
  WorkspacePanel,
  TransactionPanel,
  ImportPanel,
} from "./automation";
const money = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n / 100);
const number = (n: number) => new Intl.NumberFormat("es-CO").format(n);
const date = (s: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
const status = (p: Product) =>
  p.stock === 0
    ? "Agotado"
    : p.stock <= p.minimum
      ? "Stock bajo"
      : "Disponible";
const links = [
  { name: "Resumen", icon: LayoutDashboard },
  { name: "Productos", icon: Package },
  { name: "Movimientos", icon: ArrowLeftRight },
  { name: "Reportes", icon: ChartNoAxesCombined },
  { name: "Configuración", icon: Settings },
];
export default function Inventory() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [panel, setPanel] = useState<
    "workspace" | "purchase" | "sale" | "import" | null
  >(null);
  const [draft, setDraft] = useState<Product | null>(null);
  const loadSequence = useRef(0),
    movementRequest = useRef(crypto.randomUUID()),
    productRequest = useRef(crypto.randomUUID()),
    mutationInFlight = useRef(false);
  function openPanel(value: typeof panel) {
    setError("");
    setPanel(value);
  }
  function chooseWorkspace(id: string) {
    if (mutationInFlight.current) return;
    if (id === data?.workspace.owner) {
      setMobile(false);
      return;
    }
    loadSequence.current++;
    setData(null);
    setLoading(true);
    setWorkspaceId(id);
    setQuery("");
    setCategory("Todas");
    setFilter("Todos");
    setArchived(false);
    setMobile(false);
  }

  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [auth, setAuth] = useState(false),
    [tab, setTab] = useState("Resumen"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Todas"),
    [filter, setFilter] = useState("Todos"),
    [archived, setArchived] = useState(false),
    [modal, setModal] = useState<"product" | "movement" | null>(null),
    [editing, setEditing] = useState<Product | null>(null),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [movementType, setMovementType] = useState("all"),
    [range, setRange] = useState("30"),
    [page, setPage] = useState(1);
  async function load() {
    const sequence = ++loadSequence.current;
    try {
      const r = await fetch(
        "/api/inventory" +
          (workspaceId ? "?workspace=" + encodeURIComponent(workspaceId) : ""),
      );
      const v = (await r.json()) as Data & { error: string };
      if (sequence !== loadSequence.current) return;
      if (r.status === 401) {
        setAuth(true);
        return;
      }
      if (!r.ok) throw Error(v.error);
      setAuth(false);
      setData(v);
      setError("");
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [workspaceId]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    setPage(1);
  }, [query, category, filter, archived, tab, movementType, range]);
  useEffect(() => {
    if (!modal && !panel) return;
    const prior = document.activeElement as HTMLElement;
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    dialog?.querySelector<HTMLElement>("input,select,button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setModal(null);
        setPanel(null);
      }
      if (e.key === "Tab" && dialog) {
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [modal, panel, busy]);
  async function mutate(body: Record<string, unknown>, message: string) {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setBusy(true);
    try {
      const r = await fetch(
        "/api/inventory" +
          (workspaceId ? "?workspace=" + encodeURIComponent(workspaceId) : ""),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const v = (await r.json()) as { error: string };
      if (!r.ok) throw Error(v.error);
      await load();
      setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  const products = data?.products ?? [],
    active = products.filter((p) => !p.archived),
    movements = data?.movements ?? [],
    alerts = active.filter((p) => p.stock <= p.minimum),
    admin = data?.user.role === "admin";
  const shown = useMemo(
    () =>
      products.filter(
        (p) =>
          Boolean(p.archived) === archived &&
          (!query ||
            [p.name, p.sku, p.supplier, p.barcode].some((s) =>
              s.toLowerCase().includes(query.toLowerCase()),
            )) &&
          (category === "Todas" || p.category === category) &&
          (filter === "Todos" ||
            (filter === "Por reponer"
              ? p.stock <= p.minimum
              : status(p) === filter)),
      ),
    [products, archived, query, category, filter],
  );
  const cutoff = Date.now() - Number(range) * 86400000;
  const filteredMovements = movements.filter(
    (m) =>
      (movementType === "all" || m.type === movementType) &&
      new Date(m.created_at).getTime() >= cutoff &&
      [m.product_name, m.sku, m.note].some((s) =>
        s.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const value = active.reduce((s, p) => s + p.stock * p.cost, 0),
    units = active.reduce((s, p) => s + p.stock, 0);
  function go(name: string) {
    setTab(name);
    setQuery("");
    setMobile(false);
  }
  function openProduct(p: Product | null = null) {
    productRequest.current = crypto.randomUUID();
    setEditing(p);
    setDraft(null);
    setError("");
    setModal("product");
  }
  function openMovement(id = "") {
    setSelected(id);
    movementRequest.current = crypto.randomUUID();
    setError("");
    setModal("movement");
  }
  function csv(rows: unknown[][], filename: string) {
    const text =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(
              (v) =>
                '"' +
                String(v ?? "")
                  .replace(/^[\s\u0000-\u001f]*[=+@-]/, "'$&")
                  .replace(/"/g, '""') +
                '"',
            )
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Reporte exportado correctamente.");
  }
  function exportProducts() {
    csv(
      [
        [
          "Código",
          "Producto",
          "Categoría",
          "Proveedor",
          "Unidad",
          "Existencias",
          "Mínimo",
          "Costo COP",
          "Precio COP",
          "Estado",
        ],
        ...(tab === "Reportes" ? active : shown).map((p) => [
          p.sku,
          p.name,
          p.category,
          p.supplier,
          p.unit,
          p.stock,
          p.minimum,
          p.cost / 100,
          p.price / 100,
          p.archived ? "Archivado" : status(p),
        ]),
      ],
      "nexo-productos.csv",
    );
  }
  async function saveProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      action: "product",
      ...(editing ? { id: editing.id } : { createId: productRequest.current }),
      name: f.get("name"),
      sku: f.get("sku"),
      barcode: f.get("barcode"),
      category: f.get("category"),
      supplier: f.get("supplier"),
      unit: f.get("unit"),
      cost: Math.round(Number(f.get("cost")) * 100),
      price: Math.round(Number(f.get("price")) * 100),
      minimum: Number(f.get("minimum")),
    };
    if (
      await mutate(
        body,
        editing
          ? "Producto actualizado."
          : "Producto creado. Registra una entrada para añadir existencias.",
      )
    )
      setModal(null);
  }
  async function saveMovement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await mutate(
        {
          action: "movement",
          id: movementRequest.current,
          productId: f.get("productId"),
          type: f.get("type"),
          quantity: Number(f.get("quantity")),
          note: f.get("note"),
        },
        "Movimiento registrado. Existencias actualizadas.",
      )
    )
      setModal(null);
  }
  const formProduct = editing ?? draft;
  const ProductTable = () => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Existencias</th>
            <th>Costo unitario</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.slice((page - 1) * 10, page * 10).map((p) => (
            <tr key={p.id}>
              <td>
                <div className="product-cell">
                  <span className={"product-icon c" + (p.category.length % 5)}>
                    <Package size={20} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.sku} <span>· {p.unit}</span>
                    </small>
                  </div>
                </div>
              </td>
              <td>{p.category}</td>
              <td>
                <strong className={p.stock <= p.minimum ? "warning-text" : ""}>
                  {number(p.stock)}
                </strong>
                <small>Mín. {p.minimum}</small>
              </td>
              <td>{money(p.cost)}</td>
              <td>
                <span
                  className={
                    "badge " +
                    (p.archived
                      ? "neutral"
                      : p.stock === 0
                        ? "red"
                        : p.stock <= p.minimum
                          ? "amber"
                          : "green")
                  }
                >
                  <i />
                  {p.archived ? "Archivado" : status(p)}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  {!p.archived && (
                    <button
                      title="Registrar movimiento"
                      aria-label={"Registrar movimiento de " + p.name}
                      onClick={() => openMovement(p.id)}
                    >
                      <ArrowLeftRight size={16} />
                    </button>
                  )}
                  {admin && (
                    <>
                      <button
                        title="Duplicar producto"
                        aria-label={"Duplicar " + p.name}
                        disabled={!!p.archived}
                        onClick={() => {
                          productRequest.current = crypto.randomUUID();
                          setEditing(null);
                          setDraft({
                            ...p,
                            id: "",
                            name: p.name.slice(0, 90) + " (copia)",
                            sku: "",
                            barcode: "",
                          });
                          setError("");
                          setModal("product");
                        }}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        title="Editar producto"
                        aria-label={"Editar " + p.name}
                        disabled={!!p.archived}
                        onClick={() => openProduct(p)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        title={
                          p.archived
                            ? "Restaurar"
                            : "Archivar (requiere existencias en cero)"
                        }
                        aria-label={
                          (p.archived ? "Restaurar " : "Archivar ") + p.name
                        }
                        disabled={busy || (!p.archived && p.stock > 0)}
                        onClick={() =>
                          mutate(
                            {
                              action: "archive",
                              id: p.id,
                              archived: !p.archived,
                            },
                            p.archived
                              ? "Producto restaurado."
                              : "Producto archivado.",
                          )
                        }
                      >
                        {p.archived ? (
                          <RotateCcw size={16} />
                        ) : (
                          <Archive size={16} />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && (
        <div className="empty">
          <Search />
          <h3>No encontramos productos</h3>
          <p>Prueba otra búsqueda o añade tu primer producto.</p>
        </div>
      )}
    </div>
  );
  const MovementList = ({ items }: { items: Movement[] }) => (
    <div className="movement-list">
      {items.map((m) => (
        <div className="movement-row" key={m.id}>
          <span className={"movement-icon " + m.type}>
            {m.type === "in" ? (
              <ArrowDownLeft size={19} />
            ) : (
              <ArrowUpRight size={19} />
            )}
          </span>
          <div className="movement-desc">
            <strong>{m.product_name}</strong>
            <small>{m.note}</small>
            {tab === "Movimientos" && <small>{m.actor}</small>}
          </div>
          <div className="movement-end">
            <strong className={m.type === "in" ? "positive" : ""}>
              {m.type === "in" ? "+" : "−"}
              {m.quantity} <span>ud.</span>
            </strong>
            <small>{date(m.created_at)}</small>
          </div>
        </div>
      ))}
      {!items.length && (
        <div className="empty compact">
          <ArrowLeftRight />
          <p>Aún no hay movimientos en este período.</p>
        </div>
      )}
    </div>
  );
  if (auth)
    return (
      <main className="login">
        <div className="brand">
          <span>
            <Boxes />
          </span>
          Nexo<span className="brand-light">/ inventario</span>
        </div>
        <h1>
          Tu inventario,
          <br />
          bajo control.
        </h1>
        <p>
          Un lugar para gestionar tus productos, conocer tus existencias y tomar
          mejores decisiones.
        </p>
        <a
          className="btn primary"
          href="/signin-with-chatgpt?return_to=%2F"
          target="_top"
        >
          Iniciar sesión <ArrowRight size={18} />
        </a>
        <small>
          <ShieldCheck size={16} /> Acceso seguro · Datos privados
        </small>
      </main>
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" href="/" aria-label="Nexo Inventario">
          <span>
            <Boxes size={23} />
          </span>
          Nexo<b>®</b>
        </a>
        <WorkspaceMenu
          data={data}
          onChoose={chooseWorkspace}
          onConfigure={() => openPanel("workspace")}
        />
        <p className="nav-label">GESTIÓN</p>
        <nav>
          {links.map((l) => (
            <button
              key={l.name}
              className={tab === l.name ? "active" : ""}
              onClick={() => go(l.name)}
            >
              <l.icon size={19} />
              {l.name}
              {l.name === "Productos" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          Todo en su lugar.
          <p>
            Cada movimiento cuenta.
            <br />
            Tu negocio, siempre al día.
          </p>
          <div className="note-art">
            <Boxes size={40} strokeWidth={1} />
          </div>
        </div>
        <div className="user">
          <span className="avatar">
            {data?.user.name.slice(0, 2).toUpperCase() ?? "CL"}
          </span>
          <div>
            <strong>{data?.user.name.split("@")[0] ?? "Cargando…"}</strong>
            <small>{admin ? "Administrador" : "Operador"}</small>
          </div>
          <a
            href="/signout-with-chatgpt?return_to=%2F"
            target="_top"
            aria-label="Cerrar sesión"
          >
            <LogOut size={17} />
          </a>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-backdrop" onClick={() => setMobile(false)} />
      )}
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span>{data?.workspace.name ?? "Mi negocio"}</span>
            <ChevronRight size={14} />
            <strong>{tab}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Intl.DateTimeFormat("es-CO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </span>
            <span className="private-label">
              <ShieldCheck size={14} /> Espacio privado
            </span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">TU NEGOCIO, EN ORDEN</div>
              <h1>{tab === "Resumen" ? "Una mirada a tu inventario" : tab}</h1>
              <p>
                {tab === "Resumen"
                  ? "Todo lo que necesitas saber para empezar el día."
                  : tab === "Productos"
                    ? "Organiza tu catálogo y mantén cada producto bajo control."
                    : tab === "Movimientos"
                      ? "Cada entrada y salida, con su historia."
                      : tab === "Reportes"
                        ? "Convierte tus existencias en decisiones."
                        : "Gestiona las personas que trabajan contigo."}
              </p>
            </div>
            <div className="heading-actions">
              {tab !== "Configuración" && (
                <button
                  className="btn"
                  onClick={() => openMovement()}
                  disabled={!active.length}
                >
                  <ArrowLeftRight size={17} />
                  Registrar movimiento
                </button>
              )}
              {admin && tab !== "Configuración" && (
                <button className="btn primary" onClick={() => openProduct()}>
                  <Plus size={18} />
                  Nuevo producto
                </button>
              )}
            </div>
          </div>
          {data && tab !== "Configuración" && (
            <div className="automation-toolbar">
              <div>
                <span className="eyebrow">AGILIZA TU NEGOCIO</span>
                <strong>Menos pasos. Más control.</strong>
              </div>
              <div>
                <button
                  className="btn"
                  disabled={!active.length || busy}
                  onClick={() => openPanel("sale")}
                >
                  <ShoppingCart size={17} />
                  Registrar venta
                </button>
                {admin && (
                  <>
                    <button
                      className="btn"
                      disabled={!active.length || busy}
                      onClick={() => openPanel("purchase")}
                    >
                      <Truck size={17} />
                      Recibir compra
                    </button>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => openPanel("import")}
                    >
                      <Upload size={17} />
                      Importar productos
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {error && !modal && !panel && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  load();
                }}
              >
                Reintentar
              </button>
            </div>
          )}
          {data &&
            data.invitations.map((inv) => (
              <div className="welcome" key={inv.id}>
                <div>
                  <h3>Invitación a {inv.name}</h3>
                  <p>
                    Podrás registrar movimientos sin perder tu negocio propio.
                  </p>
                </div>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      { action: "acceptInvitation", id: inv.id },
                      "Invitación aceptada. Selecciona el negocio desde el menú lateral.",
                    )
                  }
                >
                  Aceptar invitación
                </button>
              </div>
            ))}
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Cargando tu inventario…
            </div>
          ) : (
            data && (
              <>
                {active.length === 0 && !archived && tab === "Resumen" && (
                  <div className="welcome">
                    <div>
                      <h3>Un buen inventario empieza aquí.</h3>
                      <p>
                        Crea tu primer producto o explora Nexo con datos de
                        ejemplo.
                      </p>
                    </div>
                    {admin && (
                      <button
                        className="btn"
                        disabled={busy || products.length > 0}
                        onClick={() =>
                          mutate(
                            { action: "demo" },
                            "Datos de ejemplo cargados. Ya puedes explorar el inventario.",
                          )
                        }
                      >
                        Cargar ejemplos <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}
                {(tab === "Resumen" || tab === "Reportes") && (
                  <div className="stats">
                    <article>
                      <span>
                        Valor del inventario{" "}
                        <span className="stat-symbol">$</span>
                      </span>
                      <h2>{money(value)}</h2>
                      <small>A costo de adquisición</small>
                    </article>
                    <article>
                      <span>
                        Productos activos <Package size={18} />
                      </span>
                      <h2>
                        {number(active.length)}
                        <em>
                          {" "}
                          {active.length === 1 ? "referencia" : "referencias"}
                        </em>
                      </h2>
                      <small>
                        {number(units)} {units === 1 ? "unidad" : "unidades"} en
                        total
                      </small>
                    </article>
                    <article>
                      <span>
                        Por reponer <AlertTriangle size={18} />
                      </span>
                      <h2>
                        {alerts.length}
                        <em>
                          {" "}
                          {alerts.length === 1 ? "producto" : "productos"}
                        </em>
                      </h2>
                      <small className={alerts.length ? "warning-text" : ""}>
                        {alerts.filter((p) => !p.stock).length}{" "}
                        {alerts.filter((p) => !p.stock).length === 1
                          ? "agotado"
                          : "agotados"}{" "}
                        · {alerts.filter((p) => p.stock > 0).length} con stock
                        bajo
                      </small>
                    </article>
                    <article>
                      <span>
                        Movimientos del mes <ArrowLeftRight size={18} />
                      </span>
                      <h2>
                        {
                          movements.filter(
                            (m) =>
                              m.created_at.slice(0, 7) ===
                              new Date().toISOString().slice(0, 7),
                          ).length
                        }
                      </h2>
                      <small>Entradas y salidas registradas</small>
                    </article>
                  </div>
                )}
                {tab === "Resumen" && (
                  <>
                    <div className="dashboard-grid">
                      <section className="card chart-card">
                        <div className="card-heading">
                          <div>
                            <h3>Actividad de inventario</h3>
                            <p>Unidades que entran y salen de tu negocio</p>
                          </div>
                          <span className="period">Últimos 7 días</span>
                        </div>
                        <ActivityChart movements={movements} />
                      </section>
                      <section className="card alert-card">
                        <div className="card-heading">
                          <h3>Necesitan tu atención</h3>
                          <span className="count amber">{alerts.length}</span>
                        </div>
                        {alerts.slice(0, 3).map((p) => (
                          <button
                            className="alert-product"
                            key={p.id}
                            onClick={() => openMovement(p.id)}
                          >
                            <span
                              className={
                                "product-icon " + (!p.stock ? "c4" : "c3")
                              }
                            >
                              <Package size={18} />
                            </span>
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {p.stock === 0
                                  ? "Sin existencias"
                                  : `${p.stock} ${p.stock === 1 ? "disponible" : "disponibles"} · mínimo ${p.minimum}`}
                              </small>
                            </div>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                        {!alerts.length && (
                          <div className="empty compact">
                            <Check />
                            <p>Tus existencias están al día.</p>
                          </div>
                        )}
                        <button
                          className="text-btn alert-footer"
                          onClick={() => {
                            go("Productos");
                            setFilter("Por reponer");
                            setArchived(false);
                          }}
                        >
                          Revisar productos <ArrowRight size={15} />
                        </button>
                      </section>
                    </div>
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <h3>Tu catálogo</h3>
                          <p>Productos y existencias de un vistazo</p>
                        </div>
                        <button
                          className="text-btn"
                          onClick={() => go("Productos")}
                        >
                          Ver todos <ArrowRight size={15} />
                        </button>
                      </div>
                      <ProductTable />
                    </section>
                    <div className="bottom-grid">
                      <section className="card">
                        <div className="card-heading">
                          <h3>Últimos movimientos</h3>
                          <button
                            className="text-btn"
                            onClick={() => go("Movimientos")}
                          >
                            Ver historial <ArrowRight size={15} />
                          </button>
                        </div>
                        <MovementList items={movements.slice(0, 4)} />
                      </section>
                      <section className="insight">
                        <span className="eyebrow">UNA BUENA PRÁCTICA</span>
                        <h2>
                          Menos sorpresas.
                          <br />
                          Más control.
                        </h2>
                        <p>
                          Define un mínimo para cada producto y anticipa tu
                          próxima compra antes de quedarte sin existencias.
                        </p>
                        <button
                          className="text-btn"
                          onClick={() => go("Productos")}
                        >
                          Organizar mi catálogo <ArrowRight size={16} />
                        </button>
                        <Boxes size={110} strokeWidth={0.7} />
                      </section>
                    </div>
                  </>
                )}
                {tab === "Productos" && (
                  <section className="card">
                    <div className="toolbar">
                      <div className="search">
                        <Search size={18} />
                        <input
                          aria-label="Buscar productos"
                          placeholder="Buscar por nombre, código o proveedor…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Filtrar categoría"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="Todas">Todas las categorías</option>
                        {Array.from(new Set(products.map((p) => p.category)))
                          .sort()
                          .map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                      </select>
                      <select
                        aria-label="Filtrar estado"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        {[
                          "Todos",
                          "Disponible",
                          "Por reponer",
                          "Stock bajo",
                          "Agotado",
                        ].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                      <button
                        className="btn icon"
                        aria-label="Exportar productos"
                        onClick={exportProducts}
                      >
                        <Download size={18} />
                      </button>
                    </div>
                    <div className="table-tabs">
                      <button
                        className={!archived ? "selected" : ""}
                        onClick={() => setArchived(false)}
                      >
                        Activos <span>{active.length}</span>
                      </button>
                      <button
                        className={archived ? "selected" : ""}
                        onClick={() => setArchived(true)}
                      >
                        Archivados{" "}
                        <span>{products.length - active.length}</span>
                      </button>
                    </div>
                    <ProductTable />
                    <div className="pagination">
                      <span>
                        {shown.length}{" "}
                        {shown.length === 1 ? "producto" : "productos"} · página{" "}
                        {page} de {Math.max(1, Math.ceil(shown.length / 10))}
                      </span>
                      <div>
                        <button
                          className="btn"
                          disabled={page === 1}
                          onClick={() => setPage(page - 1)}
                        >
                          Anterior
                        </button>
                        <button
                          className="btn"
                          disabled={page * 10 >= shown.length}
                          onClick={() => setPage(page + 1)}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                {tab === "Movimientos" && data.documents.length > 0 && (
                  <section className="card documents-card">
                    <div className="card-heading">
                      <div>
                        <h3>Compras y ventas</h3>
                        <p>Operaciones confirmadas · últimas 500</p>
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Referencia</th>
                            <th>Tipo</th>
                            <th>Cliente / Proveedor</th>
                            <th>Total</th>
                            <th>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.documents.map((d) => (
                            <tr key={d.id}>
                              <td>
                                <strong>{d.reference}</strong>
                                <small>{d.actor}</small>
                              </td>
                              <td>
                                <span
                                  className={
                                    "badge " +
                                    (d.type === "purchase" ? "green" : "amber")
                                  }
                                >
                                  {d.type === "purchase"
                                    ? "Compra recibida"
                                    : "Venta"}
                                </span>
                              </td>
                              <td>{d.contact || "—"}</td>
                              <td>{money(d.total)}</td>
                              <td>{date(d.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {tab === "Movimientos" && (
                  <section className="card">
                    <div className="toolbar">
                      <div className="search">
                        <Search size={18} />
                        <input
                          aria-label="Buscar movimientos"
                          placeholder="Buscar producto, código o motivo…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Tipo de movimiento"
                        value={movementType}
                        onChange={(e) => setMovementType(e.target.value)}
                      >
                        <option value="all">Todos los movimientos</option>
                        <option value="in">Entradas</option>
                        <option value="out">Salidas</option>
                      </select>
                      <select
                        aria-label="Período"
                        value={range}
                        onChange={(e) => setRange(e.target.value)}
                      >
                        <option value="7">Últimos 7 días</option>
                        <option value="30">Últimos 30 días</option>
                        <option value="36500">Todo el historial</option>
                      </select>
                      <button
                        className="btn icon"
                        aria-label="Exportar movimientos"
                        onClick={() =>
                          csv(
                            [
                              [
                                "Fecha",
                                "Código",
                                "Producto",
                                "Tipo",
                                "Cantidad",
                                "Motivo",
                                "Usuario",
                              ],
                              ...filteredMovements.map((m) => [
                                m.created_at,
                                m.sku,
                                m.product_name,
                                m.type === "in" ? "Entrada" : "Salida",
                                m.quantity,
                                m.note,
                                m.actor,
                              ]),
                            ],
                            "nexo-movimientos.csv",
                          )
                        }
                      >
                        <Download size={18} />
                      </button>
                    </div>
                    <MovementList
                      items={filteredMovements.slice(
                        (page - 1) * 15,
                        page * 15,
                      )}
                    />
                    <div className="pagination">
                      <span>
                        {filteredMovements.length} movimientos (hasta los
                        últimos 2000)
                      </span>
                      <div>
                        <button
                          className="btn"
                          disabled={page === 1}
                          onClick={() => setPage(page - 1)}
                        >
                          Anterior
                        </button>
                        <button
                          className="btn"
                          disabled={page * 15 >= filteredMovements.length}
                          onClick={() => setPage(page + 1)}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                {tab === "Reportes" && (
                  <div className="report-grid">
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <h3>Distribución del inventario</h3>
                          <p>Valor a costo por categoría</p>
                        </div>
                      </div>
                      <div className="category-chart">
                        {Array.from(new Set(active.map((p) => p.category)))
                          .sort()
                          .map((c, i) => {
                            const v = active
                              .filter((p) => p.category === c)
                              .reduce((s, p) => s + p.stock * p.cost, 0);
                            return (
                              <div key={c}>
                                <div>
                                  <strong>{c}</strong>
                                  <span>{money(v)}</span>
                                </div>
                                <div className="track">
                                  <i
                                    style={{
                                      width:
                                        (value ? (v / value) * 100 : 0) + "%",
                                      background: [
                                        "#427866",
                                        "#c59c53",
                                        "#8697ad",
                                        "#9c8fa7",
                                        "#bc806a",
                                      ][i % 5],
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        {!active.length && (
                          <p>No hay productos para analizar.</p>
                        )}
                      </div>
                    </section>
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <h3>Reportes para tu negocio</h3>
                          <p>Archivos CSV compatibles con Excel</p>
                        </div>
                      </div>
                      <div className="report-actions">
                        <h4>Inventario actual</h4>
                        <p>Catálogo completo, existencias, costos y precios.</p>
                        <button className="btn" onClick={exportProducts}>
                          <Download size={16} />
                          Exportar inventario
                        </button>
                        <hr />
                        <h4>Lista de reposición</h4>
                        <p>
                          Productos por debajo del mínimo y cantidades
                          sugeridas.
                        </p>
                        <button
                          className="btn"
                          onClick={() =>
                            csv(
                              [
                                [
                                  "Código",
                                  "Producto",
                                  "Proveedor",
                                  "Actual",
                                  "Mínimo",
                                  "Cantidad para superar el mínimo",
                                ],
                                ...alerts.map((p) => [
                                  p.sku,
                                  p.name,
                                  p.supplier,
                                  p.stock,
                                  p.minimum,
                                  p.minimum - p.stock + 1,
                                ]),
                              ],
                              "nexo-reposicion.csv",
                            )
                          }
                        >
                          <Download size={16} />
                          Exportar reposición
                        </button>
                        <small>
                          Los valores reflejan el estado actual. El historial
                          muestra los últimos 2000 movimientos.
                        </small>
                      </div>
                    </section>
                  </div>
                )}
                {tab === "Configuración" && (
                  <section className="card settings-card">
                    <div className="card-heading">
                      <div>
                        <h3>Equipo y permisos</h3>
                        <p>
                          El administrador gestiona el catálogo. Los operadores
                          registran movimientos.
                        </p>
                      </div>
                      <ShieldCheck size={22} />
                    </div>
                    <div className="settings-body">
                      {admin && (
                        <div className="workspace-settings">
                          {admin && <TransferBusiness />}
                          <div>
                            <strong>{data.workspace.name}</strong>
                            <p>
                              {data.workspace.description ||
                                "Personaliza la información de tu negocio."}
                            </p>
                          </div>
                          <button
                            className="btn"
                            onClick={() => openPanel("workspace")}
                          >
                            Editar negocio
                          </button>
                        </div>
                      )}
                      <div className="member-row">
                        <div>
                          <strong>{data.user.email}</strong>
                          <small>Tu cuenta</small>
                        </div>
                        <span className="badge green">
                          {admin ? "Administrador" : "Operador"}
                        </span>
                      </div>
                      {admin && (
                        <>
                          {data.members.map((m) => (
                            <div className="member-row" key={m.id}>
                              <div>
                                <strong>{m.email}</strong>
                                <small>
                                  {m.accepted
                                    ? "Operador · acceso aceptado"
                                    : "Invitación pendiente"}
                                </small>
                              </div>
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() =>
                                  mutate(
                                    { action: "removeMember", id: m.id },
                                    "Acceso del operador revocado.",
                                  )
                                }
                              >
                                Revocar acceso
                              </button>
                            </div>
                          ))}
                          <form
                            className="member-form"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              const email = new FormData(form).get("email");
                              if (
                                await mutate(
                                  { action: "member", email },
                                  "Invitación creada. La persona deberá aceptarla al entrar en Nexo.",
                                )
                              )
                                form.reset();
                            }}
                          >
                            <label>
                              Correo del operador
                              <input
                                name="email"
                                type="email"
                                required
                                placeholder="persona@negocio.com"
                              />
                            </label>
                            <button className="btn primary" disabled={busy}>
                              Añadir operador
                            </button>
                          </form>
                          <p className="help">
                            El operador deberá poder acceder al sitio e iniciar
                            sesión con este correo. El sitio es privado:
                            añadirlo aquí no cambia los permisos de acceso del
                            alojamiento ni envía invitaciones.
                          </p>
                        </>
                      )}
                      <hr />
                      <h4>Acerca de este espacio</h4>
                      <p className="help">
                        Moneda: peso colombiano (COP). Las existencias se
                        gestionan en unidades enteras. Los productos con
                        historial se archivan para conservar la trazabilidad.
                        Los movimientos registrados no se eliminan: corrige un
                        error con un movimiento compensatorio y explica el
                        motivo.
                      </p>
                    </div>
                  </section>
                )}
              </>
            )
          )}
          <footer className="footer">
            <span>Nexo Inventario</span>
            <span>Hecho para que tu negocio avance.</span>
          </footer>
        </main>
      </div>
      {data && panel === "workspace" && (
        <WorkspacePanel
          data={data}
          onSave={mutate}
          onClose={() => setPanel(null)}
          busy={busy}
          error={error}
        />
      )}
      {data && (panel === "purchase" || panel === "sale") && (
        <TransactionPanel
          type={panel}
          products={active}
          onSave={mutate}
          onClose={() => setPanel(null)}
          busy={busy}
          error={error}
        />
      )}
      {data && panel === "import" && (
        <ImportPanel
          products={products}
          onSave={mutate}
          onClose={() => setPanel(null)}
          busy={busy}
          error={error}
        />
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {modal === "product" ? "CATÁLOGO" : "INVENTARIO"}
                </span>
                <h2 id="modal-title">
                  {modal === "product"
                    ? editing
                      ? "Editar producto"
                      : "Nuevo producto"
                    : "Registrar movimiento"}
                </h2>
              </div>
              <button
                className="close"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                <X size={21} />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal === "product" ? (
              <form onSubmit={saveProduct}>
                <div className="form-grid">
                  <label className="full">
                    Nombre del producto
                    <input
                      name="name"
                      defaultValue={formProduct?.name}
                      minLength={2}
                      maxLength={100}
                      required
                      placeholder="Ej. Cuaderno A5 · puntos"
                    />
                  </label>
                  <label>
                    Código SKU
                    <input
                      name="sku"
                      defaultValue={formProduct?.sku}
                      maxLength={40}
                      pattern="[A-Za-z0-9._-]*"
                      placeholder="Automático si lo dejas vacío"
                    />
                  </label>
                  <label>
                    Categoría
                    <input
                      name="category"
                      defaultValue={formProduct?.category}
                      maxLength={50}
                      list="categories"
                      required
                      placeholder="Papelería"
                    />
                    <datalist id="categories">
                      {Array.from(new Set(products.map((p) => p.category))).map(
                        (c) => (
                          <option key={c}>{c}</option>
                        ),
                      )}
                    </datalist>
                  </label>
                  <label className="full">
                    Código de barras (opcional)
                    <input
                      name="barcode"
                      defaultValue={formProduct?.barcode}
                      maxLength={64}
                      pattern="[A-Za-z0-9._-]*"
                      placeholder="Escanea o escribe el código del producto"
                    />
                  </label>
                  <label className="full">
                    Proveedor <span>(opcional)</span>
                    <input
                      name="supplier"
                      defaultValue={formProduct?.supplier}
                      maxLength={100}
                      placeholder="Nombre del proveedor"
                    />
                  </label>
                  <label>
                    Costo de compra (COP)
                    <input
                      name="cost"
                      type="number"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      defaultValue={
                        formProduct ? formProduct.cost / 100 : undefined
                      }
                      required
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Precio de venta (COP)
                    <input
                      name="price"
                      type="number"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      defaultValue={
                        formProduct ? formProduct.price / 100 : undefined
                      }
                      required
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Unidad de medida
                    <select
                      name="unit"
                      defaultValue={formProduct?.unit ?? "unidad"}
                    >
                      {["unidad", "caja", "kg", "litro", "paquete"].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Existencia mínima
                    <input
                      name="minimum"
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                      defaultValue={formProduct?.minimum ?? 5}
                      required
                    />
                  </label>
                </div>
                <p className="form-note">
                  <ShieldCheck size={17} />
                  Las existencias se actualizan al registrar entradas y salidas.
                </p>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Cancelar
                  </button>
                  <button className="btn primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Check size={17} />
                    )}
                    Guardar producto
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveMovement}>
                <div className="form-grid">
                  <label className="full">
                    Producto
                    <select
                      name="productId"
                      required
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="" disabled>
                        Selecciona un producto
                      </option>
                      {active.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name} · {p.stock}{" "}
                          {p.stock === 1 ? "disponible" : "disponibles"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tipo
                    <select name="type" required>
                      <option value="in">Entrada de inventario</option>
                      <option value="out">Salida de inventario</option>
                    </select>
                  </label>
                  <label>
                    Cantidad
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      required
                      placeholder="0"
                    />
                  </label>
                  <label className="full">
                    Motivo del movimiento
                    <textarea
                      name="note"
                      required
                      minLength={3}
                      maxLength={300}
                      rows={3}
                      placeholder="Ej. Compra al proveedor, venta o corrección de conteo"
                    />
                  </label>
                </div>
                <p className="form-note">
                  <ShieldCheck size={17} />
                  El movimiento quedará registrado con tu usuario y fecha.
                </p>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Cancelar
                  </button>
                  <button className="btn primary" disabled={busy || !selected}>
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Check size={17} />
                    )}
                    Registrar movimiento
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
        </div>
      )}
    </div>
  );
}
function ActivityChart({ movements }: { movements: Movement[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = d.toISOString().slice(0, 10);
    const ms = movements.filter((m) => m.created_at.slice(0, 10) === key);
    return {
      label: new Intl.DateTimeFormat("es-CO", { weekday: "short" })
        .format(d)
        .replace(".", ""),
      in: ms.filter((m) => m.type === "in").reduce((s, m) => s + m.quantity, 0),
      out: ms
        .filter((m) => m.type === "out")
        .reduce((s, m) => s + m.quantity, 0),
    };
  });
  const max = Math.max(5, ...days.flatMap((d) => [d.in, d.out]));
  return (
    <div className="activity">
      <div className="chart-legend">
        <span>
          <i />
          Entradas
        </span>
        <span>
          <i />
          Salidas
        </span>
      </div>
      <div className="bar-chart">
        <div className="y-labels">
          {[max, Math.round(max / 2), 0].map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
        <div className="bars">
          {days.map((d, i) => (
            <div className="bar-group" key={i}>
              <div className="bar-pair">
                <div
                  className="bar in"
                  title={`${d.label}: ${d.in} entradas`}
                  style={{ height: Math.max((d.in / max) * 100, 1) + "%" }}
                />
                <div
                  className="bar out"
                  title={`${d.label}: ${d.out} salidas`}
                  style={{ height: Math.max((d.out / max) * 100, 1) + "%" }}
                />
              </div>
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
