import { getChatGPTUser } from "../../chatgpt-auth";
import { supabaseCall } from "../../lib/supabase-gateway";
export const dynamic = "force-dynamic";
// Staged for the owner-private legacy site. Publish only after v2 migration and backup checks.
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!user)
    return Response.json({ error: "Inicia sesión." }, { status: 401, headers });
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Origen no permitido." },
      { status: 403, headers },
    );
  try {
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("confirm" in body) ||
      body.confirm !== true
    )
      return Response.json(
        { error: "Confirma que quieres generar un código temporal." },
        { status: 400, headers },
      );
    const result = await supabaseCall(user, user.userId, "POST", {
      action: "createTransfer",
    });
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      {
        error:
          "No pudimos preparar el traslado. Revisa la configuración y las existencias antes de continuar.",
      },
      { status: 503, headers },
    );
  }
}
