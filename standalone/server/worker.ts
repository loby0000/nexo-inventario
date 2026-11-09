import {apiResponse as response, HttpError, boundedJson, enforceLimit, type Limiter} from "./http-security";
import { z } from "zod";
import { validateAction, syncSchema } from "./contracts";
import { invitationMailReady, deliverInvitation, type MailSettings } from "./email";
import {publicKeySchema} from '../shared/scanner-protocol';
import {issueScannerGrant} from './scanner-grant';
export interface Env extends MailSettings {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  APP_ORIGIN: string;
  SCANNER_ORIGIN?: string;
  API_LIMITER?: Limiter;
  INVITATION_LIMITER?: Limiter;
  REGISTRATION_ENABLED: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
  SCANNER_SIGNING_KEY?: string;
  TURNSTILE_SITE_KEY?:string;
}
export async function rpc(
  env: Env,
  user: string,
  company: string | null,
  action: string,
  body: unknown = {},
) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError("La conexión del servidor aún no está configurada.", 503);
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/nexo_v2_gateway", {
    method: "POST",
    headers: {
      apikey: key,
      ...(!key.startsWith("sb_secret_") ? { Authorization: "Bearer " + key } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user: user,
      p_company: company,
      p_action: action,
      p_body: body,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await r.json()) as { message?: string; code?: string };
  if (!r.ok) {
    const message = result.message ?? "";
    if (message.startsWith("NEXO:"))
      throw new HttpError(
        message.slice(5),
        message.includes("Demasiadas")
          ? 429
          : message.includes("acceso") || message.includes("administrador")
            ? 403
            : 409,
      );
    if (result.code === "23505")
      throw new HttpError("Ya existe ese código o esa solicitud.", 409);
    console.error("Nexo RPC", result.code);
    throw new HttpError("No pudimos completar la operación.", 503);
  }
  return result;
}
async function sendInvitation(
  env: Env,
  user: string,
  company: string,
  inviteId: string,
) {
  if (!invitationMailReady(env))
    throw new HttpError(
      "El envío de invitaciones aún no está configurado.",
      503,
    );
  const invite = (await rpc(env, user, company, "invitationDelivery", {
    id: inviteId,
  })) as unknown as { email: string; companyName: string };
  if (!(await deliverInvitation(env, invite.email, invite.companyName, inviteId)))
    throw new HttpError(
      "La invitación está pendiente, pero no pudimos enviar el correo. Usa Reenviar.",
      503,
    );
  await rpc(env, user, company, "invitationSent", { id: inviteId });
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      if (req.method !== "GET" && req.method !== "POST")
        return response({ error: "Método no permitido." }, 405);
      if (req.headers.get("Origin") && req.headers.get("Origin") !== url.origin)
        throw new HttpError("Origen no permitido.", 403);
      const methods: Record<string,string[]> = {
        "/api/config":["GET"], "/api/bootstrap":["GET"], "/api/inventory":["GET","POST"],
        "/api/companies":["POST"], "/api/invitations/accept":["POST"], "/api/transfer":["POST"],
        "/api/scanner/grant":["POST"], "/api/device":["POST"], "/api/sync":["POST"],
        "/api/conflicts":["GET"], "/api/conflicts/resolve":["POST"],
      };
      const allowed=Object.hasOwn(methods,url.pathname)?methods[url.pathname]:undefined;
      if(!allowed)return response({error:"Ruta no encontrada."},404);
      if(!allowed.includes(req.method))return response({error:"Método no permitido."},405,{Allow:allowed.join(", ")});
      if(req.headers.get("Sec-Fetch-Site")==="cross-site")throw new HttpError("Origen no permitido.",403);
      if (url.pathname === "/api/config")
        return response({
          url: env.SUPABASE_URL,
          key: env.SUPABASE_PUBLISHABLE_KEY,
          registration: env.REGISTRATION_ENABLED === "true" && !!env.TURNSTILE_SITE_KEY,
          sitekey:env.TURNSTILE_SITE_KEY,
          issuer:env.APP_ORIGIN,
          scannerOrigin:env.SCANNER_ORIGIN ?? (env.APP_ORIGIN.includes("validacion")?"https://nexo-escaner-validacion.loby207.workers.dev":"https://nexo-escaner.loby207.workers.dev"),
        });
      const token = req.headers.get("Authorization");
      if (!token?.startsWith("Bearer ") || token.length > 16384 || token.length <= 7)
        throw new HttpError("Inicia sesión de nuevo.", 401);
      const auth = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: token },
        signal: AbortSignal.timeout(15000),
      });
      if (!auth.ok)
        throw new HttpError("La sesión venció. Inicia sesión de nuevo.", 401);
      const user = (await auth.json()) as {
        id: string;
        email_confirmed_at?: string;
      };
      if (!user.email_confirmed_at)
        throw new HttpError("Verifica tu correo antes de continuar.", 403);
      const company = url.searchParams.get("company");
      if (company) z.string().uuid().parse(company);
      await enforceLimit(env.API_LIMITER, "user:"+user.id);
      const body = req.method === "POST" ? await boundedJson(req) : {};
      if (url.pathname === "/api/bootstrap")
        return response(await rpc(env, user.id, null, "bootstrap"));
      if (url.pathname === "/api/companies" && req.method === "POST")
        return response(
          await rpc(
            env,
            user.id,
            null,
            "createCompany",
            z
              .object({
                id: z.string().uuid(),
                name: z.string().trim().min(2).max(60),
              })
              .parse(body),
          ),
        );
      if (url.pathname === "/api/invitations/accept" && req.method === "POST")
        return response(
          await rpc(
            env,
            user.id,
            null,
            "acceptInvitation",
            z.object({ id: z.string().uuid() }).parse(body),
          ),
        );
      if (url.pathname === "/api/transfer" && req.method === "POST")
        return response(
          await rpc(
            env,
            user.id,
            null,
            "claimTransfer",
            z.object({ token: z.string().min(32).max(200) }).parse(body),
          ),
        );
      if (!company) throw new HttpError("Selecciona una empresa.", 400);
      if(url.pathname==='/api/scanner/grant'&&req.method==='POST'){
        if(!env.SCANNER_SIGNING_KEY)throw new HttpError('El enlace de escáner aún no está configurado.',503);
        const input=z.object({device:z.string().uuid(),publicKey:publicKeySchema}).parse(body);
        const boot=await rpc(env,user.id,null,'bootstrap') as unknown as {workspaces:{owner:string;role:string}[]};
        const membership=boot.workspaces.find(w=>w.owner===company);
        if(!membership||!['admin','operator'].includes(membership.role))throw new HttpError('No tienes acceso a esta empresa.',403);
        await rpc(env,user.id,company,'device',{id:input.device});
        const now=Date.now();
        const grant=await issueScannerGrant(env.SCANNER_SIGNING_KEY,{v:1,issuer:env.APP_ORIGIN,user:user.id,company,device:input.device,role:membership.role as 'admin'|'operator',publicKey:input.publicKey,issuedAt:now,expiresAt:now+86400000});
        const jwk=JSON.parse(env.SCANNER_SIGNING_KEY) as JsonWebKey;
        return response({grant,verifyKey:{kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y}});
      }
      if (url.pathname === "/api/inventory") {
        if (req.method === "GET")
          return response(await rpc(env, user.id, company, "inventory"));
        const action = validateAction(body);
        if (
          (action.action === "member" ||
            action.action === "resendInvitation") &&
          !invitationMailReady(env)
        )
          throw new HttpError(
            "Configura el envío de correo antes de invitar usuarios.",
            503,
          );
        if(action.action === "member" || action.action === "resendInvitation")
          await enforceLimit(env.INVITATION_LIMITER,"mail:"+user.id);
        const result = (await rpc(
          env,
          user.id,
          company,
          "mutate",
          action,
        )) as unknown as { id?: string };
        if (
          (action.action === "member" ||
            action.action === "resendInvitation") &&
          result.id
        )
          await sendInvitation(env, user.id, company, result.id);
        return response(result);
      }
      if (url.pathname === "/api/device" && req.method === "POST")
        return response(
          await rpc(
            env,
            user.id,
            company,
            "device",
            z.object({ id: z.string().uuid() }).parse(body),
          ),
        );
      if (url.pathname === "/api/sync" && req.method === "POST") {
        const op = syncSchema.parse(body);
        if (op.user !== user.id)
          throw new HttpError("La operación pertenece a otra cuenta.", 403);
        if (op.company !== company)
          throw new HttpError("Empresa incorrecta.", 400);
        op.body = validateAction(op.body);
        if (
          op.body.action !== "document" &&
          !(op.body.action === "product" && !op.body.id)
        )
          throw new HttpError("La operación no admite sincronización.", 400);
        if (
          String(
            op.body.action === "product" ? op.body.createId : op.body.id,
          ) !== op.id
        )
          throw new HttpError("Identificador de operación incorrecto.", 400);
        return response(await rpc(env, user.id, company, "sync", op));
      }
      if (url.pathname === "/api/conflicts")
        return response(await rpc(env, user.id, company, "conflicts"));
      if (url.pathname === "/api/conflicts/resolve" && req.method === "POST")
        return response(
          await rpc(
            env,
            user.id,
            company,
            "resolve",
            z
              .object({
                id: z.string().uuid(),
                decision: z.enum(["retry", "cancel"]),
                reason: z.string().trim().min(3).max(300),
              })
              .parse(body),
          ),
        );
      return response({ error: "Ruta no encontrada." }, 404);
    } catch (e) {
      if (e instanceof HttpError)
        return response({ error: e.message }, e.status, e.status === 429 ? {"Retry-After":"60"} : {});
      if (e instanceof z.ZodError || e instanceof SyntaxError)
        return response({ error: "Revisa los datos enviados." }, 400);
      console.error(
        "Nexo request failed",
        e instanceof Error ? e.name : "unknown",
      );
      return response(
        {
          error:
            "No pudimos confirmar la operación. Conserva los datos y vuelve a intentar.",
        },
        503,
      );
    }
  },
};
