// A stored catalogue alone cannot reopen the app when the network disappears.
export async function ensureOfflineShell() {
  const failure = "No pudimos preparar los archivos para abrir Nexo sin internet. Mantén la conexión y vuelve a intentar.";
  const update = "Hay una actualización de Nexo pendiente. Guarda los borradores, cierra todas las pestañas y ventanas de Nexo y vuelve a abrirla con conexión antes de preparar el equipo.";
  const requiredAsset=new URL(import.meta.url).pathname;
  if (!("serviceWorker" in navigator)) throw Error(failure);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let channel: MessageChannel | undefined;
  let cancelled = false;
  try {
    await Promise.race([
      (async () => {
        await navigator.serviceWorker.register("/sw.js");
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) throw Error(failure);
        if (!registration.active || new URL(registration.active.scriptURL).pathname !== "/sw.js")
          throw Error(failure);
        channel = new MessageChannel();
        await new Promise<void>((resolve, reject) => {
          channel!.port1.onmessage = (event) => {
            if(event.data?.type!=='NEXO_SHELL_READY')reject(Error(failure));
            else if(event.data.protocol!==2||event.data.asset!==requiredAsset)reject(Error(update));
            else if(event.data.ready===true)resolve();
            else reject(Error(failure));
          };
          registration.active!.postMessage({ type: "NEXO_CHECK_SHELL",requiredAsset }, [channel!.port2]);
        });
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(failure)), 15000);
      }),
    ]);
  } catch(e) {
    throw Error(e instanceof Error&&e.message===update?update:failure);
  } finally {
    cancelled = true;
    clearTimeout(timer);
    channel?.port1.close();
    channel?.port2.close();
  }
}
