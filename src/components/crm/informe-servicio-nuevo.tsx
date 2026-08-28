"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, X, FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { guardarInformeServicio } from "@/lib/acciones/postventa";
import { TIPOS_SERVICIO } from "@/lib/postventa";
import { cn } from "@/lib/utils";

/**
 * El informe que vuelve de una atención, cargado desde la ficha de la máquina.
 *
 * Los tipos son los que el área emite de verdad (D9 del plan 16): el manual
 * define cinco formatos, pero la reunión del 27-08 aclaró que los que se
 * escriben son el de llamada, la revisión al recibir el equipo, el de
 * mantenimiento, el final y el técnico de servicio. Comparten tabla porque
 * comparten cabecera, fotos y conformidad.
 *
 * LAS FOTOS NO SON UN ADORNO. El manual las exige en todos los formatos y son
 * lo que sostiene la respuesta cuando el cliente reclama: «venga el informe, la
 * foto… ahí está la hora y fecha, no hay problema». Se suben al bucket privado
 * antes de guardar; si una falla, no se guarda el informe — mejor reintentar
 * que perder la evidencia.
 *
 * LOS CICLOS son el otro dato que convierte esto en algo útil dos años después:
 * «señor, usted tiene 10.000 ciclos, quiere decir que ha usado 9 horas
 * diarias». Al guardarlos, la ficha de la máquina se actualiza sola.
 */
export function InformeServicioNuevo({
  equipoId,
  cuentaId,
  equipoTexto,
  ciclosActuales,
}: {
  equipoId: string;
  cuentaId: string | null;
  equipoTexto: string | null;
  ciclosActuales: number | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const [tipo, setTipo] = useState<string>("mantenimiento_preventivo");
  const [modalidad, setModalidad] = useState<"in_situ" | "videollamada" | "planta">("in_situ");
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
  const [tecnico, setTecnico] = useState("");
  const [detalle, setDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [ciclos, setCiclos] = useState(ciclosActuales != null ? String(ciclosActuales) : "");
  const [conforme, setConforme] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);

  function guardar() {
    if (!detalle.trim()) {
      toast.error("Escriba qué se hizo: es lo que se lee dos años después");
      return;
    }
    startTransition(async () => {
      // Las fotos primero, igual que en el registro de gestión: el server
      // action solo guarda los metadatos.
      const subidas: { path: string; nombre: string; tipo: string; tamano: number }[] = [];
      if (fotos.length) {
        const storage = createClient().storage.from("adjuntos");
        for (const f of fotos) {
          const path = `informes/${equipoId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
          const { error } = await storage.upload(path, f, { contentType: f.type || "image/jpeg" });
          if (error) {
            toast.error(`No se pudo subir «${f.name}»: ${error.message}`);
            return;
          }
          subidas.push({ path, nombre: f.name, tipo: f.type, tamano: f.size });
        }
      }

      const r = await guardarInformeServicio({
        equipoId,
        cuentaId,
        equipoTexto,
        tipo,
        modalidad,
        ejecutadoAt: new Date(`${fecha}T12:00:00`).toISOString(),
        tecnico: tecnico || null,
        detalle,
        observaciones: observaciones || null,
        ciclos: ciclos ? Number(ciclos) : null,
        conformeNombre: conforme || null,
        fotos: subidas,
      });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success("Informe emitido. Ya está en el historial de la máquina.");
      setAbierto(false);
      setDetalle("");
      setObservaciones("");
      setFotos([]);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        <FileCheck2 className="size-3.5" /> Registrar informe
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_SERVICIO.map((t) => (
          <button
            key={t.valor}
            type="button"
            onClick={() => setTipo(t.valor)}
            className={cn(
              "cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
              tipo === t.valor ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
        <select
          value={modalidad}
          onChange={(e) => setModalidad(e.target.value as "in_situ" | "videollamada" | "planta")}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="in_situ">In situ</option>
          <option value="videollamada">Videollamada</option>
          <option value="planta">En planta</option>
        </select>
        <input
          value={tecnico}
          onChange={(e) => setTecnico(e.target.value)}
          placeholder="Técnico"
          className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Ciclos
          <input
            value={ciclos}
            onChange={(e) => setCiclos(e.target.value.replace(/\D/g, ""))}
            placeholder="10000"
            className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-xs tabular-nums"
          />
        </label>
      </div>

      <textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        rows={2}
        placeholder="Trabajo realizado"
        className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none"
      />
      <textarea
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
        rows={2}
        placeholder="Observaciones y recomendaciones"
        className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none"
      />
      <input
        value={conforme}
        onChange={(e) => setConforme(e.target.value)}
        placeholder="Conforme: nombre de quien recibe"
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
      />

      <div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          <Camera className="size-3.5" /> Agregar fotos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const nuevas = Array.from(e.target.files ?? []);
              setFotos((f) => [...f, ...nuevas].slice(0, 10));
              e.target.value = "";
            }}
          />
        </label>
        {fotos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {fotos.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground"
              >
                {f.name.length > 24 ? f.name.slice(0, 21) + "…" : f.name}
                <button
                  type="button"
                  onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  aria-label={`Quitar ${f.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={guardar}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5" />}
          Emitir el informe
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
