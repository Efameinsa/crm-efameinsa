"use client";

// EL PROTOCOLO DE LOS EQUIPOS EN STOCK (0474; Lesly, 14-10: «que tenga la
// opción de subir los protocolos de equipo que son de stock»). Se abre por
// serie, se llena igual que el de un pedido (ficha, fotos, video, PDF y la hoja
// de chequeo) y, al terminarlo, pasa solo al pedido donde salga esa serie.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { archivosDelProtocoloDeStock, cabeceraDelProtocoloDeStock, crearProtocoloDeStock, terminarProtocoloDeStock } from "@/lib/acciones/protocolo-stock";
import type { FotoAlmacen } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TomarOSubirVarias, VideosDeLaPrueba } from "@/components/crm/tomar-o-subir";
import { ElegirTecnico } from "@/components/crm/lista-tecnicos";
import { NumeroDeProtocolo } from "@/components/crm/numero-de-protocolo";
import { Documentos } from "@/components/crm/informe-soporte-apertura";

const TIPOS = ["LAVADORA", "SECADORA", "CENTRIFUGA", "CALANDRA", "PLANCHADORA", "CALDERA", "ABLANDADOR"];

/** Hoy en Lima, como «aaaa-mm-dd». */
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/** Windows a veces no le pone tipo al .mov o .mp4; el bucket lo exige (0337). */
function tipoDe(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : ext === "pdf" ? "application/pdf" : "image/jpeg";
}

// Lesly, 20-10: «Subir protocolo de stock» en Mi día entra con ?nuevo=1 y el formulario ya abierto.
export function NuevoProtocoloDeStock({ abiertoAlEntrar = false }: { abiertoAlEntrar?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(abiertoAlEntrar);
  const [pendiente, startTransition] = useTransition();
  const [d, setD] = useState({ tipo: "LAVADORA", marca: "", modelo: "", capacidad: "", serie: "", protocoloRef: "", tecnico: "", fecha: hoyLima() });
  const poner = (k: keyof typeof d) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((v) => ({ ...v, [k]: x.target.value }));

  if (!abierto)
    return (
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Plus className="size-4" /> Protocolo de equipo en stock
      </Button>
    );

  return (
    <div className="basis-full space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <p className="font-semibold">Protocolo de un equipo en stock</p>
      <p className="text-xs text-muted-foreground">
        Para la máquina que se prueba en el almacén antes de venderse. Cuando esa serie salga en un pedido, el protocolo pasa solo a esa
        máquina: allí solo falta marcarla «Probada y embalada».
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs font-medium">
          Equipo
          <select value={d.tipo} onChange={poner("tipo")} className="mt-0.5 block h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Marca
          <Input value={d.marca} onChange={poner("marca")} placeholder="LG, UNIMAC…" className="mt-0.5 h-8 text-sm uppercase" />
        </label>
        <label className="text-xs font-medium">
          Modelo (de la placa)
          <Input value={d.modelo} onChange={poner("modelo")} placeholder="CWG27MDCRS" className="mt-0.5 h-8 font-mono text-sm uppercase" />
        </label>
        <label className="text-xs font-medium">
          Capacidad
          <Input value={d.capacidad} onChange={poner("capacidad")} placeholder="13 KG" className="mt-0.5 h-8 text-sm uppercase" />
        </label>
        <label className="text-xs font-medium sm:col-span-2">
          Serie (como se lee en la placa)
          <Input value={d.serie} onChange={poner("serie")} className="mt-0.5 h-8 font-mono text-sm uppercase" />
        </label>
        <label className="text-xs font-medium">
          Fecha de la prueba
          <Input type="date" value={d.fecha} max={hoyLima()} onChange={poner("fecha")} className="mt-0.5 h-8 text-sm" />
        </label>
        <label className="text-xs font-medium sm:col-span-2">
          Técnico que hizo la prueba
          <ElegirTecnico value={d.tecnico} onChange={(nombre) => setD((v) => ({ ...v, tecnico: nombre }))} className="mt-0.5" claseCampo="h-8 text-sm font-normal" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pendiente || !d.serie.trim() || !d.tipo}
          onClick={() =>
            startTransition(async () => {
              const r = await crearProtocoloDeStock(d);
              if (r.error || !r.id) return void toast.error(r.error ?? "No se pudo crear", { duration: 9000 });
              toast.success("Protocolo creado: suba las fotos y llene la hoja de chequeo");
              router.push(`/almacen/protocolos/stock/${r.id}`);
            })
          }
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Crear y seguir
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** N.º, nota, fotos, video y PDF del protocolo de stock, y darlo por terminado. */
export function PanelProtocoloDeStock({
  id,
  protocoloRef,
  nota,
  falta,
  terminado,
}: {
  id: string;
  protocoloRef: string | null;
  nota: string | null;
  falta: string[];
  terminado: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const ref = protocoloRef ?? "";
  const [texto, setTexto] = useState(nota ?? "");
  const [fotos, setFotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const cabeceraCambiada = ref.trim() !== (protocoloRef ?? "") || texto.trim() !== (nota ?? "");
  const porSubir = fotos.length + videos.length + docs.length;

  async function guardar(): Promise<string | null> {
    if (cabeceraCambiada) {
      const r = await cabeceraDelProtocoloDeStock(id, ref, texto);
      if (r.error) return r.error;
    }
    if (porSubir === 0) return null;
    const storage = createClient().storage.from("adjuntos");
    const subidas: FotoAlmacen[] = [];
    for (const file of [...fotos, ...videos, ...docs]) {
      const tipo = tipoDe(file);
      const path = `almacen/stock/${id}/protocolo-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
      // Sin tipo, el archivo viaja como octet-stream y el bucket lo rechaza: se le pone el suyo.
      const { error } = await storage.upload(path, file.type ? file : new File([file], file.name, { type: tipo }), { contentType: tipo });
      if (error) return `No se pudo subir «${file.name}»: ${error.message}`;
      subidas.push({ path, nombre: file.name.slice(0, 120), tipo: tipo.slice(0, 100), etiqueta: docs.includes(file) ? "documento" : tipo.startsWith("video/") ? "video" : "protocolo" });
    }
    const r = await archivosDelProtocoloDeStock(id, subidas);
    if (r.error) return r.error;
    setFotos([]);
    setVideos([]);
    setDocs([]);
    return null;
  }

  return (
    <div className="no-imprimir mb-4 space-y-2 rounded border border-neutral-300 bg-neutral-50 p-3 text-[12px]">
      <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
        <NumeroDeProtocolo numero={protocoloRef} className="h-8 bg-white" />
        <Input value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="Nota: probada con carga…" className="h-8 bg-white text-sm" />
      </div>
      <TomarOSubirVarias titulo="Fotos de la prueba" archivos={fotos} onChange={setFotos} maximo={100} />
      <VideosDeLaPrueba titulo="Video de la prueba (opcional)" archivos={videos} onChange={setVideos} />
      <Documentos archivos={docs} onChange={setDocs} titulo="Otro protocolo o informe (PDF o Word, opcional: el informe lo genera el sistema)" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={pendiente || (porSubir === 0 && !cabeceraCambiada)}
          onClick={() =>
            startTransition(async () => {
              const e = await guardar();
              if (e) return void toast.error(e, { duration: 9000 });
              toast.success("Guardado: ya sale en el informe");
              router.refresh();
            })
          }
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar
        </Button>
        {!terminado && (
          <Button
            size="sm"
            className="h-8"
            disabled={pendiente || (falta.length > 0 && porSubir === 0 && !cabeceraCambiada)}
            title={falta.length > 0 ? `Falta: ${falta.join(" · ")}` : undefined}
            onClick={() =>
              startTransition(async () => {
                const e = await guardar();
                if (e) return void toast.error(e, { duration: 9000 });
                const r = await terminarProtocoloDeStock(id);
                if (r.error) {
                  toast.error(r.error, { duration: 9000 });
                  router.refresh();
                  return;
                }
                toast.success(
                  r.pasoAPedido
                    ? "Protocolo terminado. La serie ya estaba en un pedido: el protocolo pasó a esa máquina."
                    : "Protocolo terminado. Cuando esta serie salga en un pedido, el protocolo pasa solo a esa máquina.",
                  { duration: 9000 },
                );
                router.refresh();
              })
            }
          >
            <Check className="size-3.5" /> Protocolo terminado
          </Button>
        )}
      </div>
      {!terminado && falta.length > 0 && (
        <div className="rounded border border-amber-400/60 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          <p className="font-semibold">Para darlo por terminado falta:</p>
          <ul className="ml-4 list-disc">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-0.5">La ficha (modelo de la placa, técnico) y la hoja de chequeo se llenan más abajo, en el mismo informe.</p>
        </div>
      )}
    </div>
  );
}
