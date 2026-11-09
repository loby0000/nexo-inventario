import { useEffect, useState } from "react";
import { Download } from "lucide-react";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let pending: InstallEvent | undefined;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pending = e as InstallEvent;
  window.dispatchEvent(new Event("nexo-install-ready"));
});
export function InstallNexo({name="Nexo"}:{name?:string}) {
  const [ready, setReady] = useState(!!pending),
    [help, setHelp] = useState(false);
  useEffect(() => {
    const update = () => setReady(!!pending);
    window.addEventListener("nexo-install-ready", update);
    return () => window.removeEventListener("nexo-install-ready", update);
  }, []);
  if (matchMedia("(display-mode: standalone)").matches)
    return <p className="help">{name} está abierta como aplicación.</p>;
  return (
    <div className="install-nexo">
      <button
        className="btn"
        type="button"
        onClick={async () => {
          if (pending) {
            await pending.prompt();
            await pending.userChoice;
            pending = undefined;
            setReady(false);
          } else setHelp((v) => !v);
        }}
      >
        <Download size={16} />
        {ready ? "Instalar "+name : "Cómo instalar "+name}
      </button>
      {help && (
        <p className="help">
          En Chrome Android, abre ⋮ → «Añadir a pantalla de inicio» →
          «Instalar». En Windows, usa el icono de instalación de la barra de
          direcciones. Prepara el equipo en «Mi espacio» para abrirlo sin
          internet.
        </p>
      )}
    </div>
  );
}
