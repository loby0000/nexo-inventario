import { openScannerOperation } from "./scanner-command";
import { pairingMask } from "./scanner-qr";
import { useDevicePlatform, DeviceChoice } from "./device-platform";
import { scannerIssuer, scannerSite } from "./scanner-environment";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DownloadConnector } from "./download-connector";
import { Smartphone, Link, Unlink, ShieldCheck } from "lucide-react";
import { ModalHeading } from "../ui/modal-heading";
import { useDialog } from "../ui/use-dialog";
import { useScannerAccess } from "./scanner-credential";
import { CONNECTOR, LocalRelay, relayRequest } from "./local-relay";
import { ContinuousCamera } from "./continuous-camera";
import {
  parsePair,
  pairText,
  pairingURL,
  proofText,
  randomSecret,
  signText,
  verifyGrant,
  verifyText,
  type DeviceGrant,
  type PairInfo,
  type ScannerMessage,
} from "../shared/scanner-protocol";
import {
  loadPhoneScan,
  savePhoneScan,
  clearPhoneScan,
  type Credential,
  type ScanAck,
} from "./scanner-store";
export type ScannerIdentity = {
  user: string;
  company: string;
  api: (path: string, body?: unknown) => Promise<unknown>;
};
function QR({ text }: { text: string }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (canvas.current) {
      const target = canvas.current;
      target.dataset.ready = "false";
      try {
        const maskPattern = pairingMask(text);
        setError("");
        void QRCode.toCanvas(target, text, {
          maskPattern,
          scale: 6,
          margin: 4,
          errorCorrectionLevel: "M",
        })
          .then(() => {
            target.dataset.ready = "true";
          })
          .catch(() => setError("No pudimos mostrar el QR. Genera otro."));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, [text]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <canvas
        ref={canvas}
        role="img"
        aria-label="QR para conectar el celular a esta operación"
      />
    </>
  );
}
export function RemoteHost({
  identity,
  draft,
  mode,
  companyName,
  onRead,
  onClose,
  visible,
  onShow,
  active = true,
  onDisconnect,
  onOpen,
}: {
  identity: ScannerIdentity;
  draft: string;
  mode: "sale" | "purchase";
  companyName: string;
  onRead: (
    id: string,
    code: string,
    requestedDraft: string,
  ) => Promise<ScanAck>;
  onClose: () => void;
  visible: boolean;
  onShow: () => void;
  active?: boolean;
  onDisconnect?: () => void;
  onOpen?: (
    mode: "sale" | "purchase",
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const { platform, setPlatform } = useDevicePlatform();
  const [connectorState, setConnectorState] = useState<
    "unknown" | "missing" | "outdated" | "ready"
  >("unknown");
  const { access, accessError, retryAccess } = useScannerAccess(
    identity.user,
    identity.company,
    identity.api,
  );
  useDialog(visible, onClose);
  const [pair, setPair] = useState<PairInfo>(),
    [endpoints, setEndpoints] = useState<string[]>([]),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [accepted, setAccepted] = useState(false),
    [request, setRequest] = useState<{ grant: DeviceGrant; nonce: string }>(),
    [starting, setStarting] = useState(false),
    [expired, setExpired] = useState(false),
    [requestedMode, setRequestedMode] = useState<"sale" | "purchase">();
  const relay = useRef<LocalRelay | undefined>(undefined),
    credential = useRef<Credential | undefined>(undefined),
    hostDeadline = useRef(0),
    activePhone = useRef<DeviceGrant | undefined>(undefined),
    read = useRef(onRead),
    acceptedRef = useRef(false),
    alive = useRef(true),
    pairRef = useRef<PairInfo | undefined>(undefined);
  const commands = useRef(
      new Map<
        string,
        { mode: string; revision: number; result: ScannerMessage }
      >(),
    ),
    open = useRef(onOpen);
  open.current = onOpen;
  const operation = useRef({ draft, mode, companyName, active }),
    revision = useRef(0);
  operation.current = { draft, mode, companyName, active };
  read.current = onRead;
  pairRef.current = pair;
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => {
      if (
        pairRef.current &&
        !acceptedRef.current &&
        Date.now() >= pairRef.current.expiresAt
      )
        setExpired(true);
      if (
        activePhone.current &&
        Date.now() >=
          Math.min(activePhone.current.expiresAt, hostDeadline.current)
      ) {
        acceptedRef.current = false;
        setAccepted(false);
        setError(
          "La autorización venció. Conecta ambos equipos a internet para renovarla.",
        );
        void relay.current?.close();
      }
    }, 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      void relay.current?.close();
    };
  }, []);
  useEffect(() => {
    const r = relay.current;
    if (!r || !acceptedRef.current) return;
    const number = ++revision.current;
    const allowed =
      active &&
      (!requestedMode || requestedMode === mode) &&
      (mode !== "purchase" || activePhone.current?.role === "admin");
    void r
      .send(
        allowed
          ? { v: 2, type: "target", revision: number, draft, mode, companyName }
          : { v: 2, type: "paused", revision: number },
      )
      .catch(() => setConnected(false));
  }, [active, draft, mode, companyName, accepted, requestedMode]);
  async function disconnect() {
    const r = relay.current;
    acceptedRef.current = false;
    setAccepted(false);
    activePhone.current = undefined;
    commands.current.clear();
    setRequestedMode(undefined);
    if (r) {
      await r.send({ v: 2, type: "closed" }).catch(() => {});
      await r.close();
    }
    relay.current = undefined;
    setPair(undefined);
    setRequest(undefined);
    onDisconnect?.();
  }
  async function checkConnector() {
    setError("");
    setStarting(true);
    try {
      const health = (await relayRequest(CONNECTOR, "/v1/health")) as {
        protocol?: number;
      };
      if (health.protocol !== 2) {
        setConnectorState("outdated");
        setError(
          "Tu conector necesita la versión 2. Cierra la anterior y abre la nueva descarga.",
        );
        return;
      }
      setConnectorState("ready");
      if (access) await start();
    } catch (e) {
      setConnectorState("missing");
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  async function start() {
    setStarting(true);
    setError("");
    setExpired(false);
    try {
      if (platform !== "windows")
        throw Error("Abre Conectar celular en el PC Windows.");
      if (!access)
        throw Error("Espera a que termine la validación del escáner.");
      const { credential: c, grant } = access;
      await verifyGrant(c.grant!, c.verifyKey!, scannerIssuer());
      if (mode === "purchase" && grant.role !== "admin")
        throw Error("Solo el administrador puede recibir compras.");
      credential.current = c;
      hostDeadline.current = grant.expiresAt;
      await relay.current?.close();
      const s = (await relayRequest(
        CONNECTOR,
        "/v1/sessions",
        undefined,
        {},
      )) as {
        session: string;
        hostToken: string;
        joinToken: string;
        expiresAt: number;
        endpoints: string[];
      };
      if (!alive.current || !s.endpoints.length) {
        await new LocalRelay(
          CONNECTOR,
          s.session,
          "host",
          s.hostToken,
          randomSecret(),
        ).close();
        if (!alive.current) return;
        throw Error("Conecta el PC a un Wi-Fi o hotspot e inténtalo de nuevo.");
      }
      const info: PairInfo = {
        v: 1,
        session: s.session,
        company: identity.company,
        token: s.joinToken,
        endpoint: s.endpoints[0],
        secret: randomSecret(),
        expiresAt: s.expiresAt,
      };
      revision.current = 0;
      commands.current.clear();
      setRequestedMode(undefined);
      setEndpoints(s.endpoints);
      setPair(info);
      acceptedRef.current = false;
      setAccepted(false);
      setRequest(undefined);
      activePhone.current = undefined;
      const r = new LocalRelay(
        CONNECTOR,
        s.session,
        "host",
        s.hostToken,
        info.secret,
      );
      relay.current = r;
      void r.listen(
        async (m) => {
          if (!alive.current || r !== relay.current) return;
          if (m.type === "hello" && !acceptedRef.current) {
            try {
              if (Date.now() > info.expiresAt)
                throw Error("El QR caducó. Genera otro.");
              const g = await verifyGrant(
                m.grant,
                c.verifyKey!,
                scannerIssuer(),
              );
              if (
                g.user !== identity.user ||
                g.company !== identity.company ||
                g.device === c.device ||
                (operation.current.mode === "purchase" && g.role !== "admin")
              )
                throw Error(
                  "Usa la misma cuenta y empresa en el celular y el PC.",
                );
              if (
                !(await verifyText(
                  g.publicKey,
                  proofText(info.session, m.nonce, "phone"),
                  m.proof,
                ))
              )
                throw Error("No pudimos verificar este celular.");
              setRequest({ grant: g, nonce: m.nonce });
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }
          if (
            m.type === "open_operation" &&
            acceptedRef.current &&
            activePhone.current
          ) {
            if (
              Date.now() >=
              Math.min(activePhone.current.expiresAt, grant.expiresAt)
            )
              return;
            const cached = commands.current.get(m.id);
            if (cached) {
              if (cached.mode === m.mode && cached.revision === m.revision)
                await r.send(cached.result);
              return;
            }
            const result = await openScannerOperation(
              m,
              activePhone.current.role,
              revision.current,
              async (mode) => {
                await r.send({
                  v: 2,
                  type: "paused",
                  revision: ++revision.current,
                });
                setRequestedMode(mode);
                const opened = (await open.current?.(mode)) ?? {
                  ok: false,
                  message: "El PC aún no está preparado.",
                };
                if (!opened.ok) setRequestedMode(undefined);
                return opened;
              },
            );
            const reply: ScannerMessage = {
              v: 2,
              type: "command_result",
              id: m.id,
              revision: revision.current,
              ...result,
            };
            if (commands.current.size >= 256)
              commands.current.delete(commands.current.keys().next().value!);
            commands.current.set(m.id, {
              mode: m.mode,
              revision: m.revision,
              result: reply,
            });
            await r.send(reply);
          }
          if (m.type === "scan" && acceptedRef.current && activePhone.current) {
            if (
              Date.now() >= activePhone.current.expiresAt ||
              Date.now() >= grant.expiresAt
            ) {
              acceptedRef.current = false;
              await r.send({ v: 2, type: "closed" });
              return;
            }
            let ack: ScanAck;
            try {
              const op = operation.current;
              ack =
                op.active &&
                op.mode === "purchase" &&
                activePhone.current.role !== "admin"
                  ? {
                      id: m.id,
                      ok: false,
                      message:
                        "Este dispositivo no tiene permiso para recibir compras.",
                    }
                  : await read.current(m.id, m.code, m.draft);
            } catch {
              ack = {
                id: m.id,
                ok: false,
                message:
                  "No se guardó la lectura. Revisa el almacenamiento y la operación en el PC antes de repetirla.",
              };
            }
            await r.send({ v: 2, type: "ack", ...ack });
          }
          if (m.type === "closed") {
            acceptedRef.current = false;
            setAccepted(false);
            setRequest(undefined);
            setError("El celular cerró el enlace. Genera otro QR.");
            await r.close();
          }
        },
        (v) => {
          if (alive.current) setConnected(v);
        },
      );
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setStarting(false);
    }
  }
  async function approve() {
    if (!request || !relay.current || !credential.current) return;
    try {
      const c = credential.current;
      await verifyGrant(c.grant!, c.verifyKey!, scannerIssuer());
      if (
        Date.now() >= (pairRef.current?.expiresAt ?? 0) ||
        Date.now() >= request.grant.expiresAt
      )
        throw Error("La autorización caducó. Genera otro QR.");
      activePhone.current = request.grant;
      acceptedRef.current = true;
      const selected = operation.current;
      await relay.current.send({
        v: 2,
        type: "accepted",
        active: selected.active,
        grant: c.grant!,
        proof: await signText(
          c.privateKey,
          proofText(
            relay.current.session,
            request.nonce,
            "host",
            selected.draft,
          ),
        ),
        nonce: request.nonce,
        draft: selected.draft,
        mode: selected.mode,
        companyName: selected.companyName,
      });
      setAccepted(true);
      setError("");
    } catch (e) {
      acceptedRef.current = false;
      setError((e as Error).message);
    }
  }
  if (!visible)
    return (
      <div className="scanner-inline-status" role="status">
        <Smartphone size={16} />
        <span>
          {accepted
            ? connected
              ? active
                ? "Celular conectado a esta operación"
                : "Celular conectado · En pausa"
              : "Enlace con el celular interrumpido"
            : request
              ? "Confirma el celular para conectarlo"
              : "Conexión de celular preparada"}
        </span>
        <button className="text-btn" type="button" onClick={onShow}>
          Ver enlace
        </button>
        <button
          className="text-btn"
          type="button"
          onClick={() => void disconnect()}
        >
          Desconectar celular
        </button>
      </div>
    );
  return (
    <div className="modal-backdrop">
      <section
        className="modal scanner-link-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Conectar celular"
      >
        <ModalHeading
          title="Tu celular como lector"
          eyebrow="CONEXIÓN LOCAL"
          description="Misma cuenta, misma empresa y el mismo Wi-Fi o hotspot."
          icon={Smartphone}
          onClose={onClose}
        />
        <div className="scanner-link-body">
          <ScannerAccessNotice
            loading={!access && !accessError}
            error={accessError}
            onRetry={retryAccess}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!pair ? (
            <>
              <DeviceChoice platform={platform} onChange={setPlatform} />
              {platform !== "windows" ? (
                <div className="pair-success">
                  <Smartphone size={32} />
                  <h3>Este es tu lector móvil</h3>
                  <p>
                    En el PC, pulsa «Conectar celular». Con la cámara de este
                    celular, abre el QR que aparezca.
                  </p>
                  <a className="btn primary" href={scannerSite()}>
                    Abrir Escáner Nexo
                  </a>
                  <p className="help">
                    Instálalo desde Chrome. El archivo .exe se abre únicamente
                    en Windows.
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    Conecta el PC y el celular al mismo Wi-Fi o hotspot.
                    Comprueba el conector para continuar; Chrome puede pedir
                    permiso de red local.
                  </p>
                  {(connectorState === "missing" ||
                    connectorState === "outdated") && (
                    <>
                      <DownloadConnector />
                      <p className="help">
                        Abre Conector Nexo 2 en Windows. Puedes minimizar su
                        ventana. Si Windows pregunta, permite solo redes
                        privadas.
                      </p>
                    </>
                  )}
                  {connectorState === "ready" && !access && (
                    <p role="status">
                      Conector listo. Esperando la autorización de tu cuenta…
                    </p>
                  )}
                  <button
                    className="btn primary"
                    disabled={starting || !access}
                    onClick={() => void checkConnector()}
                  >
                    <Link size={16} />
                    {starting
                      ? "Comprobando…"
                      : connectorState === "unknown"
                        ? "Comprobar conector"
                        : connectorState === "ready"
                          ? "Mostrar QR"
                          : "Volver a comprobar"}
                  </button>
                </>
              )}
            </>
          ) : accepted ? (
            <div className="pair-success">
              <ShieldCheck size={36} />
              <h3>{connected ? "Celular conectado" : "Enlace interrumpido"}</h3>
              <p>
                {active
                  ? `Las lecturas se añadirán a esta ${mode === "sale" ? "venta" : "compra"}.`
                  : "Elige Venta o Recibir compra desde el celular para abrir una operación en el PC."}{" "}
                Cierra este panel para revisar los productos; el enlace seguirá
                activo mientras esta empresa esté abierta. Si cierras la
                operación, el lector queda en pausa hasta abrir otra.
              </p>
              <button className="btn primary" onClick={onClose}>
                {active ? "Volver a la operación" : "Continuar en Nexo"}
              </button>
              <button className="btn" onClick={() => void disconnect()}>
                Desconectar celular
              </button>
            </div>
          ) : (
            <>
              <div className="pair-qr">
                {!expired && <QR text={pairingURL(pair, scannerSite())} />}
                <p>
                  {expired
                    ? "El QR caducó. Genera uno nuevo."
                    : "Escanea este QR con la cámara del celular. Se abrirá Escáner Nexo."}
                </p>
              </div>
              {endpoints.length > 1 && (
                <label>
                  Red del PC
                  <select
                    value={pair.endpoint}
                    onChange={(e) =>
                      setPair({ ...pair, endpoint: e.target.value })
                    }
                  >
                    {endpoints.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </label>
              )}
              {request && !expired && (
                <div className="pair-approval">
                  <strong>Un celular de tu cuenta quiere conectarse</strong>
                  <p>
                    Empresa: {companyName} ·{" "}
                    {mode === "sale" ? "Venta" : "Compra"}
                  </p>
                  <button
                    className="btn primary"
                    onClick={() => void approve()}
                  >
                    Permitir este celular
                  </button>
                </div>
              )}
              <details>
                <summary>Copiar código de conexión</summary>
                <label>
                  Código de conexión
                  <textarea readOnly value={pairText(pair)} />
                </label>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(pairingURL(pair, scannerSite()))
                      .catch(() =>
                        setError("Selecciona y copia el código manualmente."),
                      )
                  }
                >
                  Copiar código
                </button>
              </details>
              <button
                className="btn"
                disabled={starting || !access}
                onClick={() => void start()}
              >
                Generar otro QR
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function PhoneScanner({
  identity,
  onClose,
}: {
  identity: ScannerIdentity;
  onClose: () => void;
}) {
  const { access, accessError, retryAccess } = useScannerAccess(
    identity.user,
    identity.company,
    identity.api,
  );
  const [pairInput, setPairInput] = useState(() => {
      const value = sessionStorage.getItem("nexo-pair-fragment") ?? "";
      return value;
    }),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Escanea el QR del PC"),
    [linked, setLinked] = useState(false),
    [paused, setPaused] = useState(true),
    [connected, setConnected] = useState(false),
    [last, setLast] = useState<ScanAck>(),
    [pending, setPending] = useState(false),
    [manual, setManual] = useState(""),
    [connecting, setConnecting] = useState(false),
    [commandPending, setCommandPending] = useState(false),
    [activeMode, setActiveMode] = useState<"sale" | "purchase" | null>(null);
  const relay = useRef<LocalRelay | undefined>(undefined),
    boundDraft = useRef(""),
    boundMode = useRef<"sale" | "purchase">("sale"),
    credential = useRef<Credential | undefined>(undefined),
    hostGrant = useRef<DeviceGrant | undefined>(undefined),
    waiting = useRef<
      | { id: string; code: string; draft: string; mode?: "sale" | "purchase" }
      | undefined
    >(undefined),
    targetRevision = useRef(-1),
    nonce = useRef(""),
    alive = useRef(true),
    acked = useRef<() => void>(() => {});
  const command = useRef<
    Extract<ScannerMessage, { type: "open_operation" }> | undefined
  >(undefined);
  useEffect(() => {
    const incoming = () => {
      if (relay.current) {
        setError(
          "Ya tienes un enlace con otro PC. Desconéctalo antes de usar el QR nuevo.",
        );
        return;
      }
      setPairInput(sessionStorage.getItem("nexo-pair-fragment") ?? "");
      setStatus("QR leído. Pulsa Conectar a este PC.");
    };
    window.addEventListener("nexo-pair-ready", incoming);
    return () => window.removeEventListener("nexo-pair-ready", incoming);
  }, []);
  const storageKey =
    "nexo-phone-scan:" + identity.user + ":" + identity.company;
  useEffect(() => {
    let active = true;
    void loadPhoneScan(storageKey)
      .then((value) => {
        if (active) setPending(!!value);
      })
      .catch(() => {
        if (active)
          setError("No pudimos leer las lecturas pendientes de este equipo.");
      });
    return () => {
      active = false;
    };
  }, [storageKey]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void relay.current?.send({ v: 2, type: "closed" }).catch(() => {});
      relay.current?.stop();
      acked.current();
    };
  }, []);
  useEffect(() => {
    if (!linked) return;
    const tick = setInterval(() => {
      if (hostGrant.current && Date.now() >= hostGrant.current.expiresAt) {
        setLinked(false);
        setError(
          "La autorización del PC venció. Conecta ambos equipos a internet.",
        );
        return;
      }
      if (command.current && connected)
        void relay.current
          ?.send(command.current)
          .catch(() => setConnected(false));
      if (
        waiting.current &&
        connected &&
        !paused &&
        waiting.current.draft === boundDraft.current
      )
        void relay.current
          ?.send({ v: 2, type: "scan", ...waiting.current })
          .catch(() => setConnected(false));
    }, 2000);
    return () => clearInterval(tick);
  }, [linked, connected, paused]);
  async function pair(text: string) {
    if (connecting || linked || relay.current) return;
    setConnecting(true);
    setError("");
    try {
      const p = parsePair(text);
      if (p.company && p.company !== identity.company)
        throw Error(
          "Este QR pertenece a otra empresa. Elige la misma empresa del PC antes de conectar.",
        );
      if (!access)
        throw Error("Espera a que termine la validación del escáner.");
      const { credential: c } = access;
      await verifyGrant(c.grant!, c.verifyKey!, scannerIssuer());
      if (!alive.current) return;
      credential.current = c;
      const claim = (await relayRequest(
        p.endpoint,
        `/v1/sessions/${p.session}/claim`,
        p.token,
        {},
      )) as { token: string };
      if (!alive.current) return;
      const r = new LocalRelay(
        p.endpoint,
        p.session,
        "phone",
        claim.token,
        p.secret,
      );
      relay.current = r;
      nonce.current = randomSecret();
      sessionStorage.removeItem("nexo-pair-fragment");
      sessionStorage.removeItem("nexo-pair-company");
      setStatus("Confirma la conexión en el PC");
      void r.listen(
        async (m) => {
          if (!alive.current || relay.current !== r) return;
          if (m.type === "accepted") {
            try {
              const g = await verifyGrant(
                m.grant,
                c.verifyKey!,
                scannerIssuer(),
              );
              if (
                g.user !== identity.user ||
                g.company !== identity.company ||
                g.device === c.device ||
                m.nonce !== nonce.current ||
                (m.mode === "purchase" && g.role !== "admin")
              )
                throw Error("La cuenta o empresa del PC es diferente.");
              if (
                !(await verifyText(
                  g.publicKey,
                  proofText(p.session, m.nonce, "host", m.draft),
                  m.proof,
                ))
              )
                throw Error("No pudimos verificar el PC.");
              const prior = await loadPhoneScan(storageKey);
              if (prior) {
                waiting.current = prior;
                setPending(true);
              }
              boundDraft.current = m.draft;
              boundMode.current = m.mode;
              hostGrant.current = g;
              setLinked(true);
              setPaused(!m.active);
              setActiveMode(m.active ? m.mode : null);
              targetRevision.current = 0;
              setStatus(
                `${m.companyName} · ${m.mode === "sale" ? "Venta" : "Compra"}`,
              );
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }
          if (
            (m.type === "target" || m.type === "paused") &&
            hostGrant.current &&
            m.revision > targetRevision.current
          ) {
            targetRevision.current = m.revision;
            if (m.type === "paused") {
              setActiveMode(null);
              setPaused(true);
              setStatus("En pausa · Abre una compra o venta en el PC");
            } else if (
              m.mode === "purchase" &&
              (hostGrant.current.role !== "admin" ||
                access?.grant.role !== "admin")
            ) {
              setPaused(true);
              setError(
                "Este dispositivo no tiene permiso para recibir compras.",
              );
            } else {
              boundDraft.current = m.draft;
              boundMode.current = m.mode;
              setActiveMode(m.mode);
              setPaused(false);
              setStatus(
                `${m.companyName} · ${m.mode === "sale" ? "Venta" : "Compra"}`,
              );
              setError("");
            }
          }
          if (m.type === "command_result" && m.id === command.current?.id) {
            command.current = undefined;
            setCommandPending(false);
            if (!m.ok) {
              setStatus(m.message);
              setError(m.message);
            } else
              setStatus((current) =>
                current === "Esperando al PC…" ? m.message : current,
              );
          }
          if (m.type === "ack" && m.id === waiting.current?.id) {
            await clearPhoneScan(storageKey, m.id);
            waiting.current = undefined;
            setPending(false);
            setLast(m);
            if (m.ok) navigator.vibrate?.(70);
            acked.current();
          }
          if (m.type === "closed") {
            setLinked(false);
            setStatus("El PC cerró la operación");
            r.stop();
          }
        },
        (v) => {
          if (alive.current) setConnected(v);
        },
      );
      await r.send({
        v: 2,
        type: "hello",
        grant: c.grant!,
        nonce: nonce.current,
        proof: await signText(
          c.privateKey,
          proofText(p.session, nonce.current, "phone"),
        ),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }
  async function openOperation(mode: "sale" | "purchase") {
    if (!linked || !connected || command.current || !relay.current) return;
    if (mode === "purchase" && access?.grant.role !== "admin") return;
    const value: Extract<ScannerMessage, { type: "open_operation" }> = {
      v: 2,
      type: "open_operation",
      id: crypto.randomUUID(),
      revision: targetRevision.current,
      mode,
    };
    command.current = value;
    setCommandPending(true);
    setPaused(true);
    setError("");
    setStatus("Esperando al PC…");
    await relay.current.send(value).catch(() => setConnected(false));
  }
  async function scan(code: string) {
    if (!linked || !connected || paused || waiting.current || !relay.current)
      return;
    if (
      !hostGrant.current ||
      Date.now() >= hostGrant.current.expiresAt ||
      !credential.current?.grant ||
      JSON.parse(credential.current.grant.payload).expiresAt <= Date.now()
    ) {
      setLinked(false);
      throw Error("Conéctate para renovar el acceso.");
    }
    const event = {
      id: crypto.randomUUID(),
      code,
      draft: boundDraft.current,
      mode: boundMode.current,
    };
    await savePhoneScan(storageKey, event);
    waiting.current = event;
    setPending(true);
    if (!alive.current) return;
    await relay.current
      .send({ v: 2, type: "scan", ...event })
      .catch(() => setConnected(false));
  }
  return (
    <div className="phone-scanner">
      <ScannerAccessNotice
        loading={!access && !accessError}
        error={accessError}
        onRetry={retryAccess}
      />
      <p className="help">
        En el PC, pulsa «Conectar celular». No necesitas abrir una compra o
        venta.
      </p>
      <div className="scanner-status">
        <span
          className={connected && linked ? "scanner-dot online" : "scanner-dot"}
        />
        <strong>
          {linked
            ? connected
              ? "Conectado al PC"
              : "Sin enlace con el PC"
            : status}
        </strong>
      </div>
      <p className="help">
        Internet y el enlace al PC son conexiones distintas. Mantén Nexo visible
        en ambos equipos.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!linked ? (
        <>
          {!pairInput && (
            <ContinuousCamera
              qr
              disabled={connecting || !!relay.current || !access}
              onRead={async (text) => {
                parsePair(text);
                setPairInput(text);
                setStatus(
                  "QR leído. Pulsa Conectar para permitir la red local.",
                );
              }}
            />
          )}
          {pairInput && (
            <button
              className="btn primary"
              disabled={connecting || !!relay.current || !access}
              onClick={() => void pair(pairInput.trim())}
            >
              Conectar a este PC
            </button>
          )}
          {pairInput && (
            <button
              className="text-btn"
              onClick={() => {
                if (relay.current) return;
                setPairInput("");
                sessionStorage.removeItem("nexo-pair-fragment");
                setStatus("Escanea el QR del PC");
              }}
            >
              Escanear otro QR
            </button>
          )}
          <details>
            <summary>Introducir el código de conexión</summary>
            <label>
              Código NEXO1
              <textarea
                value={pairInput}
                onChange={(e) => setPairInput(e.target.value)}
                maxLength={1600}
              />
            </label>
          </details>
          {relay.current && (
            <button
              className="btn"
              onClick={() => {
                relay.current?.stop();
                relay.current = undefined;
                setPairInput("");
                setError("");
                setStatus("Escanea un QR nuevo del PC");
              }}
            >
              Usar otro QR
            </button>
          )}
          <p className="help">
            Si se interrumpe el enlace, genera otro QR en la misma operación
            para recuperar la lectura pendiente.
          </p>
          {pending && (
            <button
              className="btn"
              onClick={async () => {
                if (
                  confirm(
                    "¿Descartar la lectura sin confirmar? Podría haber quedado añadida en el PC. Revisa allí la cantidad antes de repetirla.",
                  )
                ) {
                  try {
                    await clearPhoneScan(storageKey);
                  } catch {
                    setError(
                      "No pudimos descartar la lectura. Revisa el almacenamiento.",
                    );
                    return;
                  }
                  waiting.current = undefined;
                  setPending(false);
                  setError("");
                }
              }}
            >
              Descartar lectura sin confirmar
            </button>
          )}
        </>
      ) : (
        <>
          <div className="button-row">
            <button
              className={"btn" + (activeMode === "sale" ? " primary" : "")}
              aria-pressed={activeMode === "sale"}
              disabled={!connected || commandPending}
              onClick={() => void openOperation("sale")}
            >
              Venta
            </button>
            {access?.grant.role === "admin" && (
              <button
                className={"btn" + (activeMode === "purchase" ? " primary" : "")}
                aria-pressed={activeMode === "purchase"}
                disabled={!connected || commandPending}
                onClick={() => void openOperation("purchase")}
              >
                Recibir compra
              </button>
            )}
          </div>
          <p className="help">
            Revisa precios y cantidades, y confirma únicamente en el PC.
          </p>
          {pending && (
            <div className="scanner-pending-note" role="status">
              <p>
                Hay una lectura pendiente. Abre su operación original para
                recuperar la confirmación; las lecturas nuevas siguen en pausa.
              </p>
              <button
                className="text-btn"
                onClick={async () => {
                  if (
                    confirm(
                      "¿Descartar la lectura pendiente? Puede haberse añadido en el PC. Revisa allí la cantidad antes de repetirla.",
                    )
                  ) {
                    try {
                      await clearPhoneScan(storageKey);
                      waiting.current = undefined;
                      setPending(false);
                    } catch {
                      setError(
                        "No pudimos actualizar el almacenamiento local.",
                      );
                    }
                  }
                }}
              >
                Revisé el PC: descartar pendiente
              </button>
            </div>
          )}
          <p className="scanner-document">{status}</p>
          <ContinuousCamera
            disabled={!connected || pending || paused}
            disabledLabel={
              paused
                ? "En pausa · Abre una operación en el PC"
                : pending
                  ? "Esperando confirmación del PC"
                  : "Esperando enlace con el PC"
            }
            onRead={scan}
          />
          <div className="last-reading" role="status">
            <span>
              {pending
                ? "Pendiente de confirmación del PC"
                : last?.ok
                  ? "Añadido al borrador del PC"
                  : "Última lectura"}
            </span>
            <strong>{last?.message ?? "Listo para escanear"}</strong>
            {last?.quantity !== undefined && (
              <small>{last.quantity} unidades en la operación</small>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void scan(manual.trim()).catch((e) => setError(e.message));
              setManual("");
            }}
          >
            <label>
              SKU o código manual
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                maxLength={128}
              />
            </label>
            <button
              className="btn"
              disabled={!connected || pending || paused || !manual.trim()}
            >
              Añadir una unidad
            </button>
          </form>
          <button
            className="btn"
            onClick={() => {
              void relay.current
                ?.send({ v: 2, type: "closed" })
                .catch(() => {});
              relay.current?.stop();
              setLinked(false);
              onClose();
            }}
          >
            <Unlink size={16} />
            Desconectar
          </button>
        </>
      )}
    </div>
  );
}

function ScannerAccessNotice({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return error ? (
    <div className="error" role="alert">
      {error}
      <button type="button" className="text-btn" onClick={onRetry}>
        Volver a validar
      </button>
    </div>
  ) : loading ? (
    <p role="status" className="help">
      Validando el acceso del escáner…
    </p>
  ) : null;
}
