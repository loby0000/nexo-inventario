import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import { Camera, Pause, Play, ScanLine } from "lucide-react";
import { ScanGate } from "./scan-gate";
export function ContinuousCamera({
  onRead,
  qr = false,
  disabled = false,
  disabledLabel = "Esperando enlace con el PC",
}: {
  onRead: (code: string) => Promise<void>;
  qr?: boolean;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const [active, setActive] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState(""),
    [waiting, setWaiting] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    callback = useRef(onRead),
    blocked = useRef(disabled);
  callback.current = onRead;
  blocked.current = disabled;
  useEffect(() => {
    if (!active || paused) return;
    let disposed = false,
      controls: IScannerControls | undefined;
    const target = video.current;
    const gate = new ScanGate();
    const hints = new Map();
    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      qr
        ? [BarcodeFormat.QR_CODE]
        : [
            BarcodeFormat.EAN_8,
            BarcodeFormat.EAN_13,
            BarcodeFormat.UPC_A,
            BarcodeFormat.CODE_128,
          ],
    );
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 120,
    });
    const stop = () => {
      controls?.stop();
      (target?.srcObject as MediaStream | null)
        ?.getTracks()
        .forEach((t) => t.stop());
    };
    const hide = () => {
      if (document.hidden) {
        setPaused(true);
        stop();
      }
    };
    document.addEventListener("visibilitychange", hide);
    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
          },
          audio: false,
        },
        target!,
        (r, e) => {
          if (disposed || blocked.current) return;
          if (!r) {
            if (e instanceof NotFoundException)
              gate.frame(null, performance.now());
            return;
          }
          const code = r.getText();
          if (!gate.frame(code, performance.now())) return;
          setWaiting(true);
          void callback
            .current(code)
            .catch((e) => {
              if (!disposed) setError((e as Error).message);
            })
            .finally(() => {
              gate.done();
              if (!disposed) setWaiting(false);
            });
        },
      )
      .then((c) => {
        controls = c;
        if (disposed) c.stop();
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "No pudimos abrir la cámara. Permite su acceso en Chrome o escribe el código.",
          );
          setActive(false);
        }
      });
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [active, paused, qr]);
  return (
    <section className="nexo-camera">
      <div className="nexo-viewfinder">
        <video
          ref={video}
          muted
          playsInline
          aria-label={qr ? "Cámara para vincular el PC" : "Cámara del escáner"}
        />
        <span className="viewfinder-guide" aria-hidden="true" />
        {!active && (
          <div className="viewfinder-placeholder">
            <Camera size={36} />
            <strong>
              {qr ? "Escanea el QR del PC" : "Tu cámara, tu lector"}
            </strong>
            <span>Las imágenes se procesan aquí.</span>
          </div>
        )}
      </div>
      <div className="camera-toolbar">
        <span role="status">
          <ScanLine size={16} />
          {disabled
            ? disabledLabel
            : waiting
              ? "Esperando confirmación…"
              : paused
                ? "Cámara en pausa"
                : active
                  ? "Retira el código antes de repetirlo"
                  : "Cámara apagada"}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setError("");
            if (!active) {
              setActive(true);
              setPaused(false);
            } else setPaused((p) => !p);
          }}
        >
          {active && !paused ? <Pause size={16} /> : <Play size={16} />}{" "}
          {!active ? "Activar cámara" : paused ? "Reanudar" : "Pausar"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
