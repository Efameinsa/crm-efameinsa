"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { anularApertura, revisarApertura, subirInformeApertura, tomarApertura } from "@/lib/acciones/aperturas-llamada";
import type { EstadoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TomarOSubirVarias } from "@/components/crm/tomar-o-subir";

/** Lo que hace el almacén: el check y su informe (versión 1). */
export function AccionesAlmacenApertura({ id, estado, tecnicoInicial }: { id: string; estado: EstadoApertura; tecnicoInicial: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [tecnico, setTecnico] = useState(tecnicoInicial ?? "");
  const [informe, setInforme] = useState("");
  const [faltantes, setFaltantes] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);

  function tomar() {
    startTransition(async () => {
      const r = await tomarApertura(id, tecnico);
      if (r.error) return void toast.error(r.error);
      toast.success("Tomada: postventa ya ve que el almacén la está gestionando");
      router.refresh();
    });
  }

  function subir() {
    startTransition(async () => {
      const subidas: { path: string; nombre: string; tipo: string; tamano: number }[] = [];
      if (fotos.length) {
        const storage = createClient().storage.from("adjuntos");
        for (const f of fotos) {
          const path = `aperturas/${id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
          const { error } = await storage.upload(path, f, { contentType: f.type || "image/jpeg" });
          if (error) return void toast.error(`No se pudo subir «${f.name}»: ${error.message}`);
          subidas.push({ path, nombre: f.name, tipo: f.type, tamano: f.size });
        }
      }
      const r = await subirInformeApertura({ id, informe, faltantes, tecnico, fotos: subidas });
      if (r.error) return void toast.error(r.error);
      toast.success("Informe subido: postventa recibe el aviso para revisarlo");
      setFotos([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {estado === "enviada" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="grid min-w-[200px] flex-1 gap-1">
            <Label className="text-xs">Técnico que hará la llamada</Label>
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Nombre del técnico" />
          </div>
          <Button onClick={tomar} disabled={pendiente}>
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            La tomo: ya la estoy gestionando
          </Button>
        </div>
      )}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold text-foreground">Informe de la llamada (lo que vio el almacén)</p>
        <div className="grid gap-1">
          <Label className="text-xs">
            Qué se vio <span className="text-destructive">*</span>
          </Label>
          <Textarea rows={5} value={informe} onChange={(e) => setInforme(e.target.value)} placeholder="Área, puntos de agua, desagüe, energía, gas, medidas…" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Lo que le falta al cliente (para cotizar)</Label>
          <Textarea rows={3} value={faltantes} onChange={(e) => setFaltantes(e.target.value)} placeholder="Uno por línea: válvula de gas, manguera, regulador, manómetro…" />
        </div>
        {estado !== "enviada" && (
          <div className="grid gap-1">
            <Label className="text-xs">Técnico</Label>
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} />
          </div>
        )}
        <TomarOSubirVarias titulo="Fotos o capturas de la llamada" archivos={fotos} onChange={setFotos} />
        <Button onClick={subir} disabled={pendiente || !informe.trim()}>
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          Subir el informe a postventa
        </Button>
      </div>
    </div>
  );
}

/** Lo que hace postventa: la versión para el cliente (versión 2) y anular. */
export function AccionesPostventaApertura({
  id,
  estado,
  borrador,
  hayInforme,
}: {
  id: string;
  estado: EstadoApertura;
  borrador: string;
  hayInforme: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [texto, setTexto] = useState(borrador);
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  function revisar(enviada: boolean) {
    startTransition(async () => {
      const r = await revisarApertura(id, texto, enviada);
      if (r.error) return void toast.error(r.error);
      toast.success(enviada ? "Listo: queda como enviada al cliente" : "Revisión guardada: ya se puede imprimir para el cliente");
      router.refresh();
    });
  }
  function anular() {
    startTransition(async () => {
      const r = await anularApertura(id, motivo);
      if (r.error) return void toast.error(r.error);
      toast.success("Apertura anulada; el almacén ya no la ve pendiente");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {hayInforme && estado !== "anulada" && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold text-foreground">Versión para el cliente</p>
          <p className="text-xs text-muted-foreground">
            Parte del informe del almacén. Corrija lo que no deba leer el cliente; esto es lo que sale en la hoja para imprimir o guardar en PDF.
          </p>
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => revisar(false)} disabled={pendiente || !texto.trim()}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Guardar la revisión
            </Button>
            {estado !== "enviada_cliente" && (
              <Button onClick={() => revisar(true)} disabled={pendiente || !texto.trim()}>
                <Send className="size-4" /> Guardar y marcar enviada al cliente
              </Button>
            )}
          </div>
        </div>
      )}
      {estado !== "anulada" && estado !== "enviada_cliente" && (
        <div className="text-xs">
          {!anulando ? (
            <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAnulando(true)}>
              Anular esta apertura
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-8 max-w-sm text-xs" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula (el cliente reprogramó, se pidió dos veces…)" />
              <Button size="sm" variant="destructive" disabled={pendiente || !motivo.trim()} onClick={anular}>
                Anular
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAnulando(false)}>
                No
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
