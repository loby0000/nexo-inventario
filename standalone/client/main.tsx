import { inventoryDestination } from "./auth-destination";
import { AuthForm } from "./auth-form";
import { configureScanner } from "./scanner-environment";
import { BrowserRouter, Link, useLocation, useNavigate } from "react-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import Inventory from "../ui/inventory";
import type { Data } from "../ui/inventory";
import { apiClient, ApiError } from "./api";
import {
  db,
  pending,
  saveSnapshot,
  snapshots,
  stage,
  localView,
  synchronize,
  lockUser,
  blockCompany,
  project,
  type Operation,
} from "./offline";
import { Scanner } from "./scanner";
import { ScannerSessionProvider } from "./scanner-session";
import { ensureOfflineShell } from "./offline-shell";
import { callbackFlow } from "./auth-callback";
import "../ui/globals.css";
import "./standalone.css";
import "./redesign.css";
import "./workspace-ui.css";
import "./scanner-app.css";
import "./experience.css";
import { scannerCredential } from "./scanner-credential";
import { preferredCompany, rememberCompany } from "./workspace-preference";
import { CompanySwitcher } from "./company-switcher";
import { useDialog } from "../ui/use-dialog";
import { ModalHeading } from "../ui/modal-heading";
import {
  Boxes,
  Building2,
  ChevronDown,
  ArrowUpRight,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Plus,
} from "lucide-react";
type Config = {
  url: string;
  key: string;
  registration: boolean;
  sitekey?: string;
  issuer?: string;
  scannerOrigin?: string;
};
type Bootstrap = {
  workspaces: Data["workspaces"];
  invitations: Data["invitations"];
  user: { id: string; email: string };
};
function App({ auth, config }: { auth: SupabaseClient; config: Config }) {
  const route = useLocation(),
    navigate = useNavigate();
  const inviteId =
    /^\/invitaciones\/([a-f0-9-]{36})$/i.exec(route.pathname)?.[1] ?? "";
  useEffect(() => {
    if (inviteId) sessionStorage.setItem("nexo-invite-destination", inviteId);
  }, [inviteId]);
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [recovery, setRecovery] = useState(
      new URLSearchParams(location.search).has("recovery"),
    ),
    [boot, setBoot] = useState<Bootstrap | null>(null),
    [company, setCompany] = useState(""),
    [status, setStatus] = useState("Consultando inventario…"),
    [lastAt, setLastAt] = useState<number | null>(null),
    [error, setError] = useState(""),
    [ops, setOps] = useState<Operation[]>([]),
    [scan, setScan] = useState(false),
    [refresh, setRefresh] = useState(0),
    [exit, setExit] = useState(false),
    [conflicts, setConflicts] = useState<Record<string, unknown>[]>([]),
    [showConflicts, setShowConflicts] = useState(false),
    [enabled, setEnabled] = useState(false),
    [enablePrompt, setEnablePrompt] = useState(false),
    [creating, setCreating] = useState(false),
    [choosing, setChoosing] = useState(false);
  const dataRef = useRef<Data | null>(null),
    onlineRef = useRef(true),
    userRef = useRef(""),
    companyRef = useRef(""),
    syncing = useRef(false),
    createCompanyId = useRef(crypto.randomUUID());
  useDialog(enablePrompt, () => setEnablePrompt(false));
  useDialog(exit, () => setExit(false));
  useDialog(showConflicts, () => setShowConflicts(false));
  const user = session?.user.id ?? "";
  userRef.current = user;
  companyRef.current = company;
  const api = useMemo(() => apiClient(auth), [auth]);
  useEffect(() => {
    const dismiss = (event: Event) => {
      const menu = document.querySelector<HTMLDetailsElement>(
        ".workspace-actions[open]",
      );
      if (!menu) return;
      if (
        (event instanceof KeyboardEvent && event.key === "Escape") ||
        (event.type === "pointerdown" &&
          event.target instanceof Node &&
          !menu.contains(event.target))
      )
        menu.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    async function accept(s: Session | null, temporaryAuthOutage = false) {
      if (!alive) return;
      if (s) {
        try {
          localStorage.setItem(
            "nexo-last-account",
            JSON.stringify({
              id: s.user.id,
              email: s.user.email,
              email_confirmed_at: s.user.email_confirmed_at,
            }),
          );
        } catch {
          /* Online access remains possible when local storage is full. */
        }
        setSession(s);
        setReady(true);
        return;
      }
      if (!navigator.onLine || temporaryAuthOutage) {
        const marker = localStorage.getItem("nexo-last-account");
        if (marker)
          try {
            const account = JSON.parse(marker);
            const cached = await snapshots(account.id);
            if (
              cached.some(
                (v) => v.enabled && Date.now() - v.validatedAt < 86400000,
              )
            ) {
              setSession({
                user: account,
                access_token: "",
                refresh_token: "",
                token_type: "bearer",
                expires_in: 0,
              } as Session);
              setReady(true);
              return;
            }
          } catch {
            /* An unreadable cache never grants offline access. */
          }
      }
      setSession(null);
      setReady(true);
    }
    const subscription = auth.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (s || event === "INITIAL_SESSION" || event === "SIGNED_OUT")
        queueMicrotask(() => void accept(s));
    });
    // detectSessionInUrl handles the PKCE code once during SDK initialization.
    auth.auth.getSession().then(({ data, error }) => {
      if (error)
        setError(
          isAuthRetryableFetchError(error)
            ? "No pudimos confirmar la conexión. Conserva tus pendientes y vuelve a intentar."
            : "El enlace o la sesión no pudo validarse. Solicita un enlace nuevo o inicia sesión.",
        );
      if (data.session && location.pathname === "/auth/callback")
        navigate(
          sessionStorage.getItem("nexo-invite-destination")
            ? "/invitaciones/" +
                sessionStorage.getItem("nexo-invite-destination")
            : (inventoryDestination(
                sessionStorage.getItem("nexo-after-login"),
              ) ?? "/app/resumen"),
          { replace: true },
        );
      void accept(data.session, isAuthRetryableFetchError(error));
    });
    return () => {
      alive = false;
      subscription.data.subscription.unsubscribe();
    };
  }, [auth]);
  async function loadBoot() {
    const uid = userRef.current;
    try {
      const b = (await api("bootstrap")) as Bootstrap;
      if (userRef.current !== b.user.id) return;
      setBoot(b);
      if (!companyRef.current) {
        const requested = new URLSearchParams(location.search).get("empresa");
        setCompany(
          requested
            ? b.workspaces.some((w) => w.owner === requested)
              ? requested
              : ""
            : preferredCompany(uid, b.workspaces),
        );
      }
      setError("");
    } catch (e) {
      if ([0, 503].includes((e as ApiError).status)) {
        const cached = await snapshots(uid);
        if (userRef.current !== uid) return;
        const ws = cached.map((s) => ({
          owner: s.company,
          name: s.data.workspace.name,
          role: s.data.user.role,
        }));
        setBoot({
          workspaces: ws,
          invitations: [],
          user: { id: user, email: session?.user.email ?? "" },
        });
        if (!companyRef.current) setCompany(preferredCompany(uid, ws));
        setStatus("Sin conexión");
      } else setError((e as Error).message);
    }
  }
  useEffect(() => {
    setBoot(null);
    setCompany("");
    setChoosing(false);
    setCreating(false);
    dataRef.current = null;
    setEnabled(false);
    if (user) void loadBoot();
  }, [user]);
  useEffect(() => {
    setEnabled(false);
    dataRef.current = null;
    setLastAt(null);
    setOps([]);
    if (user && company) void pending(user, company).then(setOps);
    if (user && company)
      void db()
        .then((d) => d.get("snapshots", `${user}:${company}`))
        .then((s) => {
          if (userRef.current === user && companyRef.current === company) {
            setEnabled(!!s?.enabled && !s.locked);
            if (s) setLastAt(s.validatedAt);
          }
        });
  }, [user, company]);
  useEffect(() => {
    if (user && company && boot?.user.id === user)
      rememberCompany(user, company, boot.workspaces);
  }, [user, company, boot]);
  useEffect(() => {
    if (!boot || !user) return;
    const requested = new URLSearchParams(route.search).get("empresa");
    if (requested && !boot.workspaces.some((w) => w.owner === requested)) {
      setError(
        "No tienes acceso a la empresa de esta dirección. Elige una de tus empresas.",
      );
      navigate("/app/empresas", { replace: true });
      return;
    }
    if (
      requested &&
      requested !== company &&
      boot.workspaces.some((w) => w.owner === requested)
    )
      setCompany(requested);
    setChoosing(route.pathname === "/app/empresas");
    if (company && !requested && route.pathname.startsWith("/app/"))
      navigate(
        { pathname: route.pathname, search: "?empresa=" + company },
        { replace: true },
      );
    if (
      [
        "/",
        "/acceso",
        "/crear-cuenta",
        "/verificar-correo",
        "/invitations",
        "/invitaciones",
      ].includes(route.pathname)
    ) {
      const destination = sessionStorage.getItem("nexo-invite-destination");
      const afterLogin = inventoryDestination(
        sessionStorage.getItem("nexo-after-login"),
      );
      sessionStorage.removeItem("nexo-after-login");
      navigate(
        destination
          ? "/invitaciones/" + destination
          : (afterLogin ?? {
              pathname: route.pathname.includes("invita")
                ? "/app/empresas"
                : "/app/resumen",
              search: company ? "?empresa=" + company : "",
            }),
        { replace: true },
      );
    }
  }, [route.pathname, route.search, boot, user, company]);
  function chooseCompany(id: string) {
    setCompany(id);
    setChoosing(false);
    navigate("/app/resumen?empresa=" + id);
  }
  function showCompanies() {
    setChoosing(true);
    navigate("/app/empresas" + (company ? "?empresa=" + company : ""));
  }
  const updateOps = useCallback(async () => {
    if (userRef.current)
      setOps(await pending(userRef.current, companyRef.current));
  }, []);
  const sync = useCallback(async () => {
    if (syncing.current || !userRef.current || !navigator.onLine) return;
    syncing.current = true;
    setStatus("Sincronizando…");
    const uid = userRef.current;
    try {
      await synchronize(uid, async (op) => {
        if (uid !== userRef.current) throw Error("La cuenta cambió.");
        try {
          return await api("sync?company=" + op.company, {
            id: op.id,
            user: op.user,
            company: op.company,
            body: op.body,
            dependencies: op.dependencies,
            createdAt: op.createdAt,
          });
        } catch (e) {
          const err = e as ApiError;
          if (err.status === 403) {
            await blockCompany(uid, op.company, err.message);
            return { state: "blocked" as const, error: err.message };
          }
          throw e;
        }
      });
      if (userRef.current === uid) {
        await updateOps();
        setRefresh((n) => n + 1);
      }
    } finally {
      syncing.current = false;
    }
  }, [api, updateOps]);
  useEffect(() => {
    const reconnect = () => {
      void loadBoot();
      void sync();
    };
    const disconnected = () => {
      onlineRef.current = false;
      setStatus("Sin conexión");
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnected);
    const interval = setInterval(() => {
      if (userRef.current && navigator.onLine && !document.hidden) void sync();
    }, 30000);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnected);
      clearInterval(interval);
    };
  }, [user, sync]);
  const request = useCallback(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const uid = userRef.current,
        cid = companyRef.current;
      if (!uid || !cid)
        return Response.json(
          { error: "Selecciona una empresa." },
          { status: 400 },
        );
      const current = () =>
        userRef.current === uid && companyRef.current === cid;
      const requested = new URL(
        String(input),
        location.origin,
      ).searchParams.get("workspace");
      if (requested && requested !== cid) {
        setCompany(requested);
        return Response.json(
          { error: "Cambiando de empresa…" },
          { status: 409 },
        );
      }
      try {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          let queued = false,
            result;
          const s = await (await db()).get("snapshots", `${uid}:${cid}`);
          const eligible =
            body.action === "document" ||
            (body.action === "product" && !body.id);
          if (s?.enabled && eligible) {
            await stage(uid, cid, body);
            await updateOps();
            await sync();
            const state = await (
              await db()
            ).get(
              "operations",
              body.action === "product" ? body.createId : body.id,
            );
            queued = state?.state !== "synced";
            result = { ok: true, queued };
          } else {
            if (!onlineRef.current)
              throw new ApiError(
                "Habilita este equipo con conexión para registrar operaciones offline.",
                0,
              );
            result = await api("inventory?company=" + cid, body);
          }
          return Response.json(result);
        }
        try {
          if (!navigator.onLine) throw new ApiError("Sin conexión.", 0);
          const data = (await api("inventory?company=" + cid)) as Data;
          if (!current())
            return Response.json(
              { error: "La empresa cambió." },
              { status: 409 },
            );
          onlineRef.current = true;
          const canonical = await saveSnapshot(uid, cid, data);
          dataRef.current = canonical;
          setLastAt(Date.now());
          setStatus("Actualizado");
          await updateOps();
          return Response.json(project(canonical, await pending(uid, cid)));
        } catch (e) {
          const err = e as ApiError;
          if (err.status !== 0 && err.status !== 503) {
            onlineRef.current = true;
            if (err.status === 403 || err.status === 401) {
              await blockCompany(uid, cid, err.message);
              if (current()) {
                setEnabled(false);
                dataRef.current = null;
                setCompany("");
                void loadBoot();
              }
            }
            throw e;
          }
          onlineRef.current = false;
          if (current()) setStatus("Sin conexión");
          const data = await localView(uid, cid);
          if (current()) dataRef.current = data;
          return Response.json(data);
        }
      } catch (e) {
        const err = e as ApiError;
        if (current()) setError(err.message);
        return Response.json(
          { error: err.message },
          { status: err.status && err.status >= 400 ? err.status : 503 },
        );
      }
    }) as typeof fetch,
    [api, sync, updateOps],
  );
  async function enable() {
    try {
      await ensureOfflineShell();
      const data = (await api("inventory?company=" + company)) as Data;
      let id = localStorage.getItem("nexo-device");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("nexo-device", id);
      }
      await api("device?company=" + company, { id });
      await scannerCredential(user, company, api);
      await saveSnapshot(user, company, data, true);
      await navigator.storage?.persist?.();
      setEnabled(true);
      setEnablePrompt(false);
      setError("");
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function logout() {
    await lockUser(user);
    localStorage.removeItem("nexo-last-account");
    sessionStorage.removeItem("nexo-after-login");
    navigate("/logout", { replace: true });
    setExit(false);
    await auth.auth.signOut({ scope: "local" });
    setBoot(null);
    setCompany("");
    setOps([]);
    dataRef.current = null;
    navigate("/logout", { replace: true });
  }
  async function acceptInvitation(id: string) {
    const uid = userRef.current;
    const result = await api("invitations/accept", { id });
    if (userRef.current !== uid) return;
    await loadBoot();
    if (userRef.current !== uid) return;
    setCompany(result.id);
    sessionStorage.removeItem("nexo-invite-destination");
    navigate("/app/resumen?empresa=" + result.id);
    setCreating(false);
    setChoosing(false);
    setError("");
  }
  async function createCompany(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name"));
    try {
      const c = await api("companies", { id: createCompanyId.current, name });
      createCompanyId.current = crypto.randomUUID();
      await loadBoot();
      setCompany(c.id);
      setCreating(false);
      setChoosing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function showReview() {
    try {
      setConflicts(await api("conflicts?company=" + company));
      setShowConflicts(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!ready) return <main className="auth-page">Preparando Nexo…</main>;
  if (!session || recovery || route.pathname === "/recuperar-contrasena")
    return (
      <>
        {inviteId && (
          <div className="invitation-banner">
            <strong>Te han invitado a una empresa en Nexo</strong>
            <p>
              Usa el correo que recibió la invitación. Primero crea tu
              contraseña y verifica tu correo, o entra con tu cuenta.
            </p>
            <Link to="/crear-cuenta">Crear mi cuenta</Link> ·{" "}
            <Link to="/acceso">Ya tengo cuenta</Link>
          </div>
        )}
        <AuthForm
          auth={auth}
          registration={config.registration}
          sitekey={config.sitekey}
          recovery={recovery}
          onRecovered={() => setRecovery(false)}
        />
        {error && <p role="alert">{error}</p>}
      </>
    );
  if (!session.user.email_confirmed_at)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Verifica tu correo</h1>
          <p>Abre el enlace de verificación antes de entrar a una empresa.</p>
          <button className="btn" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  if (!boot && !error)
    return (
      <main className="workspace-loading" role="status">
        <span>
          <Boxes size={27} />
        </span>
        <strong>Abriendo tu espacio</strong>
        <p>Un momento, estamos preparando tu inventario.</p>
      </main>
    );
  if (inviteId && boot) {
    const invitation = boot.invitations.find((i) => i.id === inviteId);
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>
            {invitation
              ? "Invitación a " + invitation.name
              : "Revisa esta invitación"}
          </h1>
          <p>Sesión iniciada como {session.user.email}</p>
          {invitation ? (
            <>
              <p>Al aceptar tendrás acceso a esta empresa como empleado.</p>
              <button
                className="btn primary"
                onClick={() =>
                  void acceptInvitation(inviteId).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                Aceptar invitación
              </button>
            </>
          ) : (
            <p>
              No hay una invitación vigente para esta cuenta. Puede haber
              caducado, estar cancelada o haberse enviado a otro correo. Pide
              que te la reenvíen o entra con el correo invitado.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button className="btn" onClick={showCompanies}>
            Mis empresas e invitaciones
          </button>
          <button className="text-btn" onClick={() => void logout()}>
            Cambiar de cuenta
          </button>
        </section>
      </main>
    );
  }
  return (
    <ScannerSessionProvider
      key={`${user}:${company}`}
      identity={{ user, company, api }}
      companyName={boot?.workspaces.find((w) => w.owner === company)?.name}
    >
      <div
        className={
          company && !creating && !choosing
            ? "standalone-shell inventory-visible"
            : "standalone-shell"
        }
      >
        <div className="connection-bar">
          {config.issuer?.includes("-validacion.") && (
            <span className="validation-badge">VALIDACIÓN</span>
          )}
          <div className="connection-state" role="status">
            <span
              className={
                "connection-dot " +
                (status === "Actualizado" && !ops.length ? "is-current" : "")
              }
            />
            <strong>
              {ops.some((o) => o.state === "conflict")
                ? "Requiere revisión"
                : ops.some((o) => o.state === "blocked")
                  ? "Acceso bloqueado"
                  : status === "Actualizado" && ops.length
                    ? "Pendientes"
                    : status}
            </strong>
            <span className="connection-meta">
              {ops.length
                ? ops.length + " pendientes · Existencias estimadas"
                : "Sin operaciones pendientes"}
            </span>
          </div>
          <div className="connection-actions">
            {lastAt && (
              <span className="last-sync">
                Última consulta{" "}
                {new Date(lastAt).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <button
              className="sync-button"
              onClick={() => void sync()}
              aria-label="Sincronizar"
            >
              <RefreshCw size={15} />
              <span>Sincronizar</span>
            </button>
            <details className="workspace-actions">
              <summary>
                <Settings2 size={17} />
                <span>Mi espacio</span>
                <ChevronDown size={13} />
              </summary>
              <div
                className="workspace-actions-menu"
                onClick={(e) => {
                  if ((e.target as Element).closest("button"))
                    e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                <span className="menu-caption">ESPACIO DE TRABAJO</span>
                <button
                  onClick={() => {
                    showCompanies();
                    setCreating(false);
                  }}
                >
                  Empresas e invitaciones
                </button>
                <button
                  onClick={() => {
                    setChoosing(false);
                    setCreating(true);
                  }}
                >
                  Nueva empresa
                </button>
                {company && !enabled && (
                  <button onClick={() => setEnablePrompt(true)}>
                    Habilitar este equipo para trabajar sin internet
                  </button>
                )}
                {enabled && (
                  <p>Equipo autorizado · máximo 24 h sin validar acceso</p>
                )}
                {company && dataRef.current?.user.role === "admin" && (
                  <button onClick={showReview}>Revisar conflictos</button>
                )}
                <button onClick={() => setExit(true)}>Cerrar sesión</button>
              </div>
            </details>
          </div>
        </div>
        {error && (
          <div className="standalone-alert" role="alert">
            {error}
            <button className="text-btn" onClick={() => setError("")}>
              Cerrar aviso
            </button>
          </div>
        )}
        {!company || creating || choosing ? (
          <main className="onboarding">
            <div className="onboarding-heading">
              <span className="eyebrow">TU ESPACIO DE TRABAJO</span>
              <h1>
                {creating ? "Un nuevo comienzo." : "¿Dónde trabajamos hoy?"}
              </h1>
            </div>
            <p>
              Cada empresa mantiene su catálogo, equipo y operaciones separados.
            </p>
            {!creating &&
              boot?.workspaces.map((w) => (
                <button
                  className="btn company-card"
                  key={w.owner}
                  onClick={() => {
                    chooseCompany(w.owner);
                    setCreating(false);
                    setChoosing(false);
                  }}
                >
                  <span className="company-symbol">
                    <Building2 size={24} />
                  </span>
                  <span className="company-description">
                    <strong>{w.name}</strong>
                    <small>
                      {w.role === "admin" ? "Administrador" : "Empleado"} ·
                      Abrir inventario
                    </small>
                  </span>
                  <ArrowUpRight size={19} />
                </button>
              ))}
            {boot?.invitations.map((inv) => (
              <div className="company-card" key={inv.id}>
                <strong>Invitación: {inv.name}</strong>
                <button
                  className="btn primary"
                  onClick={async () => {
                    try {
                      await acceptInvitation(inv.id);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Aceptar invitación
                </button>
              </div>
            ))}
            {creating || !boot?.workspaces.length ? (
              <form onSubmit={createCompany}>
                <label>
                  Nombre de la empresa
                  <input
                    name="name"
                    placeholder="Ej. Mi tienda"
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </label>
                <button className="btn primary">Crear empresa</button>
                {creating && !!boot?.workspaces.length && (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setCreating(false)}
                  >
                    Volver a mis empresas
                  </button>
                )}
              </form>
            ) : (
              <button
                className="btn new-company-card"
                onClick={() => setCreating(true)}
              >
                <Plus size={18} />
                Crear otra empresa
              </button>
            )}
            <details>
              <summary>Trasladar mi negocio anterior</summary>
              <p>
                Usa el código temporal generado desde tu sesión de propietario
                en la versión anterior.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const r = await api("transfer", {
                      token: new FormData(e.currentTarget).get("token"),
                    });
                    await loadBoot();
                    setCompany(r.id);
                    setCreating(false);
                    setChoosing(false);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  Código de traslado
                  <input
                    name="token"
                    required
                    minLength={32}
                    autoComplete="off"
                  />
                </label>
                <button className="btn">Trasladar negocio</button>
              </form>
            </details>
          </main>
        ) : (
          <>
            <Inventory
              route={{
                path: route.pathname,
                search: route.search,
                navigate: (url) => navigate(url),
              }}
              key={`${user}:${company}`}
              request={request}
              reloadKey={refresh}
              scannerIdentity={{ user, company, api }}
              onPrepareScanner={() => setEnablePrompt(true)}
              workspaceControl={
                <CompanySwitcher
                  companies={boot?.workspaces ?? []}
                  value={company}
                  onChange={(id) => {
                    chooseCompany(id);
                    setError("");
                  }}
                  onManage={showCompanies}
                />
              }
              viewKey={user + ":" + company}
              onLogout={() => setExit(true)}
              onScan={() => setScan(true)}
              onAcceptInvitation={acceptInvitation}
              onChooseCompany={showCompanies}
            />
          </>
        )}
        {ops.length > 0 && (
          <details className="pending-list">
            <summary>
              {ops.length} operaciones pendientes de este equipo
            </summary>
            <p>
              Las existencias estimadas no incluyen operaciones de otros
              dispositivos.
            </p>
            {ops.map((op) => (
              <p key={op.id}>
                {op.body.action === "product"
                  ? "Producto"
                  : op.body.type === "sale"
                    ? "Venta"
                    : "Compra"}{" "}
                ·{" "}
                {op.state === "conflict"
                  ? "Requiere revisión"
                  : op.state === "blocked"
                    ? "Acceso bloqueado"
                    : "Pendiente de sincronizar"}{" "}
                · {op.error}
              </p>
            ))}
          </details>
        )}
        {scan && dataRef.current && (
          <Scanner
            products={dataRef.current.products}
            admin={dataRef.current.user.role === "admin"}
            onClose={() => setScan(false)}
          />
        )}
        {enablePrompt && (
          <div className="modal-backdrop">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Preparar equipo sin internet"
            >
              <ModalHeading
                title="Trabajar sin internet"
                eyebrow="ESTE EQUIPO"
                description="Prepara el dispositivo antes de perder la conexión."
                onClose={() => setEnablePrompt(false)}
              />
              <p>
                Se guardará una copia del catálogo y las operaciones pendientes
                de esta empresa en este perfil del navegador. Habilítalo solo en
                un equipo del negocio que puedas bloquear.
              </p>
              <p>
                Podrás registrar operaciones durante 24 horas sin validar el
                acceso. No borres los datos del navegador mientras haya
                pendientes. Una venta todavía puede requerir revisión al
                reconectar.
              </p>
              <div className="modal-footer">
                <button className="btn" onClick={() => setEnablePrompt(false)}>
                  Cancelar
                </button>
                <button className="btn primary" onClick={enable}>
                  Habilitar y guardar copia local
                </button>
              </div>
            </section>
          </div>
        )}
        {exit && (
          <div className="modal-backdrop">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Cerrar sesión"
            >
              <ModalHeading
                title={
                  ops.length ? "Hay operaciones pendientes" : "¿Cerrar sesión?"
                }
                eyebrow="TU CUENTA"
                onClose={() => setExit(false)}
              />
              <p>
                {ops.length
                  ? "Puedes sincronizar antes de salir o bloquear la aplicación conservando los pendientes. Solo esta cuenta podrá recuperarlos al volver a iniciar sesión."
                  : "Se bloquearán los datos locales de esta cuenta en este navegador."}
              </p>
              <div className="modal-footer">
                <button className="btn" onClick={() => setExit(false)}>
                  Cancelar
                </button>
                {ops.length > 0 && (
                  <button className="btn" onClick={logout}>
                    Bloquear y cerrar sesión
                  </button>
                )}
                <button
                  className="btn primary"
                  onClick={ops.length ? () => void sync() : logout}
                >
                  {ops.length ? "Sincronizar primero" : "Cerrar sesión"}
                </button>
              </div>
            </section>
          </div>
        )}
        {showConflicts && (
          <div className="modal-backdrop">
            <section
              className="modal wide-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Revisión de conflictos"
            >
              <ModalHeading
                title="Requiere revisión"
                eyebrow="SINCRONIZACIÓN"
                description="Revisa las operaciones que necesitan una decisión."
                onClose={() => setShowConflicts(false)}
              />
              <p>
                Registra una entrada real si faltan existencias y luego
                reintenta la venta. No aumentamos el stock automáticamente.
              </p>
              {!conflicts.length && (
                <p>No hay conflictos recibidos por el servidor.</p>
              )}
              {conflicts.map((c) => (
                <form
                  key={String(c.id)}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      const r = await api(
                        "conflicts/resolve?company=" + company,
                        {
                          id: c.id,
                          decision: f.get("decision"),
                          reason: f.get("reason"),
                        },
                      );
                      if (r.state === "conflict") setError(r.error);
                      await showReview();
                      await sync();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <p>
                    {String(c.error)} · {String(c.client_created_at)}
                  </p>
                  <label>
                    Decisión
                    <select name="decision">
                      <option value="retry">
                        Reintentar operación original
                      </option>
                      <option value="cancel">Anular pendiente</option>
                    </select>
                  </label>
                  <label>
                    Motivo
                    <input
                      name="reason"
                      required
                      minLength={3}
                      maxLength={300}
                    />
                  </label>
                  <button className="btn">Aplicar decisión</button>
                </form>
              ))}
              <div className="modal-footer">
                <button className="btn" onClick={() => setShowConflicts(false)}>
                  Cerrar
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </ScannerSessionProvider>
  );
}
async function start() {
  let config: Config;
  try {
    const r = await fetch("/api/config");
    if (!r.ok) throw Error();
    config = await r.json();
    if (!config.url || !config.key) throw Error();
    try {
      localStorage.setItem("nexo-public-config", JSON.stringify(config));
    } catch {
      /* Optional public configuration cache. */
    }
  } catch {
    const cached = localStorage.getItem("nexo-public-config");
    if (!cached) {
      createRoot(document.getElementById("root")!).render(
        <main className="auth-page">
          <div className="auth-card">
            <h1>Nexo está preparado para configurar</h1>
            <p>
              Falta conectar el alojamiento y configurar el acceso de Supabase.
              El inventario publicado anterior sigue disponible.
            </p>
            <p>
              No es posible iniciar sesión todavía en esta versión
              independiente.
            </p>
          </div>
        </main>,
      );
      return;
    }
    config = JSON.parse(cached);
  }
  configureScanner(config);
  const auth = createClient(config.url, config.key, {
    auth: {
      flowType: callbackFlow(new URL(location.href)),
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <App auth={auth} config={config} />
    </BrowserRouter>,
  );
  if ("serviceWorker" in navigator && import.meta.env.PROD)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
}
void start();
