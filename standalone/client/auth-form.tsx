import { inventoryDestination } from "./auth-destination";
import { Turnstile } from "./turnstile";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Boxes, ShieldCheck } from "lucide-react";
export function AuthForm({
  auth,
  registration,
  sitekey,
  reader = false,
  recovery,
  onRecovered,
}: {
  auth: SupabaseClient;
  registration: boolean;
  sitekey?: string;
  reader?: boolean;
  recovery: boolean;
  onRecovered: () => void;
}) {
  const route = useLocation(),
    navigate = useNavigate();
  const mode =
    route.pathname === "/crear-cuenta"
      ? "signup"
      : route.pathname === "/recuperar-contrasena"
        ? "reset"
        : route.pathname === "/verificar-correo"
          ? "verify"
          : "login";
  const setMode = (value: string) =>
    navigate({
      pathname:
        value === "signup"
          ? "/crear-cuenta"
          : value === "reset"
            ? "/recuperar-contrasena"
            : value === "verify"
              ? "/verificar-correo"
              : "/acceso",
      search: route.search,
    });
  useEffect(() => {
    if (
      ![
        "/acceso",
        "/crear-cuenta",
        "/recuperar-contrasena",
        "/verificar-correo",
        "/auth/callback",
        "/logout",
      ].includes(route.pathname) &&
      !route.pathname.startsWith("/invitaciones/")
    ) {
      const destination = inventoryDestination(route.pathname + route.search);
      if (destination) sessionStorage.setItem("nexo-after-login", destination);
      navigate("/acceso", { replace: true });
    }
  }, [route.pathname]);
  const [message, setMessage] = useState(
      location.pathname === "/logout"
        ? new URLSearchParams(location.search).has("password_updated")
          ? "Contraseña actualizada. Inicia sesión de nuevo."
          : "Has cerrado sesión."
        : "",
    ),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [email, setEmail] = useState("");
  const [captcha, setCaptcha] = useState(""),
    [attempt, setAttempt] = useState(0),
    [nextSend, setNextSend] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget),
      password = String(f.get("password") ?? "");
    try {
      if (sitekey && !recovery && !captcha)
        throw Error("Completa la verificación de seguridad.");
      if (["verify", "reset", "signup"].includes(mode) && Date.now() < nextSend)
        throw Error("Espera antes de solicitar otro correo.");
      const redirect = location.origin + "/auth/callback";
      if (recovery) {
        const r = await auth.auth.updateUser({ password });
        if (r.error) throw r.error;
        await auth.auth.signOut();
        onRecovered();
        // Reinitialize PKCE after consuming an implicit admin invitation.
        location.replace("/logout?password_updated=1");
      } else if (mode === "login") {
        const r = await auth.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: captcha || undefined },
        });
        if (r.error)
          throw Error(
            "No pudimos iniciar sesión. Revisa el correo, la contraseña y la verificación de tu cuenta.",
          );
      } else if (mode === "signup") {
        if (!registration)
          throw Error("El registro todavía no está habilitado.");
        const r = await auth.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirect,
            captchaToken: captcha || undefined,
          },
        });
        if (r.error)
          throw Error(
            "No pudimos crear la cuenta. Revisa los datos o vuelve a intentarlo más tarde.",
          );
        setNextSend(Date.now() + 60000);
        setMode("verify");
        setMessage(
          "Revisa tu correo y abre el enlace para verificar tu cuenta.",
        );
      } else if (mode === "reset") {
        const r = await auth.auth.resetPasswordForEmail(email, {
          redirectTo: redirect + "?recovery=1",
          captchaToken: captcha || undefined,
        });
        if (r.error)
          throw Error("No pudimos enviar la solicitud. Inténtalo más tarde.");
        setNextSend(Date.now() + 60000);
        setMessage(
          "Si existe una cuenta con ese correo, recibirás las instrucciones para recuperar la contraseña.",
        );
      } else {
        const r = await auth.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo: redirect,
            captchaToken: captcha || undefined,
          },
        });
        if (r.error)
          throw Error(
            "No pudimos reenviar el correo. Espera antes de volver a intentar.",
          );
        setNextSend(Date.now() + 60000);
        setMessage("Solicitud de verificación enviada. Revisa tu correo.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setCaptcha("");
      setAttempt((n) => n + 1);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Nexo Inventario">
        <a className="auth-logo" href="/">
          <Boxes size={28} />
          <span>
            Nexo<span className="logo-dot">.</span>
          </span>
        </a>
        <div className="auth-story-copy">
          <span className="story-kicker">MENOS DESORDEN. MÁS CLARIDAD.</span>
          <h2>
            Tu negocio,
            <br />
            en buenas manos.
          </h2>
          <p>
            Productos, compras y ventas conectados. Un lugar para tener claro
            qué tienes y qué sigue.
          </p>
          <div className="story-inventory" aria-hidden="true">
            <div>
              <span>Todo en su lugar</span>
              <Boxes size={20} />
            </div>
            <i />
            <i />
            <i />
            <span className="story-check">✓ &nbsp; Cada movimiento cuenta</span>
          </div>
        </div>
        <small>
          <ShieldCheck size={15} /> Tu información, solo para tu equipo.
        </small>
      </section>
      <div className="auth-card">
        <a className="brand" href="/">
          {reader ? "Escáner Nexo" : "Nexo"}{" "}
          <small>{reader ? "Lector del PC" : "Inventario"}</small>
        </a>
        <h1>
          {recovery
            ? "Nueva contraseña"
            : mode === "login"
              ? "Bienvenido a tu negocio"
              : mode === "signup"
                ? "Crea tu cuenta"
                : mode === "reset"
                  ? "Recupera tu acceso"
                  : "Verifica tu correo"}
        </h1>
        <p>
          {reader
            ? "Entra con la misma cuenta que utilizas en Nexo en tu PC."
            : "Tu inventario y tu equipo, en un solo lugar."}
        </p>
        <form onSubmit={submit}>
          {!recovery && (
            <label>
              Correo electrónico
              <input
                autoComplete="email"
                type="email"
                required
                maxLength={160}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(recovery || mode === "login" || mode === "signup") && (
            <label>
              Contraseña
              <span className="password-field">
                <input
                  name="password"
                  aria-label="Contraseña"
                  type={showPassword ? "text" : "password"}
                  minLength={recovery || mode === "signup" ? 12 : 1}
                  required
                  autoComplete={
                    !recovery && mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                />
                <button
                  type="button"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </span>
              {(recovery || mode === "signup") && (
                <small>Usa al menos 12 caracteres.</small>
              )}
            </label>
          )}
          {sitekey && !recovery && (
            <Turnstile
              sitekey={sitekey}
              action={
                mode === "signup"
                  ? "signup"
                  : mode === "reset"
                    ? "recovery"
                    : mode === "verify"
                      ? "resend"
                      : "login"
              }
              attempt={attempt}
              onToken={setCaptcha}
            />
          )}
          <button
            className="btn primary"
            disabled={
              busy ||
              !!(sitekey && !recovery && !captcha) ||
              (["verify", "reset", "signup"].includes(mode) && now < nextSend)
            }
          >
            {busy
              ? "Un momento…"
              : recovery
                ? "Guardar contraseña"
                : mode === "login"
                  ? "Iniciar sesión"
                  : mode === "signup"
                    ? "Crear cuenta"
                    : mode === "reset"
                      ? "Enviar instrucciones"
                      : "Reenviar verificación"}
          </button>
        </form>
        <p role="status">{message}</p>
        {now < nextSend && (
          <p className="help">
            Puedes solicitar otro correo en {Math.ceil((nextSend - now) / 1000)}{" "}
            s.
          </p>
        )}
        {!recovery && (
          <div className="auth-links">
            <Link
              className="text-btn"
              to={mode === "login" ? "/crear-cuenta" : "/acceso"}
              hidden={mode === "login" && !registration}
            >
              {mode === "login"
                ? "Crear una cuenta"
                : "Volver a iniciar sesión"}
            </Link>
            <Link className="text-btn" to="/recuperar-contrasena">
              Recuperar acceso / crear mi contraseña
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
