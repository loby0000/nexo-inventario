"use client";
import { useState } from "react";
export function TransferBusiness() {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>Trasladar mi negocio a Nexo independiente</summary>
      <p>
        Solo el propietario puede generar el código. Caduca en 15 minutos. Al
        usarlo en la nueva versión, este negocio dejará de aceptar operaciones
        aquí. Comparte el código únicamente con tu nueva cuenta.
      </p>
      <p>
        Abre {" "}
        <a href="https://nexo-inventario.loby207.workers.dev" target="_blank" rel="noopener noreferrer">
          Nexo independiente
        </a>{" "}
        e inicia sesión con tu cuenta final antes de usar el código. La cuenta
        del entorno de validación pertenece a una base de pruebas separada.
      </p>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/transfer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirm: true }),
            });
            const v = (await r.json()) as { error?: string; token: string };
            if (!r.ok) throw Error(v.error);
            setToken(v.token);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Generar código de traslado
      </button>
      {token && (
        <label>
          Código temporal
          <input
            readOnly
            value={token}
            autoComplete="off"
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      <p role="alert">{error}</p>
    </details>
  );
}
