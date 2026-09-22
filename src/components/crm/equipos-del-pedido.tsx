"use client";

// Los equipos del pedido (0260). Carlos, 21-09, con el pedido de Ecolav en
// pantalla (una lavadora con serie, una secadora sin stock, y el cliente quiere
// que salga solo la lavadora): «acá tienen que aparecer los dos equipos: en
// uno la serie, porque hay stock, y el dos sin stock… la opción de qué
// máquina, la 1 o la 2. Si doy 1, significa parcial… cada máquina tiene un
// protocolo». Esta lista es eso: una fila por unidad vendida, con su serie,
// si va en este despacho, y —para el almacén— su protocolo de prueba.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackageX, ScanBarcode } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { equipoVaEnEsteDespacho, registrarSerieDelEquipo, type EquipoDelPedido } from "@/lib/acciones/postventa";
import { probarEquipoDelPedido } from "@/lib/acciones/almacen";
import type { FotoAlmacen } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TomarOSubirVarias } from "@/components/crm/tomar-o-subir";
import { cn } from "@/lib/utils";

export function EquiposDelPedido({
  servicioId,
  equipos,
  modo,
  despachado,
  cliente,
  enlaceEquipo = "/postventa/equipos",
}: {
  servicioId: string;
  equipos: EquipoDelPedido[];
  /**
   * Postventa decide qué va; el almacén prueba y sube el protocolo; Central
   * (22-09, 0270) solo ingresa la serie que le dio el almacén al liberar el
   * pedido, sin decidir despacho ni probar nada.
   */
  modo: "postventa" | "almacen" | "central";
  despachado: boolean;
  cliente: string;
  /** null: la serie va sin enlace (Central no entra a la ficha de la máquina). */
  enlaceEquipo?: string | null;
}) {
  const van = equipos.filter((e) => e.en_este_despacho);
  const sinSerie = van.filter((e) => !e.serie).length;
  const sinProbar = van.filter((e) => !e.prueba_lista_at).length;
  const parcial = van.length < equipos.length;

  return (
    <div className={cn("rounded-lg border p-3", despachado && sinSerie > 0 ? "border-amber-400/60 bg-amber-500/5" : "border-border")}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ScanBarcode className="size-4" /> Equipos de este pedido
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {equipos.length === 1 ? "1 equipo" : `${equipos.length} equipos`}{parcial ? ` · van ${van.length}` : ""}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {equipos.length === 0
          ? "El cierre no trae líneas de venta: no hay lista que armar."
          : despachado
            ? sinSerie > 0
              ? `El pedido ya salió y ${sinSerie === 1 ? "una máquina está" : `${sinSerie} máquinas están`} sin serie: sin ella postventa no puede atender un caso.`
              : "Todas las máquinas que salieron están en el parque con su serie."
            : `Con serie = hay stock. ${
                modo === "postventa"
                  ? "Marque cuál va en este despacho; lo demás espera."
                  : modo === "central"
                    ? "Escriba la serie que le dio el almacén; sin ella, postventa no puede atender un caso de este equipo."
                    : sinProbar > 0
                      ? `Falta probar ${sinProbar === 1 ? "una máquina" : `${sinProbar} máquinas`} de las que van.`
                      : "Todo lo que va está probado."
              }`}
      </p>
      {parcial && (
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-800">
          <PackageX className="size-3.5" /> Despacho parcial: {equipos.length - van.length} equipo{equipos.length - van.length === 1 ? "" : "s"} no va{equipos.length - van.length === 1 ? "" : "n"} en esta salida.
        </p>
      )}
      <ol className="mt-2 space-y-2">
        {equipos.map((e) => (
          <Fila key={e.id} e={e} servicioId={servicioId} modo={modo} despachado={despachado} cliente={cliente} enlaceEquipo={enlaceEquipo} />
        ))}
      </ol>
    </div>
  );
}

function Fila({
  e,
  servicioId,
  modo,
  despachado,
  cliente,
  enlaceEquipo,
}: {
  e: EquipoDelPedido;
  servicioId: string;
  modo: "postventa" | "almacen" | "central";
  despachado: boolean;
  cliente: string;
  enlaceEquipo: string | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [serie, setSerie] = useState("");
  const [abrirSerie, setAbrirSerie] = useState(false);
  const [protocolo, setProtocolo] = useState("");
  const [nota, setNota] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [lineaTitulo, ...resto] = e.descripcion.split("\n");

  function correr(fn: () => Promise<{ error: string | null; pedidoListo?: boolean }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(r.pedidoListo ? "Con esta ya están todas: el pedido queda probado y embalado. Postventa ya lo sabe." : exito);
      router.refresh();
    });
  }

  async function subir(archivos: File[]): Promise<FotoAlmacen[] | null> {
    const storage = createClient().storage.from("adjuntos");
    const salida: FotoAlmacen[] = [];
    for (const file of archivos) {
      const path = `pedidos/${servicioId}/almacen/protocolo-${e.orden}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
      const { error } = await storage.upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) {
        toast.error(`No se pudo subir «${file.name}»: ${error.message}`);
        return null;
      }
      salida.push({ path, nombre: file.name.slice(0, 120), tipo: file.type.slice(0, 100), etiqueta: "protocolo" });
    }
    return salida;
  }

  const apagado = !e.en_este_despacho;
  return (
    <li className={cn("rounded-md border px-2.5 py-2", apagado ? "border-dashed border-border bg-muted/40 text-muted-foreground" : "border-border bg-card")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full bg-secondary text-[11px] font-bold">{e.orden}</span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold leading-tight", apagado && "font-medium")}>{lineaTitulo}</p>
          {resto.length > 0 && <p className="whitespace-pre-line text-[11px] leading-snug text-muted-foreground">{resto.join("\n")}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {e.serie ? (
              e.equipo_id && enlaceEquipo ? (
                <Link href={`${enlaceEquipo}/${e.equipo_id}`} className="inline-flex items-center gap-1 rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F] hover:underline">
                  Serie {e.serie} · en stock
                </Link>
              ) : (
                <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F]">Serie {e.serie}</span>
              )
            ) : (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-800">Sin serie · sin stock todavía</span>
            )}
            {e.prueba_lista_at ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium">
                <Check className="size-3" /> Probada{e.protocolo_ref ? ` · protocolo ${e.protocolo_ref}` : ""}
              </span>
            ) : e.en_este_despacho ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">Pendiente de prueba</span>
            ) : null}
            {apagado && <span className="rounded-full border border-dashed border-border px-2 py-0.5">No va en este despacho</span>}
          </div>
        </div>
        {modo === "postventa" && !despachado && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => equipoVaEnEsteDespacho(e.id, servicioId, !e.en_este_despacho), e.en_este_despacho ? "Queda fuera de este despacho" : "Va en este despacho")}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-semibold",
              e.en_este_despacho ? "border-border hover:bg-accent" : "border-primary/40 text-primary hover:bg-primary/5",
            )}
          >
            {pendiente ? <Loader2 className="size-3 animate-spin" /> : e.en_este_despacho ? "No va en este despacho" : "Sí va en este despacho"}
          </button>
        )}
      </div>

      {/* La serie: se lee en la placa (postventa o almacén). */}
      {!e.serie && (
        <div className="mt-1.5">
          {abrirSerie ? (
            <div className="flex items-center gap-1.5">
              <Input value={serie} onChange={(x) => setSerie(x.target.value)} placeholder="Serie como se lee en la placa" className="h-8 font-mono text-sm uppercase" autoFocus />
              <Button size="sm" className="h-8" disabled={pendiente || !serie.trim()} onClick={() => correr(() => registrarSerieDelEquipo(e.id, servicioId, serie), "Serie registrada: la máquina ya está en el parque")}>
                {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Registrar
              </Button>
              <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setAbrirSerie(false)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setAbrirSerie(true)}>
              + Registrar la serie (llegó el stock)
            </button>
          )}
        </div>
      )}

      {/* El almacén prueba esta máquina y sube SU protocolo. */}
      {modo === "almacen" && e.en_este_despacho && !e.prueba_lista_at && (
        <div className="mt-2 space-y-1.5 rounded-md bg-muted/40 p-2">
          <div className="grid gap-1.5 sm:grid-cols-[11rem_1fr]">
            <Input value={protocolo} onChange={(x) => setProtocolo(x.target.value)} placeholder={`N.º de protocolo (máquina ${e.orden})`} className="h-8 text-sm" />
            <Input value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Nota: probada con carga, embalada en pallet…" className="h-8 text-sm" />
          </div>
          <TomarOSubirVarias titulo="Protocolo y fotos de esta máquina" archivos={fotos} onChange={setFotos} acepta="image/*,application/pdf" />
          <Button
            size="sm"
            className="h-8"
            disabled={pendiente}
            onClick={() =>
              correr(async () => {
                const subidas = await subir(fotos);
                if (!subidas) return { error: "No se subieron los archivos" };
                return probarEquipoDelPedido(e.id, servicioId, { protocoloRef: protocolo, nota, fotos: subidas, cliente, equipo: lineaTitulo });
              }, `Máquina ${e.orden} probada y embalada`)
            }
          >
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Probada y embalada
          </Button>
        </div>
      )}
    </li>
  );
}
