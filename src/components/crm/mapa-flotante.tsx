"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { MapaLienzo } from "@/components/crm/mapa-lienzo";
import { cargarMapa } from "@/lib/acciones/mapa";
import type { RutaMapa, TipoRuta } from "@/lib/mapa-recorrido";
import type { ApurosMapa } from "@/lib/mapa-recorrido-datos";

/** Pide abrir el mapa encima de la pantalla actual (lo usa el aviso del «Apurar»). */
export function abrirMapaFlotante(url: string): boolean {
  const m = /#mapa=(\w+):([\w-]+)/.exec(url);
  if (!m) return false;
  window.dispatchEvent(new CustomEvent("crm:abrir-mapa", { detail: { tipo: m[1], id: m[2] } }));
  return true;
}

/**
 * El mapa en una ventana sobre lo que la persona estaba haciendo (Santos,
 * 23-10): no cambia de página ni pierde lo que tenía a medio escribir; lo
 * cierra y sigue, o entra a la ficha desde el panel del paso.
 */
export function MapaFlotante() {
  const ruta = usePathname();
  const [datos, setDatos] = useState<{ rutas: RutaMapa[]; apuros: ApurosMapa; inicial: number } | null>(null);
  useEffect(() => {
    const abrir = async (ev: Event) => {
      const { tipo, id } = (ev as CustomEvent<{ tipo: TipoRuta; id: string }>).detail;
      const r = await cargarMapa(tipo, id).catch(() => null);
      if (!r) {
        toast.error("No se pudo abrir el mapa de este recorrido.");
        return;
      }
      setDatos({ ...r, inicial: Math.max(0, r.rutas.findIndex((x) => x.tipo === tipo && x.id === id)) });
    };
    window.addEventListener("crm:abrir-mapa", abrir);
    return () => window.removeEventListener("crm:abrir-mapa", abrir);
  }, []);
  if (!datos) return null;
  return <MapaLienzo rutas={datos.rutas} apuros={datos.apuros} ruta={ruta} abierto alCambiar={(v) => !v && setDatos(null)} inicial={datos.inicial} />;
}
