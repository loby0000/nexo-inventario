import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function apiClient(auth: SupabaseClient) {
  return async (path: string, body?: unknown) => {
    const {
      data: { session },
      error,
    } = await auth.auth.getSession();
    if (isAuthRetryableFetchError(error))
      throw new ApiError("No pudimos confirmar la conexión. Tus operaciones pendientes se conservan.", 0);
    if (!session)
      throw new ApiError(
        navigator.onLine ? "Inicia sesión de nuevo." : "Sin conexión.",
        navigator.onLine ? 401 : 0,
      );
    let r: Response;
    try {
      r = await fetch("/api/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + session.access_token,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ApiError(
        "No pudimos confirmar la conexión. Tus operaciones pendientes se conservan.",
        0,
      );
    }
    let data: any;
    try {
      data = await r.json();
    } catch {
      throw new ApiError("El servicio no respondió correctamente. Tus operaciones pendientes se conservan.", r.status >= 500 ? r.status : 503);
    }
    if (!r.ok)
      throw new ApiError(
        data.error ?? "No pudimos completar la solicitud.",
        r.status,
      );
    return data;
  };
}
