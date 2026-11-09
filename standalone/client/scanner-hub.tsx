import {useDevicePlatform,DeviceChoice} from "./device-platform";
import {scannerSite} from "./scanner-environment";
import {useScannerSession} from "./scanner-session";
import { useState } from "react";
import { Smartphone, Monitor, ArrowRight, ScanLine, Tags } from "lucide-react";
import { ModalHeading } from "../ui/modal-heading";
import { useDialog } from "../ui/use-dialog";
import { PhoneScanner, type ScannerIdentity } from "./scanner-link";
import { InstallNexo } from "./install-nexo";
import { Scanner } from "./scanner";
import type { Data } from "../ui/inventory";
export function ScannerHub({
  identity,
  data,
  onClose,
  onWork,
  onPrepare,
}: {
  identity: ScannerIdentity;
  data: Data;
  onClose: () => void;
  onWork: (mode: "sale" | "purchase") => void;
  onPrepare: () => void;
}) {
  const {platform,setPlatform}=useDevicePlatform(), session=useScannerSession();
  const [mode, setMode] = useState<"home" | "local" | "phone" | "tools">(
    platform === "windows" ? "tools" : "home",
  );
  useDialog(mode !== "tools", onClose);
  if (mode === "tools")
    return (
      <Scanner
        products={data.products}
        admin={data.user.role === "admin"}
        initialTab={platform === "windows" ? "labels" : "reader"}
        onClose={platform === "windows" ? onClose : () => setMode("home")}
      />
    );
  return (
    <div className="modal-backdrop">
      <section
        className="modal scanner-hub"
        role="dialog"
        aria-modal="true"
        aria-label="Escáner de Nexo"
      >
        <ModalHeading
          title={mode === "phone" ? "Lector del PC" : "Escáner de Nexo"}
          eyebrow="TU LECTOR, SIEMPRE A MANO"
          description={data.workspace.name}
          icon={ScanLine}
          onClose={onClose}
        />
        <div className="scanner-hub-body">
          {mode === "home" ? (
            <>
              <DeviceChoice platform={platform} onChange={setPlatform}/>
              {platform==="windows"&&<button className="btn primary" onClick={()=>{onClose();session?.show();}}>Conectar celular</button>}
              <a className="btn" href={scannerSite()}>Abrir Escáner Nexo · instalar en Android</a>
              <div className="scanner-mode-grid">
                <button
                  className="scanner-mode-card"
                  onClick={() => setMode("local")}
                >
                  <Smartphone size={28} />
                  <strong>Trabajar en este celular</strong>
                  <span>Prepara compras y ventas usando la cámara.</span>
                  <ArrowRight size={19} />
                </button>
                <button
                  className="scanner-mode-card"
                  onClick={() => setMode("phone")}
                >
                  <Monitor size={28} />
                  <strong>Usar como lector del PC</strong>
                  <span>
                    Escanea aquí y añade los productos a Nexo en Windows.
                  </span>
                  <ArrowRight size={19} />
                </button>
              </div>
              <div className="scanner-preparation">
                <ShieldText />
                <button className="text-btn" onClick={onPrepare}>
                  Preparar este equipo
                </button>
              </div>
              <InstallNexo />
              <button className="text-btn" onClick={() => setMode("tools")}>
                <Tags size={16} />
                Probar lector USB y crear etiquetas
              </button>
            </>
          ) : mode === "local" ? (
            <>
              <p>
                Elige qué vas a registrar. Cada lectura añade una unidad; revisa
                y confirma al terminar.
              </p>
              <div className="button-row">
                <button className="btn primary" onClick={() => onWork("sale")}>
                  Registrar venta
                </button>
                {data.user.role === "admin" && (
                  <button className="btn" onClick={() => onWork("purchase")}>
                    Recibir compra
                  </button>
                )}
              </div>
            </>
          ) : (
            <PhoneScanner identity={identity} onClose={() => setMode("home")} />
          )}
          {mode !== "home" && (
            <button className="text-btn" onClick={() => setMode("home")}>
              Volver a las opciones
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
function ShieldText() {
  return (
    <p>
      Para usarlo sin internet, prepara ambos equipos con conexión. El acceso
      offline dura hasta 24 horas desde la última validación.
    </p>
  );
}
