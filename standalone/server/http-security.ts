export const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
export class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function apiResponse(data: unknown, status = 200, extra: Record<string,string> = {}) {
  return Response.json(data, {status,headers:{...API_HEADERS,...extra}});
}
export async function boundedJson(req: Request, maxBytes = 262144, timeoutMs = 10000) {
  if (req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new HttpError("Envía los datos como JSON.",415);
  const declared = req.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new HttpError("La operación supera el tamaño permitido.",413);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Faltan datos.",400);
  const deadline = Date.now()+timeoutMs, decoder = new TextDecoder('utf-8',{fatal:true});
  let n=0,text="",complete=false;
  try {
    for (;;) {
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new HttpError("La solicitud tardó demasiado. Vuelve a intentar.",408);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const part = await Promise.race([
        reader.read(),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new HttpError("La solicitud tardó demasiado. Vuelve a intentar.",408)),remaining);}),
      ]).finally(()=>clearTimeout(timer));
      if(part.done){complete=true;break;}
      n+=part.value.length;
      if(n>maxBytes)throw new HttpError("La operación supera el tamaño permitido.",413);
      try{text+=decoder.decode(part.value,{stream:true});}catch{throw new HttpError("JSON inválido.",400);}
    }
    try{text+=decoder.decode();return JSON.parse(text);}catch{throw new HttpError("Revisa los datos enviados.",400);}
  } finally {
    if(!complete)void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
export type Limiter = {limit(input:{key:string}):Promise<{success:boolean}>};
export async function enforceLimit(limiter: Limiter | undefined, key: string) {
  if(limiter && !(await limiter.limit({key})).success)
    throw new HttpError("Demasiadas solicitudes. Espera un minuto antes de reintentar.",429);
}
