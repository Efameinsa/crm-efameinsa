"use client";

import { useEffect, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";

/**
 * El recorrido del día del piloto de trabajo de campo (0363; Carlos,
 * 01-10-2026). Mismo Leaflet a mano que «Dónde están los equipos»
 * (mapa-accesos.tsx), con una diferencia que importa: acá cada punto lleva su
 * círculo del TAMAÑO REAL de la precisión que declaró el equipo, en metros.
 * Un punto con ±8 m se ve como un punto; uno con ±900 m se ve como lo que es,
 * un barrio. Así nadie lee de más una lectura gruesa.
 *
 * 0367: los puntos del GPS del celular (Traccar Client) van rellenos y los del
 * navegador huecos. Si ese día hay GPS, la línea del recorrido une solo los
 * del GPS: mezclarla con la laptop (ubicada por wifi a 50 m) la haría saltar
 * de un lado a otro. Con un punto por minuto, el círculo de precisión se dibuja
 * solo cuando dice algo (más de 30 m, o el último).
 */

export interface PuntoCampo {
  lat: number;
  lon: number;
  precision: number | null;
  hora: string;
  /** Del GPS del celular (true) o del navegador (false). */
  gps?: boolean;
  /** «32 km/h», o null si estaba quieto o sin dato. */
  velocidad?: string | null;
  bateria?: number | null;
}

export interface RecorridoCampo {
  nombre: string;
  color: string;
  puntos: PuntoCampo[];
}

export function MapaRecorridoCampo({ recorridos }: { recorridos: RecorridoCampo[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const clave = useMemo(
    () => recorridos.map((r) => `${r.nombre}:${r.puntos.length}:${r.puntos.at(-1)?.hora ?? ""}`).join("|"),
    [recorridos],
  );
  const hayPuntos = recorridos.some((r) => r.puntos.length > 0);

  useEffect(() => {
    if (!contenedor.current || !hayPuntos) return;
    let mapa: import("leaflet").Map | null = null;
    let vivo = true;
    // Leaflet se importa dentro del efecto: toca `window` al cargarse (ver mapa-accesos).
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !contenedor.current) return;
      const m = L.map(contenedor.current, { scrollWheelZoom: false });
      mapa = m;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);

      const capas: import("leaflet").Layer[] = [];
      for (const r of recorridos) {
        if (r.puntos.length === 0) continue;
        const delGps = r.puntos.filter((p) => p.gps);
        const linea = delGps.length > 1 ? delGps : r.puntos;
        if (linea.length > 1) {
          capas.push(
            L.polyline(linea.map((p) => [p.lat, p.lon] as [number, number]), {
              color: r.color,
              weight: delGps.length > 1 ? 3 : 2,
              opacity: 0.6,
              dashArray: delGps.length > 1 ? undefined : "4 4",
            }).addTo(m),
          );
        }
        r.puntos.forEach((p, i) => {
          const ultimo = i === r.puntos.length - 1;
          if (p.precision != null && (!p.gps || ultimo || p.precision > 30)) {
            L.circle([p.lat, p.lon], { radius: p.precision, color: r.color, weight: 1, fillOpacity: 0.08, opacity: 0.4 }).addTo(m);
          }
          const punto = L.circleMarker([p.lat, p.lon], {
            radius: ultimo ? 7 : p.gps ? 3 : 4,
            color: r.color,
            weight: 2,
            fillColor: ultimo || p.gps ? r.color : "#ffffff",
            fillOpacity: 1,
          })
            .addTo(m)
            .bindPopup(
              `<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong>${ultimo ? " · último" : ""}<br>${escapar(p.hora)} · ${
                p.gps ? "GPS del celular" : "navegador"
              } · ${p.precision != null ? `±${Math.round(p.precision)} m` : "sin precisión"}${p.velocidad ? ` · ${escapar(p.velocidad)}` : ""}${
                p.bateria != null ? ` · batería ${Math.round(p.bateria)} %` : ""
              }</div>`,
            );
          capas.push(punto);
        });
      }
      m.fitBounds(L.featureGroup(capas).getBounds().pad(0.25), { maxZoom: 17 });
    })();
    return () => {
      vivo = false;
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume los recorridos
  }, [clave, hayPuntos]);

  if (!hayPuntos) {
    return <p className="text-sm text-muted-foreground">Ese día no hay lecturas con ubicación.</p>;
  }
  return <div ref={contenedor} className="h-[380px] w-full overflow-hidden rounded-lg border border-border" />;
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
