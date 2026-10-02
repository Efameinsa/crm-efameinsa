"use client";

import { useEffect, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { analizarRecorrido, haceMinutos, PARADA_RADIO_M, PRECISION_MAX_M } from "@/lib/recorrido-campo";

/**
 * El recorrido del día del piloto de trabajo de campo (0363; Carlos, 01-10-2026). Mismo Leaflet a mano que
 * «Dónde están los equipos» (mapa-accesos.tsx).
 *
 * 02-10-2026 (Santos: «¿puedes mejorar el mapa para que aumente la precisión?»): la precisión la da el GPS
 * del celular y el mapa no la mejora; lo que se mejoró es cómo se LEE (lib/recorrido-campo.ts):
 *
 *   · una persona quieta ya no es una mancha de puntos: es una PARADA naranja con su duración;
 *   · las lecturas con más de 100 m de error no tuercen la línea: salen como puntos grises sin unir;
 *   · hay un INICIO (verde) y un ÚLTIMO punto (grande) que dice «hace N min»;
 *   · el círculo de precisión se dibuja solo cuando dice algo (más de 30 m).
 *
 * Los puntos del navegador (laptop, wifi, ±50 m) siguen como antes: huecos y con su círculo, sin análisis.
 */

export interface PuntoCampo {
  lat: number;
  lon: number;
  precision: number | null;
  hora: string;
  /** Hora de la lectura (ms Unix). */
  t: number;
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

const COLOR_PARADA = "#ea580c";
const COLOR_DESCARTADO = "#9ca3af";
const COLOR_INICIO = "#16a34a";

function horaLima(t: number): string {
  return new Date(t).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
}

export function MapaRecorridoCampo({ recorridos }: { recorridos: RecorridoCampo[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const clave = useMemo(
    () => recorridos.map((r) => `${r.nombre}:${r.puntos.length}:${r.puntos.at(-1)?.t ?? ""}`).join("|"),
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

      // Los límites se arman con las coordenadas: pedírselos a las capas falla con los círculos (las
      // paradas) hasta que el mapa tiene vista, y una lectura descartada no debe alejar el zoom.
      const limites = L.latLngBounds([]);
      const abarcar = (lat: number, lon: number) => void limites.extend([lat, lon]);
      const ahora = Date.now();
      for (const r of recorridos) {
        if (r.puntos.length === 0) continue;
        const delGps = r.puntos.filter((p) => p.gps);
        const delNavegador = r.puntos.filter((p) => !p.gps);

        // 1. GPS del celular: la línea limpia, las paradas, el inicio y el último punto.
        if (delGps.length > 0) {
          const porHora = new Map(delGps.map((p) => [p.t, p]));
          const a = analizarRecorrido(delGps.map((p) => ({ lat: p.lat, lon: p.lon, precision: p.precision, t: p.t })));

          if (a.nodos.length > 1) {
            L.polyline(
                a.nodos.map((n) => (n.tipo === "parada" ? ([n.parada.lat, n.parada.lon] as [number, number]) : ([n.lat, n.lon] as [number, number])),
                ),
                { color: r.color, weight: 3, opacity: 0.7 },
              ).addTo(m);
          }

          for (const d of a.descartados) {
            L.circleMarker([d.lat, d.lon], { radius: 2, color: COLOR_DESCARTADO, weight: 1, fillColor: COLOR_DESCARTADO, fillOpacity: 0.4 })
                .addTo(m)
                .bindPopup(
                  `<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong><br>${escapar(horaLima(d.t))} · lectura descartada: ±${Math.round(d.precision ?? 0)} m (más de ${PRECISION_MAX_M} m)</div>`,
                );
          }

          for (const n of a.nodos) {
            if (n.tipo === "parada") {
              const pa = n.parada;
              abarcar(pa.lat, pa.lon);
              L.circle([pa.lat, pa.lon], { radius: PARADA_RADIO_M, color: COLOR_PARADA, weight: 1.5, fillColor: COLOR_PARADA, fillOpacity: 0.25 })
                  .addTo(m)
                  .bindPopup(
                    `<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong><br>Parada de ${pa.minutos} min · ${escapar(horaLima(pa.desde))}–${escapar(horaLima(pa.hasta))}<br>${pa.puntos} lecturas en el mismo lugar</div>`,
                  );
              L.marker([pa.lat, pa.lon], {
                  icon: L.divIcon({
                    className: "",
                    html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:600 11px system-ui;color:#fff;background:${COLOR_PARADA};border-radius:9px;padding:1px 6px;box-shadow:0 1px 3px #0005">⏸ ${pa.minutos} min</div>`,
                    iconSize: [0, 0],
                  }),
                }).addTo(m);
            } else {
              const original = porHora.get(n.t);
              abarcar(n.lat, n.lon);
              L.circleMarker([n.lat, n.lon], { radius: 3, color: r.color, weight: 2, fillColor: r.color, fillOpacity: 1 })
                  .addTo(m)
                  .bindPopup(
                    `<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong><br>${escapar(horaLima(n.t))} · GPS del celular · ${
                      n.precision != null ? `±${Math.round(n.precision)} m` : "sin precisión"
                    }${original?.velocidad ? ` · ${escapar(original.velocidad)}` : ""}${
                      original?.bateria != null ? ` · batería ${Math.round(original.bateria)} %` : ""
                    }</div>`,
                  );
            }
          }

          if (a.primero) {
            abarcar(a.primero.lat, a.primero.lon);
            L.circleMarker([a.primero.lat, a.primero.lon], { radius: 7, color: "#ffffff", weight: 2, fillColor: COLOR_INICIO, fillOpacity: 1 })
                .addTo(m)
                .bindPopup(`<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong> · inicio del día<br>${escapar(horaLima(a.primero.t))}</div>`);
          }
          if (a.ultimo) {
            const u = a.ultimo;
            abarcar(u.lat, u.lon);
            if (u.precision != null && u.precision > 30) {
              L.circle([u.lat, u.lon], { radius: u.precision, color: r.color, weight: 1, fillOpacity: 0.08, opacity: 0.4 }).addTo(m);
            }
            L.circleMarker([u.lat, u.lon], { radius: 9, color: "#ffffff", weight: 3, fillColor: r.color, fillOpacity: 1 })
                .addTo(m)
                .bindTooltip(`${escapar(r.nombre.split(" ")[0])} · ${haceMinutos(u.t, ahora)}`, { permanent: true, direction: "top", offset: [0, -8] })
                .bindPopup(
                  `<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong> · último punto<br>${escapar(horaLima(u.t))} (${haceMinutos(u.t, ahora)}) · ${
                    u.precision != null ? `±${Math.round(u.precision)} m` : "sin precisión"
                  }</div>`,
                );
          }
        }

        // 2. Navegador (laptop): como antes, sin análisis.
        if (delNavegador.length > 1 && delGps.length === 0) {
          L.polyline(delNavegador.map((p) => [p.lat, p.lon] as [number, number]), { color: r.color, weight: 2, opacity: 0.6, dashArray: "4 4" }).addTo(m);
        }
        delNavegador.forEach((p, i) => {
          abarcar(p.lat, p.lon);
          const ultimo = delGps.length === 0 && i === delNavegador.length - 1;
          if (p.precision != null) {
            L.circle([p.lat, p.lon], { radius: p.precision, color: r.color, weight: 1, fillOpacity: 0.08, opacity: 0.4 }).addTo(m);
          }
          L.circleMarker([p.lat, p.lon], { radius: ultimo ? 7 : 4, color: r.color, weight: 2, fillColor: ultimo ? r.color : "#ffffff", fillOpacity: 1 })
              .addTo(m)
              .bindPopup(
                `<div style="font-size:12px"><strong>${escapar(r.nombre)}</strong>${ultimo ? " · último" : ""}<br>${escapar(p.hora)} · navegador · ${
                  p.precision != null ? `±${Math.round(p.precision)} m` : "sin precisión"
                }</div>`,
              );
        });
      }
      if (limites.isValid()) m.fitBounds(limites.pad(0.25), { maxZoom: 17 });
      else m.setView([-12.0464, -77.0428], 12);
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
  return (
    <div className="space-y-1.5">
      <div ref={contenedor} className="h-[380px] w-full overflow-hidden rounded-lg border border-border" />
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block size-2.5 rounded-full" style={{ backgroundColor: COLOR_INICIO }} />inicio del día</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full bg-foreground" />lectura del GPS</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full" style={{ backgroundColor: COLOR_PARADA }} />parada (5 min o más en el mismo lugar)</span>
        <span><span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: COLOR_DESCARTADO }} />lectura descartada (error de más de {PRECISION_MAX_M} m: no se une a la línea)</span>
      </p>
    </div>
  );
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
