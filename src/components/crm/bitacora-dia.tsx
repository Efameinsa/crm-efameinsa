"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { agregarActividadDia, borrarActividadDia } from "@/lib/acciones/bitacora";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// La sección 1 del informe de Central: las actividades del día escritas a mano.
//
// Es lo único que el sistema no puede armar solo. Las otras cuatro secciones
// —llamadas, ingreso de prospectos, presupuestos y presupuestos por razón
// social— salen de lo que ya quedó registrado al trabajar.
//
// Se mantiene la lista numerada del Word que Alondra venía usando, porque es
// como la lee gerencia todos los días.

export interface ActividadDia {
  id: string;
  orden: number;
  texto: string;
}

const SUGERENCIAS = [
  "Se ingresó al sistema, se verificaron correos y WhatsApp Web",
  "Se revisó correo electrónico",
  "Se informa a gerencia sobre las llamadas registradas",
  "Se guardaron los files",
  "Se realizó pedidos",
  "Fin de mis labores",
];

export function BitacoraDia({ fecha, actividades }: { fecha: string; actividades: ActividadDia[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [guardando, startTransition] = useTransition();

  function agregar(valor?: string) {
    const t = (valor ?? texto).trim();
    if (!t) return;
    startTransition(async () => {
      const r = await agregarActividadDia({ fecha, texto: t });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setTexto("");
      router.refresh();
    });
  }

  function borrar(id: string) {
    startTransition(async () => {
      const r = await borrarActividadDia(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  const yaUsadas = new Set(actividades.map((a) => a.texto));

  return (
    <div className="space-y-3">
      {actividades.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no anotó actividades. Lo demás del informe se arma solo con lo que registre durante el día.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {actividades.map((a, i) => (
            <li key={a.id} className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span className="flex-1 text-sm text-foreground">{a.texto}</span>
              <button
                type="button"
                onClick={() => borrar(a.id)}
                disabled={guardando}
                aria-label={`Quitar "${a.texto}"`}
                className="cursor-pointer text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
          placeholder="Qué hizo — ej.: Se derivó llamadas a C4"
          className="min-w-[240px] flex-1"
          aria-label="Nueva actividad del día"
        />
        <Button type="button" variant="outline" onClick={() => agregar()} disabled={guardando || !texto.trim()}>
          <Plus className="size-3.5" /> Agregar
        </Button>
      </div>

      {/* Las que se repiten todos los días, para no volver a escribirlas. */}
      <div className="flex flex-wrap gap-1.5">
        {SUGERENCIAS.filter((s) => !yaUsadas.has(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => agregar(s)}
            disabled={guardando}
            className="cursor-pointer rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
