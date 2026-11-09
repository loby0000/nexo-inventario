import { readerCompany } from "./reader-company";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, useLocation } from "react-router";
import {
  createClient,
  isAuthRetryableFetchError,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { ScanLine, LogOut } from "lucide-react";
import { AuthForm } from "./auth-form";
import { PhoneScanner } from "./scanner-link";
import { InstallNexo } from "./install-nexo";
import { apiClient, ApiError } from "./api";
import { configureScanner } from "./scanner-environment";
import { scannerCredential } from "./scanner-credential";
import { snapshots, saveSnapshot, lockUser } from "./offline";
import { ensureOfflineShell } from "./offline-shell";
import { callbackFlow } from "./auth-callback";
import type { Data } from "../ui/inventory";
import "../ui/globals.css";
import "./standalone.css";
import "./redesign.css";
import "./workspace-ui.css";
import "./scanner-app.css";
import "./experience.css";
// Consume temporary capabilities before any network, UI, or authentication callback.
function consumePairingFragment() {
  const params = new URLSearchParams(location.hash.slice(1)),
    fragment = params.get("vincular");
  if (!fragment) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (fragment.length > 1600) return;
  const company = params.get("empresa");
  if (company) sessionStorage.setItem("nexo-pair-company", company);
  sessionStorage.setItem("nexo-pair-fragment", fragment);
  window.dispatchEvent(new Event("nexo-pair-ready"));
}
consumePairingFragment();
window.addEventListener("hashchange", consumePairingFragment);

type Config = {
  url: string;
  key: string;
  registration: boolean;
  sitekey?: string;
  issuer: string;
  scannerOrigin: string;
};
function Reader({ auth, config }: { auth: SupabaseClient; config: Config }) {
  const route=useLocation();
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [offlineIdentity, setOfflineIdentity] = useState(false),
    [companies, setCompanies] = useState<Data["workspaces"]>([]),
    [loadingCompanies, setLoadingCompanies] = useState(true),
    [company, setCompany] = useState(""),
    [error, setError] = useState(""),
    [prepared, setPrepared] = useState(false),
    [preparing, setPreparing] = useState(false),
    [recovery, setRecovery] = useState(
      new URLSearchParams(location.search).has("recovery"),
    );
  const api = useMemo(
    () =>
      offlineIdentity
        ? async () => {
            throw new ApiError(
              "Acceso local preparado. Conecta a internet para renovar.",
              0,
            );
          }
        : apiClient(auth),
    [auth, offlineIdentity],
  );
  useEffect(() => {
    let alive = true;
    async function update(s: Session | null, offline = false) {
      if (!alive) return;
      if (s) {
        setOfflineIdentity(false);
        setSession(s);
        setReady(true);
        localStorage.setItem("nexo-reader-account", s.user.id);
        return;
      }
      if (offline) {
        const uid = localStorage.getItem("nexo-reader-account");
        const prepared = uid
          ? (await snapshots(uid)).find(
              (s) =>
                s.enabled &&
                !s.locked &&
                Date.now() >= s.validatedAt &&
                Date.now() - s.validatedAt < 86400000,
            )
          : undefined;
        if (prepared && alive) {
          setOfflineIdentity(true);
          setSession({
            user: {
              id: uid!,
              email: prepared.data.user.email,
              email_confirmed_at: new Date(prepared.validatedAt).toISOString(),
            },
            access_token: "",
            refresh_token: "",
            token_type: "bearer",
            expires_in: 0,
          } as Session);
          setReady(true);
          return;
        }
      }
      if (alive) {
        setSession(null);
        setReady(true);
      }
    }
    void auth.auth
      .getSession()
      .then(
        ({ data, error }) =>
          void update(
            data.session,
            isAuthRetryableFetchError(error) || !navigator.onLine,
          ),
      );
    const { data } = auth.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (s || event === "SIGNED_OUT") queueMicrotask(() => void update(s));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [auth]);
  const user = session?.user.id ?? "";
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoadingCompanies(true);
    void (async () => {
      try {
        const boot = await api("bootstrap");
        if (!alive) return;
        setCompanies(boot.workspaces);
        const hint = sessionStorage.getItem("nexo-pair-company");
        setCompany(
          readerCompany(
            boot.workspaces,
            hint,
            localStorage.getItem("nexo-reader-company:" + user),
          ),
        );
        if (
          hint &&
          !boot.workspaces.some(
            (w: Data["workspaces"][number]) => w.owner === hint,
          )
        )
          setError("La cuenta no tiene acceso a la empresa de este QR.");
      } catch {
        const cached = (await snapshots(user)).filter(
          (s) =>
            s.enabled &&
            !s.locked &&
            Date.now() >= s.validatedAt &&
            Date.now() - s.validatedAt < 86400000,
        );
        if (!alive) return;
        setCompanies(
          cached.map((s) => ({
            owner: s.company,
            name: s.data.workspace.name,
            role: s.data.user.role,
          })),
        );
        setCompany(
          readerCompany(
            cached.map((s) => ({ owner: s.company })),
            sessionStorage.getItem("nexo-pair-company"),
            localStorage.getItem("nexo-reader-company:" + user),
          ),
        );
        if (!cached.length)
          setError("Conecta a internet para validar tu cuenta y empresa.");
      }
    })().finally(() => {
      if (alive) setLoadingCompanies(false);
    });
    return () => {
      alive = false;
    };
  }, [user, api]);
  useEffect(() => {
    setPrepared(false);
    if (!user || !company) return;
    localStorage.setItem("nexo-reader-company:" + user, company);
    void snapshots(user).then((list) =>
      setPrepared(
        list.some(
          (s) =>
            s.company === company &&
            s.enabled &&
            Date.now() >= s.validatedAt &&
            Date.now() - s.validatedAt < 86400000,
        ),
      ),
    );
  }, [user, company]);
  useEffect(() => {
    const incoming = () => {
      const target = sessionStorage.getItem("nexo-pair-company");
      if (target) {
        if (companies.some((w) => w.owner === target)) {
          setCompany(target);
          setError("");
        } else {
          setCompany("");
          setError(
            "Este QR pertenece a una empresa que no está disponible para esta cuenta o equipo. Conecta a internet y revisa el acceso.",
          );
        }
      }
    };
    window.addEventListener("nexo-pair-ready", incoming);
    return () => window.removeEventListener("nexo-pair-ready", incoming);
  }, [companies]);
  async function prepare() {
    setPreparing(true);
    setError("");
    try {
      await ensureOfflineShell();
      const data = await api("inventory?company=" + company);
      await scannerCredential(user, company, api);
      await saveSnapshot(user, company, data, true);
      await navigator.storage?.persist?.();
      setPrepared(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }
  if (!ready) return <main className="reader-app">Abriendo Escáner Nexo…</main>;
  if (!session || recovery || route.pathname === "/recuperar-contrasena")
    return (
      <AuthForm
        reader
        auth={auth}
        registration={config.registration}
        sitekey={config.sitekey}
        recovery={recovery}
        onRecovered={() => setRecovery(false)}
      />
    );
  if (!session.user.email_confirmed_at)
    return (
      <main className="reader-app">
        <h1>Verifica tu correo</h1>
        <p>Abre el enlace que enviamos para activar tu cuenta.</p>
      </main>
    );
  return (
    <main className="reader-app">
      <header className="reader-heading">
        <span className="reader-brand">
          <ScanLine />
          <strong>Escáner Nexo</strong>
        </span>
        <button
          className="text-btn"
          aria-label="Cerrar sesión"
          onClick={async () => {
            await lockUser(user);
            localStorage.removeItem("nexo-reader-account");
            setOfflineIdentity(false);
            sessionStorage.removeItem("nexo-pair-fragment");
            await auth.auth.signOut({ scope: "local" });
            setCompany("");
            setCompanies([]);
          }}
        >
          <LogOut size={18} />
        </button>
      </header>
      {config.issuer.includes("-validacion.") && (
        <span className="validation-badge">VALIDACIÓN · ENTORNO DE PRUEBA</span>
      )}
      <p>Tu celular lee. Tú confirmas en el PC.</p>
      <label htmlFor="reader-company">Empresa</label>
      <select
        id="reader-company"
        disabled={loadingCompanies}
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      >
        <option value="">
          {loadingCompanies
            ? "Consultando tus empresas…"
            : "Elige la misma empresa del PC"}
        </option>
        {companies.map((w) => (
          <option value={w.owner} key={w.owner}>
            {w.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loadingCompanies && !companies.length && (
        <p>
          Necesitas pertenecer a una empresa. Acepta una invitación o crea tu
          empresa desde Nexo Inventario.
        </p>
      )}
      {company && (
        <>
          <PhoneScanner
            key={user + ":" + company}
            identity={{ user, company, api }}
            onClose={() => setCompany("")}
          />
          <details>
            <summary>Preparar para cortes de internet</summary>
            <p>
              Guardará el catálogo y la autorización de esta empresa en este
              celular, durante un máximo de 24 horas desde la validación. El
              conector no guarda inventario.
            </p>
            <button
              className="btn"
              disabled={preparing}
              onClick={() => void prepare()}
            >
              {preparing
                ? "Preparando…"
                : prepared
                  ? "Renovar acceso sin internet"
                  : "Habilitar lector sin internet"}
            </button>
          </details>
        </>
      )}
      <InstallNexo name="Escáner Nexo" />
    </main>
  );
}
async function start() {
  let config: Config;
  try {
    const r = await fetch("/api/config");
    if (!r.ok) throw Error();
    config = await r.json();
    localStorage.setItem("nexo-reader-config", JSON.stringify(config));
  } catch {
    const cache = localStorage.getItem("nexo-reader-config");
    if (!cache) {
      createRoot(document.getElementById("root")!).render(
        <main className="reader-app">
          <h1>Conecta a internet</h1>
          <p>La primera apertura requiere preparar el lector con conexión.</p>
        </main>,
      );
      return;
    }
    config = JSON.parse(cache);
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
      <Reader auth={auth} config={config} />
    </BrowserRouter>,
  );
  if ("serviceWorker" in navigator && import.meta.env.PROD)
    await navigator.serviceWorker.register("/sw.js");
}
void start();
