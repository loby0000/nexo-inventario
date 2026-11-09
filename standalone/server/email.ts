export interface MailSettings {
  MAIL_PROVIDER?: string;
  MAIL_FROM: string;
  APP_ORIGIN: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
}
export function invitationMailReady(env: MailSettings) {
  if (!env.MAIL_FROM || !env.APP_ORIGIN) return false;
  const provider = env.MAIL_PROVIDER || "resend";
  return provider === "brevo" ? !!env.BREVO_API_KEY
    : provider === "resend" ? !!env.RESEND_API_KEY : false;
}
export async function deliverInvitation(env: MailSettings, email: string, companyName: string, inviteId: string) {
  if (!invitationMailReady(env)) return false;
  const subject = "Invitación a una empresa en Nexo";
  const text = `Te han invitado a ${companyName}. Abre ${env.APP_ORIGIN}/invitaciones/${inviteId}. Si eres nuevo, elige «Crear mi cuenta», configura tu contraseña y verifica este correo. Si ya tienes cuenta, elige «Ya tengo cuenta». Después acepta la invitación. Si todavía no configuraste una contraseña, usa «Recuperar acceso». La invitación caduca en siete días.`;
  const brevo = env.MAIL_PROVIDER === "brevo";
  const result = await fetch(brevo ? "https://api.brevo.com/v3/smtp/email" : "https://api.resend.com/emails", {
    method: "POST",
    headers: brevo
      ? {"api-key": env.BREVO_API_KEY!, "Content-Type":"application/json", Accept:"application/json"}
      : {Authorization:"Bearer "+env.RESEND_API_KEY, "Content-Type":"application/json", "Idempotency-Key":"nexo-invite-"+inviteId+"-"+crypto.randomUUID()},
    body: JSON.stringify(brevo
      ? {sender:{name:"Nexo",email:env.MAIL_FROM},to:[{email}],subject,textContent:text}
      : {from:env.MAIL_FROM,to:[email],subject,text}),
    signal: AbortSignal.timeout(15000),
  });
  return result.ok;
}
