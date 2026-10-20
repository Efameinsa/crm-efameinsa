"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PackageOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { crearRecepcion, pasoRecepcion, type FotoRecepcion, type LlegaPor, type MotivoRecepcion } from "@/lib/acciones/recepciones";
import { TomarOSubirVarias } from "@/components/crm/tomar-o-subir";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MOTIVOS: [MotivoRecepcion, string][] = [
  ["garantia", "Garantía"],
  ["reparacion", "Reparación"],
  ["revision", "Revisión"],
  ["otro", "Otro"],
];
const LLEGA: [LlegaPor, string][] = [
  ["cliente", "Lo trae el cliente"],
  ["agencia", "Llega por agencia"],
  ["tecnico", "Lo trae el técnico"],
  ["otro", "Otro"],
];

function Opciones<T extends string>({ valor, opciones, onChange }: { valor: T; opciones: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(([v, e]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            valor === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent",
          )}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/**
 * «EL EQUIPO VIENE A PLANTA» (0557, Brenda PV2 y gerencia 20-10): la orden de
 * recepción y revisión, desde el caso técnico. Le llega al almacén.
 */
export function RecepcionEquipoBoton({ atencionId, equipo, serie }: { atencionId: string; equipo: string | null; serie: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [eq, setEq] = useState(equipo ?? "");
  const [se, setSe] = useState(serie ?? "");
  const [motivo, setMotivo] = useState<MotivoRecepcion>("garantia");
  const [llega, setLlega] = useState<LlegaPor>("cliente");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [problema, setProblema] = useState<string | null>(null);

  function enviar() {
    setProblema(null);
    if (eq.trim().length < 3) return setProblema("Diga qué equipo llega (modelo o descripción).");
    empezar(async () => {
      const r = await crearRecepcion({ atencionId, equipo: eq, serie: se.trim() || null, motivo, llegaPor: llega, fecha: fecha || null, nota: nota.trim() || null });
      if (r.error) return void setProblema(r.error);
      toast.success("Orden de recepción enviada: el almacén ya la tiene.");
      setAbierto(false);
      if (r.id) router.push(`/recepciones/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <PackageOpen className="size-3.5" /> El equipo viene a planta
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Orden de recepción y revisión</DialogTitle>
            <DialogDescription>El almacén registra cuándo llega, lo revisa con el técnico y le avisa qué sigue: devolverlo o cotizar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rec-eq">Equipo</Label>
              <Input id="rec-eq" value={eq} onChange={(e) => setEq(e.target.value)} placeholder="Lavadora LG 13 kg" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rec-serie">Serie (si se sabe)</Label>
              <Input id="rec-serie" value={se} onChange={(e) => setSe(e.target.value)} className="font-mono uppercase" />
            </div>
            <div className="grid gap-1.5">
              <Label>Por qué llega</Label>
              <Opciones valor={motivo} opciones={MOTIVOS} onChange={setMotivo} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cómo llega</Label>
              <Opciones valor={llega} opciones={LLEGA} onChange={setLlega} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rec-fecha">Cuándo llega (aprox.)</Label>
              <Input id="rec-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rec-nota">Qué revisar</Label>
              <Textarea id="rec-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: no centrifuga, error E3" />
            </div>
            {problema && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{problema}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={pendiente}>
                {pendiente && <Loader2 className="size-4 animate-spin" />} Enviar al almacén
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function subirFotos(id: string, archivos: File[]): Promise<{ fotos: FotoRecepcion[]; error: string | null }> {
  const storage = createClient().storage.from("adjuntos");
  const fotos: FotoRecepcion[] = [];
  for (const f of archivos) {
    const path = `recepciones/${id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
    const { error } = await storage.upload(path, f, { contentType: f.type || "image/jpeg" });
    if (error) return { fotos, error: `No se pudo subir «${f.name}»: ${error.message}` };
    fotos.push({ path, nombre: f.name, tipo: f.type || "image/jpeg" });
  }
  return { fotos, error: null };
}

/** El paso que sigue de la orden, para el almacén (o postventa al final). */
export function PasoRecepcion({ id, paso }: { id: string; paso: "recibido" | "revisado" | "listo" }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [nota, setNota] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [repuestos, setRepuestos] = useState("");
  const [resultado, setResultado] = useState<"devolver" | "cotizar" | "otro">("devolver");
  const [problema, setProblema] = useState<string | null>(null);

  function enviar() {
    setProblema(null);
    if (paso === "recibido" && archivos.length === 0) return setProblema("Suba al menos una foto de cómo llegó el equipo.");
    if (paso === "revisado" && diagnostico.trim().length < 5) return setProblema("Escriba el diagnóstico.");
    empezar(async () => {
      const subida = archivos.length ? await subirFotos(id, archivos) : { fotos: [], error: null };
      if (subida.error) return void setProblema(subida.error);
      const r = await pasoRecepcion({ id, paso, nota, fotos: subida.fotos, tecnico, diagnostico, repuestos, resultado });
      if (r.error) return void setProblema(r.error);
      toast.success("Registrado. Postventa ya recibió el aviso.");
      setArchivos([]);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-foreground">
        {paso === "recibido" ? "Registrar que el equipo llegó" : paso === "revisado" ? "Registrar la revisión" : "¿Qué sigue con el equipo?"}
      </p>
      {paso === "revisado" && (
        <>
          <Input placeholder="Técnico que lo revisó" value={tecnico} onChange={(e) => setTecnico(e.target.value)} />
          <Textarea rows={3} placeholder="Diagnóstico" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
          <Input placeholder="Repuestos que necesita (si aplica)" value={repuestos} onChange={(e) => setRepuestos(e.target.value)} />
        </>
      )}
      {paso === "listo" && (
        <Opciones
          valor={resultado}
          opciones={[
            ["devolver", "Devolver al cliente"],
            ["cotizar", "Cotizar la reparación"],
            ["otro", "Otro"],
          ]}
          onChange={setResultado}
        />
      )}
      {paso !== "listo" && (
        <TomarOSubirVarias titulo={paso === "recibido" ? "Fotos de cómo llegó (placa, golpes, accesorios)" : "Fotos de la revisión"} archivos={archivos} onChange={setArchivos} />
      )}
      <Textarea rows={2} placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      {problema && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{problema}</p>}
      <div className="flex justify-end">
        <Button onClick={enviar} disabled={pendiente}>
          {pendiente && <Loader2 className="size-4 animate-spin" />} Guardar
        </Button>
      </div>
    </div>
  );
}
