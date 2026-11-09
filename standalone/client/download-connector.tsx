import { useState } from "react";
import { Download } from "lucide-react";
export function DownloadConnector() {
  const [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  async function download() {
    setProgress("Preparando descarga…");
    setError("");
    try {
      const r = await fetch("/downloads/connector.json", { cache: "no-store" });
      if (!r.ok || !r.headers.get("content-type")?.includes("json"))
        throw Error(
          "La descarga necesita internet. Guarda el conector antes de trabajar sin conexión.",
        );
      const info = (await r.json()) as {
        parts: { file: string; bytes: number; sha256: string }[];
        bytes: number;
        sha256: string;
      };
      if (!Array.isArray(info.parts) || info.parts.length > 32)
        throw Error("La descarga aún no está disponible.");
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      const digest = async (b: Uint8Array<ArrayBuffer>) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      for (const part of info.parts) {
        if (!/^NexoConnector\.[a-f0-9]{12}\.\d+\.bin$/.test(part.file))
          throw Error("Archivo de descarga no válido.");
        const response = await fetch("/downloads/" + part.file);
        if (!response.ok)
          throw Error(
            "Se interrumpió la descarga. Vuelve a intentarlo con conexión.",
          );
        const chunk = new Uint8Array(await response.arrayBuffer());
        if (
          chunk.length !== part.bytes ||
          (await digest(chunk)) !== part.sha256
        )
          throw Error("No pudimos verificar la descarga. Vuelve a intentarlo.");
        chunks.push(chunk);
        size += chunk.length;
        setProgress(`Descargando… ${Math.round((size / info.bytes) * 100)} %`);
      }
      const binary = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        binary.set(chunk, offset);
        offset += chunk.length;
      }
      if (size !== info.bytes || (await digest(binary)) !== info.sha256)
        throw Error("No pudimos verificar el conector.");
      const url = URL.createObjectURL(
          new Blob([binary], { type: "application/octet-stream" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "NexoConnector.exe";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setProgress("");
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    }
  }
  return (
    <div className="download-connector">
      <button
        className="btn"
        type="button"
        disabled={!!progress}
        onClick={() => void download()}
      >
        <Download size={16} />
        {progress || "Descargar Conector Nexo · Windows"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
