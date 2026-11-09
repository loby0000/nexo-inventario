import { useEffect, useRef, useState } from "react";
type API = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
let loading: Promise<API> | undefined;
function load() {
  return (loading ??= new Promise<API>((resolve, reject) => {
    const api = () => (window as unknown as { turnstile?: API }).turnstile;
    if (api()) {
      resolve(api()!);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (api() ? resolve(api()!) : reject(Error()));
    script.onerror = () => {
      loading = undefined;
      reject(Error());
    };
    document.head.appendChild(script);
  }));
}
export function Turnstile({
  sitekey,
  action,
  attempt,
  onToken,
}: {
  sitekey: string;
  action: string;
  attempt: number;
  onToken: (token: string) => void;
}) {
  const target = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true,
      id: string | undefined,
      api: API | undefined;
    onToken("");
    setError("");
    void load()
      .then((value) => {
        api = value;
        if (!alive || !target.current) return;
        id = api.render(target.current, {
          sitekey,
          action,
          theme: "light",
          callback: (token: string) => {
            if (alive) {
              onToken(token);
              setError("");
            }
          },
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setError(
              "No se pudo verificar. Comprueba tu conexión y vuelve a intentar.",
            );
          },
        });
      })
      .catch(() => {
        if (alive)
          setError(
            "No pudimos cargar la verificación de seguridad. Revisa tu conexión.",
          );
      });
    return () => {
      alive = false;
      if (id) api?.remove(id);
    };
  }, [sitekey, action, attempt, onToken, retry]);
  return (
    <div>
      <div ref={target} />
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            className="btn"
            type="button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Volver a verificar
          </button>
        </>
      )}
    </div>
  );
}
