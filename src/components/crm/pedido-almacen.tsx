"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Check, Loader2, PackageCheck, Truck, FileCheck2, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { marcarProbado, confirmarListo, registrarSalida, registrarAgencia } from "@/lib/acciones/almacen";
import type { FotoAlmacen, ServicioPostventa } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Lo que el almacén hace con un pedido, en el orden en que pasa (0246).
 *
 * Carlos, 16-09: «postventa dice "prueba la máquina" → almacén prueba, sube
 * su protocolo y le da un check → postventa programa el despacho → almacén
 * confirma que está listo (de repente tengo que contratar un montacarga) →
 * despacha: 5 fotos, 5 ángulos, y un video → llega a la agencia y sube la
 * guía y la máquina → postventa da el doble check».
 *
 * Cada tarjeta aparece cuando le toca y desaparece cuando ya está: la
 * pantalla lee como una lista de lo que falta, no como un formulario.
 */
const ANGULOS: { etiqueta: string; titulo: string }[] = [
  { etiqueta: "frente", titulo: "Frente" },
  { etiqueta: "lateral_izq", titulo: "Lateral izquierdo" },
  { etiqueta: "lateral_der", titulo: "Lateral derecho" },
  { etiqueta: "posterior", titulo: "Posterior" },
  { etiqueta: "arriba", titulo: "Arriba" },
];

type Archivos = Record<string, File | null>;

export function PedidoAlmacen({ servicio }: { servicio: ServicioPostventa }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const cliente = (servicio.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const probado = servicio.prueba_lista_at != null || String(servicio.prueba_embalaje ?? "").toUpperCase() === "SI";
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  // Probar y embalar
  const [protocolo, setProtocolo] = useState(servicio.protocolo_prueba_ref ?? "");
  const [notaPrueba, setNotaPrueba] = useState("");
  const [fotosProtocolo, setFotosProtocolo] = useState<File[]>([]);
  // Listo
  const [notaListo, setNotaListo] = useState("");
  // Salida
  const [fechaSalida, setFechaSalida] = useState(servicio.fecha_despacho ?? hoy);
  const [angulos, setAngulos] = useState<Archivos>({});
  const [video, setVideo] = useState<File | null>(null);
  const [notaSalida, setNotaSalida] = useState("");
  // Agencia
  const [transportista, setTransportista] = useState(servicio.transportista ?? "");
  const [guia, setGuia] = useState(servicio.guia ?? "");
  const [recibe, setRecibe] = useState("");
  const [fotoGuia, setFotoGuia] = useState<File | null>(null);
  const [fotoMaquina, setFotoMaquina] = useState<File | null>(null);

  async function subir(archivos: { file: File; etiqueta: string }[]): Promise<FotoAlmacen[] | null> {
    const storage = createClient().storage.from("adjuntos");
    const salida: FotoAlmacen[] = [];
    for (const { file, etiqueta } of archivos) {
      const path = `pedidos/${servicio.id}/almacen/${etiqueta}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
      const { error } = await storage.upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) {
        toast.error(`No se pudo subir «${file.name}»: ${error.message}`);
        return null;
      }
      salida.push({ path, nombre: file.name.slice(0, 120), tipo: file.type.slice(0, 100), etiqueta });
    }
    return salida;
  }

  function correr(fn: () => Promise<{ error: string | null }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(exito);
      router.refresh();
    });
  }

  const salidaLista = ANGULOS.filter((a) => angulos[a.etiqueta]).length >= 3;
  const puedeSalir = Boolean(servicio.apertura_despacho_at) || !servicio.informe_cierre_id;

  return (
    <div className="space-y-3">
      {/* 1 · Probar y embalar */}
      {!probado && (
        <Tarjeta icono={FileCheck2} titulo="Probar y embalar" tono={servicio.prueba_solicitada_at ? "activa" : "normal"}>
          <p className="text-xs text-muted-foreground">
            {servicio.prueba_solicitada_at
              ? "Postventa pidió la prueba. Pruebe la máquina, suba el protocolo (foto o PDF) y marque."
              : "Postventa todavía no pidió la prueba; se puede adelantar."}
          </p>
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <div className="grid gap-1">
              <Label className="text-xs">N.º de protocolo</Label>
              <Input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="ej. PROT-2026-045" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Nota</Label>
              <Input value={notaPrueba} onChange={(e) => setNotaPrueba(e.target.value)} placeholder="ej. probada con carga, embalada en pallet" />
            </div>
          </div>
          <SelectorArchivos etiqueta="Protocolo y fotos de la prueba" multiple archivos={fotosProtocolo} onChange={setFotosProtocolo} acepta="image/*,application/pdf" />
          <Button
            size="sm"
            disabled={pendiente}
            onClick={() =>
              correr(async () => {
                const fotos = await subir(fotosProtocolo.map((f) => ({ file: f, etiqueta: "protocolo" })));
                if (!fotos) return { error: "No se subieron los archivos" };
                return marcarProbado(servicio.id, { protocoloRef: protocolo, fotos, nota: notaPrueba, cliente });
              }, "Marcado como probado y embalado. Postventa ya lo sabe.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Probado y embalado
          </Button>
        </Tarjeta>
      )}

      {/* 2 · Listo para el despacho programado */}
      {probado && servicio.fecha_despacho && !servicio.despachado_at && !servicio.almacen_listo_at && (
        <Tarjeta icono={Warehouse} titulo={`Despacho programado para el ${servicio.fecha_despacho}`} tono="activa">
          <p className="text-xs text-muted-foreground">
            Confirme que el almacén está listo (montacarga, embalaje, personal). Postventa se entera al toque.
            {servicio.despacho_nota ? ` Nota de postventa: ${servicio.despacho_nota}.` : ""}
          </p>
          <Input value={notaListo} onChange={(e) => setNotaListo(e.target.value)} placeholder="ej. montacarga contratado para las 3 pm" />
          <Button size="sm" disabled={pendiente} onClick={() => correr(() => confirmarListo(servicio.id, { nota: notaListo, cliente, fecha: servicio.fecha_despacho ?? null }), "Confirmado: almacén listo.")}>
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Estamos listos
          </Button>
        </Tarjeta>
      )}

      {/* 3 · La salida */}
      {probado && !servicio.despachado_at && (
        <Tarjeta icono={Truck} titulo="Registrar la salida" tono={puedeSalir ? "activa" : "bloqueada"}>
          {!puedeSalir ? (
            <p className="text-xs text-destructive">Sin apertura de despacho no sale nada del almacén. Pídasela a postventa.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Cinco ángulos y un video al terminar de cargar. Mínimo tres fotos para registrar.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ANGULOS.map((a) => (
              <label key={a.etiqueta} className={cn("flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs", angulos[a.etiqueta] ? "border-[#1E7F4F]/50 bg-[#1E7F4F]/5" : "border-border hover:bg-accent")}>
                <Camera className="size-3.5 flex-none" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.titulo}</span>
                  <span className="line-clamp-1 break-words text-[11px] text-muted-foreground">{angulos[a.etiqueta]?.name ?? "Tomar foto"}</span>
                </span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setAngulos((x) => ({ ...x, [a.etiqueta]: e.target.files?.[0] ?? null }))} />
              </label>
            ))}
            <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs", video ? "border-[#1E7F4F]/50 bg-[#1E7F4F]/5" : "border-border hover:bg-accent")}>
              <Camera className="size-3.5 flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Video</span>
                <span className="line-clamp-1 break-words text-[11px] text-muted-foreground">{video?.name ?? "Grabar (corto)"}</span>
              </span>
              <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div className="grid gap-1">
              <Label className="text-xs">Fecha de salida</Label>
              <Input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Nota</Label>
              <Input value={notaSalida} onChange={(e) => setNotaSalida(e.target.value)} placeholder="ej. salió en la camioneta de la empresa a las 4 pm" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pendiente || !puedeSalir || !salidaLista}
            title={!salidaLista ? "Faltan fotos (mínimo 3)" : undefined}
            onClick={() =>
              correr(async () => {
                const archivos = [
                  ...ANGULOS.filter((a) => angulos[a.etiqueta]).map((a) => ({ file: angulos[a.etiqueta]!, etiqueta: a.etiqueta })),
                  ...(video ? [{ file: video, etiqueta: "video" }] : []),
                ];
                const fotos = await subir(archivos);
                if (!fotos) return { error: "No se subieron los archivos" };
                return registrarSalida(servicio.id, { fecha: fechaSalida, fotos, nota: notaSalida, cliente });
              }, "Salida registrada. Falta la guía en la agencia.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
            Salió del almacén
          </Button>
        </Tarjeta>
      )}

      {/* 4 · En la agencia (o en el cliente) */}
      {servicio.despachado_at && !servicio.agencia_at && (
        <Tarjeta icono={PackageCheck} titulo="En la agencia o en el cliente" tono="activa">
          <p className="text-xs text-muted-foreground">
            La guía de remisión es lo que el cliente necesita para recoger. Foto de la guía y foto de la máquina entregada.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs">Agencia o transportista</Label>
              <Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="ej. Shalom, Marvisur, camioneta propia" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">N.º de guía de remisión <span className="text-destructive">*</span></Label>
              <Input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="ej. T001-0004567" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Quién recibió</Label>
              <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder="nombre en la agencia o en el cliente" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs", fotoGuia ? "border-[#1E7F4F]/50 bg-[#1E7F4F]/5" : "border-border hover:bg-accent")}>
              <Camera className="size-3.5 flex-none" />
              <span className="min-w-0 flex-1"><span className="block font-medium">Foto de la guía</span><span className="line-clamp-1 break-words text-[11px] text-muted-foreground">{fotoGuia?.name ?? "Tomar foto"}</span></span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFotoGuia(e.target.files?.[0] ?? null)} />
            </label>
            <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs", fotoMaquina ? "border-[#1E7F4F]/50 bg-[#1E7F4F]/5" : "border-border hover:bg-accent")}>
              <Camera className="size-3.5 flex-none" />
              <span className="min-w-0 flex-1"><span className="block font-medium">Foto de la máquina entregada</span><span className="line-clamp-1 break-words text-[11px] text-muted-foreground">{fotoMaquina?.name ?? "Tomar foto"}</span></span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFotoMaquina(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button
            size="sm"
            disabled={pendiente || !guia.trim()}
            onClick={() =>
              correr(async () => {
                const fotos = await subir([
                  ...(fotoGuia ? [{ file: fotoGuia, etiqueta: "guia" }] : []),
                  ...(fotoMaquina ? [{ file: fotoMaquina, etiqueta: "maquina" }] : []),
                ]);
                if (!fotos) return { error: "No se subieron las fotos" };
                return registrarAgencia(servicio.id, { transportista, guia, fotos, recibe, cliente });
              }, "Entrega registrada con su guía. Postventa da el doble check.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
            Entregado con guía
          </Button>
        </Tarjeta>
      )}

      {servicio.agencia_at && (
        <div className="rounded-xl border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 p-4 text-sm text-[#1E7F4F]">
          <Check className="mr-1 inline size-4" />
          Despachado con guía {servicio.guia}. {servicio.despacho_verificado_at ? "Postventa ya lo verificó." : "Falta el doble check de postventa."}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ icono: Icono, titulo, tono, children }: { icono: typeof Truck; titulo: string; tono: "activa" | "normal" | "bloqueada"; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-2.5 rounded-xl border p-4 shadow-sm", tono === "activa" ? "border-primary/40 bg-primary/5" : tono === "bloqueada" ? "border-border bg-secondary/40" : "border-border bg-card")}>
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icono className="size-4 text-primary" /> {titulo}
      </p>
      {children}
    </div>
  );
}

function SelectorArchivos({ etiqueta, archivos, onChange, multiple = false, acepta = "image/*" }: { etiqueta: string; archivos: File[]; onChange: (f: File[]) => void; multiple?: boolean; acepta?: string }) {
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
        <Camera className="size-3.5" /> {etiqueta}
        <input
          type="file"
          accept={acepta}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            const nuevos = Array.from(e.target.files ?? []);
            onChange([...archivos, ...nuevos].slice(0, 10));
            e.target.value = "";
          }}
        />
      </label>
      {archivos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {archivos.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px]">
              {f.name.length > 24 ? f.name.slice(0, 21) + "…" : f.name}
              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(archivos.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
