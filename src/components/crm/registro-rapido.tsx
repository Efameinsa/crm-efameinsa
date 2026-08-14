"use client";

import { useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { registrarActividad } from "@/lib/acciones/oportunidades";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}

// Revelado progresivo: en reposo solo se ven los chips de tipo + una nota de
// una línea (el hábito de ≤15s). Al enfocar la nota se despliega lo demás
// (resultado, próxima acción); solo se vuelve a colapsar tras registrar con
// éxito — así nunca se pierde de vista lo que el comercial ya escribió.
export function RegistroRapido({
  oportunidadId,
  resultados = [],
}: {
  oportunidadId: string;
  resultados?: ResultadoGestion[];
}) {
  const reducido = useReducedMotion();
  const [expandido, setExpandido] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("llamada");
  const [nota, setNota] = useState("");
  const [resultadoId, setResultadoId] = useState<number | null>(null);
  const [proximaAccion, setProximaAccion] = useState("");
  const [proximaAccionAt, setProximaAccionAt] = useState("");
  const [enviando, startTransition] = useTransition();

  function limpiar() {
    setExpandido(false);
    setTipo("llamada");
    setNota("");
    setResultadoId(null);
    setProximaAccion("");
    setProximaAccionAt("");
  }

  function registrar() {
    startTransition(async () => {
      const resultado = await registrarActividad({
        oportunidadId,
        tipo,
        nota,
        resultadoId,
        proximaAccion,
        proximaAccionAt: proximaAccionAt || null,
      });
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Gestión registrada");
      limpiar();
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setTipo(valor)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              tipo === valor
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Detalle de la gestión (ej.: tiene 20 lavanderías, presupuesto US$ 100 mil, su crédito sale el 15/09)…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onFocus={() => setExpandido(true)}
        rows={expandido ? 3 : 1}
      />

      {expandido && (
        <motion.div
          initial={reducido ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-3 overflow-hidden"
        >
          {resultados.length > 0 && (
            <div className="space-y-1.5">
              <Label>¿En qué quedó? (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {resultados.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setResultadoId((actual) => (actual === r.id ? null : r.id))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      resultadoId === r.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="proxima_accion">Próxima acción</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="proxima_accion"
                placeholder="ej. Llamar para confirmar visita"
                value={proximaAccion}
                onChange={(e) => setProximaAccion(e.target.value)}
                className="flex-1 min-w-[180px]"
              />
              <Input
                type="date"
                value={proximaAccionAt}
                onChange={(e) => setProximaAccionAt(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setProximaAccionAt(fechaISO(0))}>
                Hoy
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setProximaAccionAt(fechaISO(1))}>
                Mañana
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setProximaAccionAt(fechaISO(7))}>
                Próx. semana
              </Button>
            </div>
          </div>

          <Button onClick={registrar} disabled={enviando}>
            {enviando ? "Registrando…" : "Registrar gestión"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
