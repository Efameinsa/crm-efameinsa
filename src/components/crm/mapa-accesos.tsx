"use client";

import { useEffect, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Dónde están las laptops.
 *
 * Un punto por lugar desde el que se entró al CRM, con quién entró desde ahí y
 * cuándo. El propósito es el que dijo Carlos: los equipos son de la empresa y
 * se los llevan, así que saber desde dónde se gestiona es saber dónde está el
 * equipo.
 *
 * LEAFLET A MANO Y NO react-leaflet. El componente de React trae su propio
 * árbol y su ciclo de vida, y acá el mapa se dibuja una vez con puntos que ya
 * vienen calculados del servidor: montar la librería directa es menos código y
 * menos cosas que se pueden desincronizar.
 *
 * EL RADIO NO ES ADORNO. Se dibuja un círculo, no un alfiler, porque una IP
 * ubica a la central del proveedor y no a la persona: pintar un punto exacto
 * haría creer que sabemos la calle. El círculo dice, sin explicar nada, «es por
 * acá».
 */

export interface PuntoAcceso {
  lat: number;
  lon: number;
  /** «Vitarte, Lima region, Perú» */
  lugar: string;
  proveedor: string | null;
  ip: string;
  /** Quiénes entraron desde este lugar, con su último ingreso. */
  personas: { nombre: string; cuando: string }[];
  /** La oficina se pinta distinta: es el punto de referencia de todo lo demás. */
  esOficina: boolean;
}

export function MapaAccesos({ puntos }: { puntos: PuntoAcceso[] }) {
  const contenedor = useRef<HTMLDivElement>(null);

  // Sin esto, dos renders seguidos con los mismos datos vuelven a dibujar todo.
  const clave = useMemo(() => puntos.map((p) => `${p.ip}:${p.personas.length}`).join("|"), [puntos]);

  useEffect(() => {
    if (!contenedor.current || puntos.length === 0) return;
    let mapa: import("leaflet").Map | null = null;
    let vivo = true;

    // Leaflet SE IMPORTA ACÁ ADENTRO, no arriba del archivo. Un componente de
    // cliente igual se renderiza en el servidor para el primer HTML, y la
    // librería toca `window` al cargarse: importándola arriba, la pantalla
    // entera se caía con «window is not defined». Dentro del efecto solo corre
    // en el navegador.
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !contenedor.current) return;

      const m = L.map(contenedor.current, { scrollWheelZoom: false, attributionControl: true });
      mapa = m;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap",
      }).addTo(m);

      const capas: import("leaflet").Layer[] = [];
      for (const p of puntos) {
        const color = p.esOficina ? "#1E7F4F" : "#7E1210";
        const circulo = L.circleMarker([p.lat, p.lon], {
          radius: Math.min(9 + p.personas.length * 2, 20),
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.25,
        }).addTo(m);
        const quienes = p.personas
          .slice(0, 8)
          .map((x) => `<div>${escapar(x.nombre)} <span style="color:#6b7280">· ${escapar(x.cuando)}</span></div>`)
          .join("");
        circulo.bindPopup(
          `<div style="font-size:12px;line-height:1.45">
             <strong>${escapar(p.lugar)}</strong>${p.esOficina ? " <span style='color:#1E7F4F'>· oficina</span>" : ""}
             <div style="color:#6b7280">${escapar(p.proveedor ?? "proveedor no identificado")} · ${escapar(p.ip)}</div>
             <div style="margin-top:6px">${quienes}</div>
             ${p.personas.length > 8 ? `<div style="color:#6b7280">y ${p.personas.length - 8} más</div>` : ""}
           </div>`,
        );
        capas.push(circulo);
      }

      m.fitBounds(L.featureGroup(capas).getBounds().pad(0.35), { maxZoom: 12 });
    })();

    return () => {
      vivo = false;
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume los puntos
  }, [clave]);

  if (puntos.length === 0) {
    return (
      <p className="max-w-prose text-sm text-muted-foreground">
        Todavía no hay ingresos con ubicación conocida. Aparecen acá en cuanto alguien entre desde una conexión que se
        pueda ubicar — las de la red interna de la oficina no salen a consultarse.
      </p>
    );
  }

  return (
    <div>
      <div ref={contenedor} className="h-[380px] w-full overflow-hidden rounded-lg border border-border" />
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-2 border-[#1E7F4F] bg-[#1E7F4F]/25" /> oficina
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-2 border-[#7E1210] bg-[#7E1210]/25" /> otra
          conexión
        </span>
        <span>El círculo crece con la cantidad de personas que entraron desde ahí.</span>
      </p>
    </div>
  );
}

/** El popup se arma como HTML: lo que venga de la base se escapa. */
function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
