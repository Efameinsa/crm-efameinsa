"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { crearCasoCentral } from "@/lib/acciones/casos-central";
import { AREAS_CASO, type AdjuntoCaso, type AreaCaso } from "@/lib/casos-central";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Sube los archivos de un caso al bucket 'adjuntos', bajo
 * casos-central/<usuario>/ (la acción rechaza cualquier otra ruta).
 */
export async function subirArchivosCaso(archivos: File[]): Promise<{ adjuntos: AdjuntoCaso[]; error: string | null }> {
  if (!archivos.length) return { adjuntos: [], error: null };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { adjuntos: [], error: "Su sesión venció: vuelva a entrar." };
  const adjuntos: AdjuntoCaso[] = [];
  for (const archivo of archivos) {
    if (archivo.size > 15 * 1024 * 1024) return { adjuntos: [], error: `«${archivo.name}» pesa más de 15 MB.` };
    const path = `casos-central/${user.id}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
    const { error } = await supabase.storage.from("adjuntos").upload(path, archivo, { contentType: archivo.type || "application/octet-stream" });
    if (error) return { adjuntos: [], error: `No se pudo subir «${archivo.name}». Quítelo o intente de nuevo.` };
    adjuntos.push({ path, nombre: archivo.name, tipo: archivo.type, tamano: archivo.size });
  }
  return { adjuntos, error: null };
}

/** Elegir archivos y verlos como chips quitables. */
export function ElegirArchivos({ archivos, onChange, id }: { archivos: File[]; onChange: (a: File[]) => void; id: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {archivos.map((a, i) => (
        <span key={`${a.name}-${i}`} className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs">
          <span className="truncate">{a.name}</span>
          <button type="button" aria-label={`Quitar ${a.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(archivos.filter((_, j) => j !== i))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Paperclip className="size-3" /> Adjuntar archivo
      </button>
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        className="hidden"
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        onChange={(e) => {
          const nuevos = Array.from(e.target.files ?? []);
          onChange([...archivos, ...nuevos].slice(0, 10));
          e.target.value = "";
        }}
      />
    </div>
  );
}

type Plazo = "normal" | "urgente" | "fecha";

/**
 * «Derivar a un área» (0573, Santos 21-10). Central abre un caso para
 * Finanzas o Facturación desde la ficha del cliente o desde el pedido. El
 * cliente, el pedido y quién lo deriva van solos; Central escribe qué
 * necesita. RR. HH. aparece apagada hasta que tenga cuenta en el CRM.
 */
export function DerivarAAreaBoton({
  cuentaId,
  servicioId,
  leadId,
  mensajeInicial,
  etiqueta = "Derivar a un área",
  cliente,
  referencia,
  compacto,
}: {
  cuentaId?: string | null;
  servicioId?: string | null;
  /** Un contacto de la bandeja (0575): al derivarlo sale de la bandeja. */
  leadId?: string | null;
  /** Lo que dijo el cliente, para no volver a escribirlo. */
  mensajeInicial?: string | null;
  etiqueta?: string;
  cliente: string;
  /** Lo que se lee arriba del diálogo: «Pedido PED-0412-2026». */
  referencia?: string | null;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [area, setArea] = useState<AreaCaso>("finanzas");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState(mensajeInicial?.trim() ?? "");
  const [plazo, setPlazo] = useState<Plazo>("normal");
  const [fecha, setFecha] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const def = AREAS_CASO.find((a) => a.valor === area)!;
  const falta = !motivo
    ? "Elija el motivo."
    : mensaje.trim().length < 5
      ? "Escriba qué necesita que hagan."
      : plazo === "fecha" && !fecha
        ? "Elija la fecha."
        : null;

  function limpiarTodo() {
    setMotivo(null);
    setMensaje(mensajeInicial?.trim() ?? "");
    setPlazo("normal");
    setFecha("");
    setArchivos([]);
    setProblema(null);
  }

  function enviar() {
    if (falta || !motivo) return;
    setProblema(null);
    iniciar(async () => {
      const subida = await subirArchivosCaso(archivos);
      if (subida.error) {
        setProblema(subida.error);
        return;
      }
      // La fecha es el fin de ese día en Lima (UTC−5, sin horario de verano).
      const vence = plazo === "fecha" && fecha ? new Date(`${fecha}T18:00:00-05:00`).toISOString() : null;
      const r = await crearCasoCentral({
        area,
        motivo,
        mensaje,
        urgente: plazo === "urgente",
        vence,
        cuentaId: cuentaId ?? null,
        servicioId: servicioId ?? null,
        leadId: leadId ?? null,
        adjuntos: subida.adjuntos,
      });
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success(
        plazo === "urgente"
          ? `${r.codigo}: le está sonando a ${def.etiqueta}. Lo sigues en «Casos a otras áreas».`
          : `${r.codigo}: le llegó a ${def.etiqueta}. Lo sigues en «Casos a otras áreas».`,
      );
      limpiarTodo();
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setProblema(null);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className={cn("gap-1.5", compacto ? "h-8 px-2.5 text-xs" : "")} title="Abrir un caso para Finanzas o Facturación">
            <Send className="size-3.5" />
            <span className={compacto ? "hidden sm:inline" : undefined}>{etiqueta}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Derivar a un área</DialogTitle>
          <DialogDescription>
            {referencia ? `${referencia} · ` : ""}
            <b>{cliente}</b>. El área lo recibe en su bandeja «Casos de Central» y te contesta por el mismo caso.
            {leadId ? " El contacto sale de esta bandeja y queda en «Derivados a otras áreas»." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {AREAS_CASO.map((a) => (
              <button
                key={a.valor}
                type="button"
                disabled={!a.disponible}
                title={a.disponible ? undefined : "RR. HH. todavía no tiene cuenta en el CRM: el caso no le llegaría a nadie"}
                onClick={() => {
                  setArea(a.valor);
                  setMotivo(null);
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  area === a.valor ? "border-2 border-primary bg-primary/5" : "border-border hover:bg-accent",
                  !a.disponible && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <b className="block">{a.etiqueta}</b>
                <span className="text-xs text-muted-foreground">{a.ayuda}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <div className="flex flex-wrap gap-1.5">
              {def.motivos.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    motivo === m ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-accent",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="caso-central-mensaje">Qué necesitas que hagan</Label>
            <Textarea
              id="caso-central-mensaje"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={3}
              placeholder={
                area === "finanzas"
                  ? "Ej. El cliente dice que depositó S/ 4 820 el lunes en el BCP. Necesita la guía hoy para recoger a las 4 pm."
                  : "Ej. La factura salió con la razón social antigua. El cliente pide que se emita a nombre de …"
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="caso-central-archivos">Adjuntos (voucher, OC, captura…)</Label>
            <ElegirArchivos id="caso-central-archivos" archivos={archivos} onChange={setArchivos} />
          </div>

          <div className="space-y-1.5">
            <Label>Para cuándo</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["normal", "Hoy, sin apuro"],
                  ["urgente", "Urgente: en 2 horas"],
                  ["fecha", "Para una fecha"],
                ] as [Plazo, string][]
              ).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPlazo(v)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    plazo === v
                      ? v === "urgente"
                        ? "border-destructive bg-destructive/10 font-semibold text-destructive"
                        : "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {t}
                </button>
              ))}
              {plazo === "fecha" && (
                <Input id="caso-central-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 w-auto text-xs" />
              )}
            </div>
            {plazo === "urgente" && (
              <p className="text-xs text-muted-foreground">
                A {def.etiqueta} le suena la alerta que no se cierra sola y le llega al celular. Si en 2 horas nadie lo toma, vuelve a sonar y gerencia se entera.
              </p>
            )}
          </div>

          {problema && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{problema}</p>}
        </div>

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">{falta ?? ""}</span>
          <Button disabled={Boolean(falta) || enviando} onClick={enviar} variant={plazo === "urgente" ? "destructive" : "default"}>
            {enviando ? "Enviando…" : `Derivar a ${def.etiqueta}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
