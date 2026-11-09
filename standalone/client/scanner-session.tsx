import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RemoteHost, type ScannerIdentity } from "./scanner-link";
import { routeScannerRead, type ScannerTarget } from "./scanner-routing";
import type { ScanAck } from "./scanner-store";
type Session = {
  attach: (target: ScannerTarget) => () => void;
  show: () => void;
  registerOpen: (
    handler: (
      mode: "sale" | "purchase",
    ) => Promise<{ ok: boolean; message: string }>,
  ) => () => void;
};
const Context = createContext<Session | null>(null);
export const useScannerSession = () => useContext(Context);
export function ScannerSessionProvider({
  identity,
  children,
  companyName = "Tu empresa",
}: {
  identity: ScannerIdentity;
  children: ReactNode;
  companyName?: string;
}) {
  const [target, setTarget] = useState<ScannerTarget>(),
    [enabled, setEnabled] = useState(false),
    [visible, setVisible] = useState(false);
  const idle = useRef(crypto.randomUUID());
  const openHandler = useRef<
    | ((mode: "sale" | "purchase") => Promise<{ ok: boolean; message: string }>)
    | undefined
  >(undefined);
  const registerOpen = useCallback(
    (handler: NonNullable<typeof openHandler.current>) => {
      openHandler.current = handler;
      return () => {
        if (openHandler.current === handler) openHandler.current = undefined;
      };
    },
    [],
  );
  const active = useRef<ScannerTarget | undefined>(undefined),
    last = useRef<ScannerTarget | undefined>(undefined);
  const attach = useCallback((value: ScannerTarget) => {
    active.current = value;
    last.current = value;
    setTarget(value);
    return () => {
      if (active.current === value) {
        active.current = undefined;
        setTarget(undefined);
      }
    };
  }, []);
  const show = useCallback(() => {
    setEnabled(true);
    setVisible(true);
  }, []);
  async function read(
    id: string,
    code: string,
    requestedDraft: string,
  ): Promise<ScanAck> {
    return routeScannerRead(
      identity.user,
      identity.company,
      active.current,
      id,
      code,
      requestedDraft,
    );
  }
  const selected = target ??
    last.current ?? { draft: idle.current, mode: "sale" as const, companyName };
  return (
    <Context.Provider value={{ attach, show, registerOpen }}>
      {children}
      {enabled && selected && (
        <div className={visible ? "" : "scanner-session-bar"}>
          <RemoteHost
            identity={identity}
            draft={selected.draft}
            mode={selected.mode}
            companyName={selected.companyName}
            active={!!target}
            onOpen={(mode) =>
              active.current?.busy?.()
                ? Promise.resolve({
                    ok: false,
                    message:
                      "El PC está guardando el borrador. Espera a que termine.",
                  })
                : (openHandler.current?.(mode) ??
                  Promise.resolve({
                    ok: false,
                    message: "Abre el inventario en el PC.",
                  }))
            }
            onRead={read}
            visible={visible}
            onShow={() => setVisible(true)}
            onClose={() => setVisible(false)}
            onDisconnect={() => {
              setEnabled(false);
              setVisible(false);
            }}
          />
        </div>
      )}
    </Context.Provider>
  );
}
