import { useState } from "react";
export type Platform = "android" | "windows" | "other";
export function detectPlatform(n: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  userAgentData?: { platform?: string };
}): Platform {
  const value = n.userAgentData?.platform ?? n.platform;
  if (/Android/i.test(n.userAgent) || /Android/i.test(value)) return "android";
  if (/Win/i.test(value) || /Windows/i.test(n.userAgent)) return "windows";
  return "other";
}
export function useDevicePlatform() {
  const [platform, setPlatform] = useState<Platform>(() => {
    const saved = sessionStorage.getItem("nexo-platform");
    return saved === "android" || saved === "windows"
      ? saved
      : detectPlatform(navigator);
  });
  return {
    platform,
    setPlatform: (value: Platform) => {
      sessionStorage.setItem("nexo-platform", value);
      setPlatform(value);
    },
  };
}
export function DeviceChoice({
  platform,
  onChange,
}: {
  platform: Platform;
  onChange: (p: Platform) => void;
}) {
  return (
    <details className="device-choice">
      <summary>
        {platform === "windows"
          ? "Este equipo: Windows"
          : platform === "android"
            ? "Este equipo: celular Android"
            : "Elegir tipo de equipo"}
      </summary>
      <label>
        Estoy usando
        <select
          value={platform}
          onChange={(e) => onChange(e.target.value as Platform)}
        >
          <option value="android">Celular Android</option>
          <option value="windows">PC Windows, incluido táctil</option>
          <option value="other">Otro equipo</option>
        </select>
      </label>
    </details>
  );
}
