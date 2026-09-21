"use client";

// «Mandar equipo» en la bandeja de WhatsApp (Santos, 17-09-2026): en vez de
// mandar fotos sueltas y PDFs, el comercial busca el equipo por nombre,
// capacidad o marca, marca uno o varios, y lo manda como FICHA (foto + ficha
// técnica + botones «Me interesa / Pedir cotización / Ver otra opción», SIN
// precio) o, si el catálogo de Meta está conectado, como producto del
// catálogo (CON el precio de lista). Lo que el cliente toque vuelve al hilo
// y queda anotado sobre qué máquina respondió.

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Package, Search, X } from "lucide-react";
import { mandarEquipoChat, equiposParaMandar, type EquipoParaMandar } from "@/lib/acciones/whatsapp-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const normalizar = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function WhatsappMandarEquipo({
  conversacionId,
  catalogoConectado,
  onEnviado,
  onCerrar,
}: {
  conversacionId: string;
  catalogoConectado: boolean;
  onEnviado: () => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [enviando, startTransition] = useTransition();
  // El catálogo se pide al abrir este panel, no al abrir el chat (Santos,
  // 21-09: «esos productos se demoran bastante en cargar»). Una sola vez
  // por apertura; mientras llega, el buscador dice que está cargando.
  const [catalogo, setCatalogo] = useState<EquipoParaMandar[] | null>(null);
  useEffect(() => {
    let vigente = true;
    equiposParaMandar()
      .then((xs) => vigente && setCatalogo(xs))
      .catch(() => vigente && setCatalogo([]));
    return () => {
      vigente = false;
    };
  }, []);
  const equipos = useMemo(() => catalogo ?? [], [catalogo]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return equipos;
    const palabras = q.split(/\s+/);
    return equipos.filter((e) => {
      const pajar = normalizar(`${e.marca} ${e.modelo} ${e.nombre} ${e.categoria} ${e.capacidad ?? ""} ${e.sku} ${e.segmento ?? ""}`);
      return palabras.every((p) => pajar.includes(p));
    });
  }, [busqueda, equipos]);

  const elegidosDetalle = elegidos.map((sku) => equipos.find((e) => e.sku === sku)).filter((e): e is EquipoParaMandar => !!e);

  function alternar(sku: string) {
    setElegidos((xs) => (xs.includes(sku) ? xs.filter((x) => x !== sku) : [...xs, sku]));
  }

  function mandar(modo: "ficha" | "catalogo") {
    if (elegidos.length === 0) return;
    startTransition(async () => {
      const r = await mandarEquipoChat(conversacionId, elegidos, modo, nota);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(elegidos.length === 1 ? "Equipo enviado" : `${elegidos.length} equipos enviados`);
      setElegidos([]);
      setNota("");
      onEnviado();
    });
  }

  return (
    <div className="absolute bottom-full left-0 z-20 mb-1 flex max-h-[70vh] w-[min(34rem,calc(100vw-2rem))] flex-col rounded-lg border border-border bg-card shadow-xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Package className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Mandar equipo</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {catalogo === null ? "Cargando el catálogo…" : `${equipos.length} en el catálogo del CRM`}
        </span>
        <button type="button" onClick={onCerrar} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      <div className="relative px-3 pt-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 mt-1 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Busque por marca, modelo, capacidad… ej. «LG 17», «secadora 30», «Primus»"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {catalogo === null && (
          <li className="flex items-center justify-center gap-1.5 px-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Cargando el catálogo…
          </li>
        )}
        {catalogo !== null && filtrados.length === 0 && (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">Ningún equipo coincide con «{busqueda}».</li>
        )}
        {filtrados.map((e) => {
          const marcado = elegidos.includes(e.sku);
          return (
            <li key={e.sku}>
              <button
                type="button"
                onClick={() => alternar(e.sku)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary",
                  marcado && "bg-primary/10 ring-1 ring-primary/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- foto del catálogo del CRM */}
                <img src={e.fotoUrl} alt="" className="size-10 shrink-0 rounded border border-border bg-white object-contain" loading="lazy" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-medium">
                    {e.marca} {e.modelo}
                    {e.capacidad && <span className="font-normal text-muted-foreground"> · {e.capacidad}</span>}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                    {e.categoria}
                    {e.segmento && ` · ${e.segmento.replace("_", " ")}`} · {e.sku}
                  </span>
                </span>
                <span className={cn("size-4 shrink-0 rounded border", marcado ? "border-primary bg-primary" : "border-border")} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 border-t border-border p-3">
        {elegidosDetalle.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {elegidosDetalle.map((e) => (
              <span key={e.sku} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                {e.marca} {e.modelo}
                <button type="button" onClick={() => alternar(e.sku)} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${e.modelo}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Una línea suya para el cliente (opcional): «Esta es la que le conviene para 20 kg/día»" className="h-8 text-sm" maxLength={300} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => mandar("ficha")} disabled={enviando || elegidos.length === 0 || elegidos.length > 3} title="Foto + ficha técnica + botones. Sin precio.">
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Package className="size-3.5" />}
            Mandar ficha{elegidos.length > 1 ? ` (${elegidos.length})` : ""} · sin precio
          </Button>
          {catalogoConectado && (
            <Button size="sm" variant="outline" onClick={() => mandar("catalogo")} disabled={enviando || elegidos.length === 0} title="Producto del catálogo de Meta. Muestra el precio de lista.">
              Del catálogo{elegidos.length > 1 ? ` (lista de ${elegidos.length})` : ""} · con precio
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">
            {elegidos.length > 3 ? "Como ficha van hasta 3 por vez." : "El cliente ve foto, ficha y tres botones para responder."}
          </span>
        </div>
      </div>
    </div>
  );
}
