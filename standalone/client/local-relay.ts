import {
  localEndpoint,
  messageSchema,
  seal,
  unseal,
  type Packet,
  type ScannerMessage,
} from "../shared/scanner-protocol";
export const CONNECTOR = "http://127.0.0.1:47831";
export async function relayRequest(
  endpoint: string,
  path: string,
  token?: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  localEndpoint(endpoint, true);
  // Initial pairing can be waiting for Chrome's local-network permission.
  const timeout = path.endsWith("/claim") || path === "/v1/health" ? 60000 : 4000;
  let r: Response;
  try {
    r = await fetch(endpoint + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
      credentials: "omit",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw Error("El PC no respondió a tiempo. Conecta ambos equipos al mismo Wi-Fi o hotspot y permite el acceso a la red local. Si cambiaste de red, genera otro QR en el PC.");
    throw Error("No se pudo alcanzar el PC. Revisa el permiso de red local de Chrome, que ambos equipos compartan Wi-Fi o hotspot y que Windows permita Conector Nexo en esa red. Si cambiaste de red, genera otro QR.");
  }
  if (!r.ok)
    throw Error(
      r.status === 410
        ? "El enlace caducó. Genera otro QR en el PC."
        : r.status === 403
          ? "Acceso al conector rechazado. Revisa el QR y el permiso de red local."
          : "El conector está ocupado. Reintenta.",
    );
  if(r.status===204)return {};
  if(!r.headers.get("content-type")?.includes("json"))return {};
  try{return await r.json();}catch{throw Error("El conector respondió de forma incompleta. Vuelve a comprobar la conexión.");}

}
export class LocalRelay {
  private cursor = 0;
  private stopped = false;
  private abort = new AbortController();
  constructor(
    readonly endpoint: string,
    readonly session: string,
    readonly side: "host" | "phone",
    readonly token: string,
    private secret: string,
  ) {}
  async send(message: ScannerMessage) {
    await relayRequest(
      this.endpoint,
      `/v1/sessions/${this.session}/${this.side}`,
      this.token,
      await seal(this.secret, this.session, message),
    );
  }
  async listen(
    onMessage: (m: ScannerMessage) => Promise<void>,
    onState: (connected: boolean) => void,
  ) {
    let lastPeer = 0,
      lastHeartbeat = 0;
    while (!this.stopped) {
      try {
        if (Date.now() - lastHeartbeat >= 2000) {
          lastHeartbeat = Date.now();
          await this.send({ v: 2, type: "heartbeat" });
        }
        const data = (await relayRequest(
          this.endpoint,
          `/v1/sessions/${this.session}/${this.side}?after=${this.cursor}`,
          this.token,
          undefined,
          this.abort.signal,
        )) as { packets: { sequence: number; packet: Packet }[] };
        for (const item of data.packets) {
          if (this.stopped) return;
          let message: ScannerMessage;
          try {
            message = messageSchema.parse(
              await unseal(this.secret, this.session, item.packet),
            );
          } catch {
            this.cursor = item.sequence;
            continue;
          }
          lastPeer = Date.now();
          await onMessage(message);
          this.cursor = item.sequence;
        }
        onState(lastPeer > 0 && Date.now() - lastPeer < 6500);
      } catch {
        if (!this.stopped) onState(false);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  stop() {
    this.stopped = true;
    this.abort.abort();
  }
  async close() {
    this.stop();
    if (this.side === "host")
      await fetch(this.endpoint + `/v1/sessions/${this.session}/host`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + this.token },
        signal: AbortSignal.timeout(1500),
      }).catch(() => {});
  }
}
