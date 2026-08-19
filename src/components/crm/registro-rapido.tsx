"use client";

import { useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { registrarActividad, cambiarEtapa } from "@/lib/acciones/oportunidades";
import { createClient } from "@/lib/supabase/client";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { cn } from "@/lib/utils";

const TIPOS = [
  ["llamada", "Llamada"],
  ["whatsapp", "WhatsApp"],
  ["email", "Correo"],
  ["visita", "Visita"],
  ["showroom", "Showroom"],
  ["filtro", "Filtro"],
  ["nota", "Nota"],
  ["otro", "Otro"],
] as const;

function fechaISO(diasDesdeHoy: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d.toISOString().slice(0, 10);
}

export interface ResultadoGestion {
  id: number;
  codigo: string;
  nombre: string;
  accion_sugerida?: string | null;
  dias_sugeridos?: number | null;
  efecto?: "cotizar" | "venta" | "rechazo" | null;
}
export interface MotivoRechazo {
  id: number;
  nombre: string;
}

// Reingeniería 19-08 (aprobada por gerencia): el registro se cuenta como
// TRES PREGUNTAS — ¿qué hiciste? / ¿qué pasó? / ¿qué sigue? — y el
// resultado ("en qué quedó") ARRASTRA la próxima acción con texto y fecha
// sugeridos (siempre editables). Antes eran tres secciones sueltas y para
// un comercial nuevo se sentían redundantes. Efectos especiales:
// "Quiere comprar" guía al flujo de venta, "Pidió cotización" al cotizador,
// y "Sin interés" ofrece el rechazo con motivo ahí mismo (regla intacta:
// sin motivo no hay rechazo).
export function RegistroRapido({
  oportunidadId,
  resultados = [],
  motivos = [],
}: {
  oportunidadId: string;
  resultados?: ResultadoGestion[];
  motivos?: MotivoRechazo[];
}) {
  const reducido = useReducedMotion();
  const [expandido, setExpandido] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("llamada");
  const [nota, setNota] = useState("");
  const [resultadoId, setResultadoId] = useState<number | null>(null);
  const [proximaAccion, setProximaAccion] = useState("");
  const [proximaAccionAt, setProximaAccionAt] = useState("");
  const [accionEditada, setAccionEditada] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, startTransition] = useTransition();

  const resultado = resultados.find((r) => r.id === resultadoId) ?? null;
  const esRechazo = resultado?.efecto === "rechazo";

  function limpiar() {
    setExpandido(false);
    setTipo("llamada");
    setNota("");
    setResultadoId(null);
    setProximaAccion("");
    setProximaAccionAt("");
    setAccionEditada(false);
    setMotivoId("");
    setArchivos([]);
  }

  // Elegir "qué sigue" rellena la próxima acción — pero nunca pisa lo que el
  // comercial ya escribió a mano.
  function elegirResultado(r: ResultadoGestion) {
    if (resultadoId === r.id) {
      setResultadoId(null);
      if (!accionEditada) { setProximaAccion(""); setProximaAccionAt(""); }
      return;
    }
    setResultadoId(r.id);
    if (!accionEditada) {
      setProximaAccion(r.accion_sugerida ?? "");
      setProximaAccionAt(r.dias_sugeridos != null ? fechaISO(r.dias_sugeridos) : "");
    }
  }

  function registrar() {
    if (esRechazo && !motivoId) {
      toast.error("Seleccione el motivo del rechazo");
      return;
    }
    startTransition(async () => {
      // Adjuntos primero (bucket privado 'adjuntos'; el server action solo
      // guarda los metadatos). Si una subida falla, se avisa y NO se
      // registra la gestión — mejor reintentar que perder el archivo.
      const adjuntos: { path: string; nombre: string; tipo: string; tamano: number }[] = [];
      if (archivos.length) {
        const storage = createClient().storage.from("adjuntos");
        for (const f of archivos) {
          const path = `${oportunidadId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
          const { error } = await storage.upload(path, f, { contentType: f.type || "application/octet-stream" });
          if (error) {
            toast.error(`No se pudo subir "${f.name}": ${error.message}`);
            return;
          }
          adjuntos.push({ path, nombre: f.name, tipo: f.type, tamano: f.size });
        }
      }
      const r1 = await registrarActividad({
        oportunidadId,
        tipo,
        nota,
        resultadoId,
        proximaAccion: esRechazo ? "" : proximaAccion,
        proximaAccionAt: esRechazo ? null : proximaAccionAt || null,
        adjuntos,
      });
      if (r1.error) {
        toast.error(r1.error);
        return;
      }
      if (esRechazo) {
        const r2 = await cambiarEtapa({ oportunidadId, etapa: "rechazada", motivoRechazoId: Number(motivoId) });
        if (r2.error) {
          toast.error(r2.error);
          return;
        }
        toast.success("Gestión registrada y oportunidad rechazada");
      } else {
        toast.success("Gestión registrada");
      }
      limpiar();
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <Paso n="1" titulo="¿Qué hiciste?">
        <div className="flex flex-wrap gap-2">
          {TIPOS.map(([valor, etiqueta]) => (
            <Chip key={valor} activo={tipo === valor} onClick={() => setTipo(valor)}>
              {etiqueta}
            </Chip>
          ))}
        </div>
      </Paso>

      <Paso n="2" titulo="¿Qué pasó?">
        <Textarea
          placeholder="ej.: tiene 20 lavanderías, presupuesto US$ 100 mil, su crédito sale el 15/09…"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onFocus={() => setExpandido(true)}
          rows={expandido ? 3 : 1}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent">
            <Paperclip className="size-3" /> Adjuntar (PDF, Word, foto)
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const nuevos = Array.from(e.target.files ?? []);
                const grandes = nuevos.filter((f) => f.size > 10 * 1024 * 1024);
                if (grandes.length) toast.error(`Máximo 10 MB por archivo: ${grandes.map((f) => f.name).join(", ")}`);
                setArchivos((prev) => [...prev, ...nuevos.filter((f) => f.size <= 10 * 1024 * 1024)].slice(0, 5));
                setExpandido(true);
                e.target.value = "";
              }}
            />
          </label>
          {archivos.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground">
              📎 {f.name.length > 28 ? f.name.slice(0, 25) + "…" : f.name}
              <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))} aria-label="Quitar" className="cursor-pointer">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </Paso>

      {expandido && (
        <motion.div
          initial={reducido ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-4 overflow-hidden"
        >
          <Paso n="3" titulo="¿Qué sigue?">
            <div className="space-y-3">
              {resultados.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {resultados.map((r) => (
                    <Chip key={r.id} activo={resultadoId === r.id} onClick={() => elegirResultado(r)}>
                      {r.nombre}
                    </Chip>
                  ))}
                </div>
              )}

              {resultado?.efecto === "venta" && (
                <p className="rounded-md border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 p-2.5 text-xs text-foreground">
                  🎉 Para cerrar: acepte la cotización en la ficha y use <b>Registrar venta</b> — eso actualiza la
                  cartera y los reportes. Mientras tanto quedó programado el cierre.
                </p>
              )}
              {resultado?.efecto === "cotizar" && (
                <p className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs text-foreground">
                  Puede armar la cotización ahora mismo desde la sección <b>Cotizar</b> de la ficha.
                </p>
              )}

              {esRechazo ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">La oportunidad se rechazará. ¿Por qué? (obligatorio)</p>
                  <select
                    value={motivoId}
                    onChange={(e) => setMotivoId(e.target.value)}
                    className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    aria-label="Motivo del rechazo"
                  >
                    <option value="">Seleccione el motivo…</option>
                    {motivos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  {motivos.length === 0 && (
                    <p className="text-xs text-amber-700">Para rechazar, use el cambio de etapa en la ficha completa.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="ej. Llamar para confirmar visita"
                    value={proximaAccion}
                    onChange={(e) => {
                      setProximaAccion(e.target.value);
                      setAccionEditada(true);
                    }}
                    aria-label="Próxima acción"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <SelectorFecha
                      valor={proximaAccionAt || null}
                      onCambiar={(f) => {
                        setProximaAccionAt(f ?? "");
                        setAccionEditada(true);
                      }}
                      etiquetaVacia="¿Para cuándo?"
                    />
                    {resultado?.accion_sugerida && !accionEditada && (
                      <span className="text-[11px] text-muted-foreground">sugerida por &ldquo;{resultado.nombre}&rdquo; — edítela si quiere</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Paso>

          <Button onClick={registrar} disabled={enviando || (esRechazo && !motivoId)}>
            {enviando ? "Registrando…" : esRechazo ? "Registrar y rechazar" : "Registrar gestión"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function Paso({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <span className="mr-1.5 inline-flex size-4 items-center justify-center rounded-full bg-secondary text-[10px] text-foreground">{n}</span>
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
        activo ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
