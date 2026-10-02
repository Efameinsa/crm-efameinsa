import { Clock } from "lucide-react";
import { duracionOficina, tiemposDeFiles, type FilaTiempos, type Medida } from "@/lib/files-tiempos";
import { cn } from "@/lib/utils";

/**
 * TIEMPOS DE LOS FILES (02-10, Santos): cuánto tarda Central en encontrar y
 * entregar, en recoger tras «Terminé», cuánto tarda quien pidió en firmar
 * «Recibí» y cuánto pasa el file fuera del archivador. En horario de oficina
 * (ver `lib/files-tiempos.ts`). Lo ven quienes llevan el cuaderno.
 */
const TRAMOS: { clave: "entregar" | "recoger" | "firmar" | "fuera"; titulo: string; detalle: string; quienEspera: string; alerta: number }[] = [
  { clave: "entregar", titulo: "Central encuentra y entrega", detalle: "Del pedido a «Entregar»", quienEspera: "esperando el file", alerta: 30 },
  { clave: "recoger", titulo: "Central recoge", detalle: "De «Terminé» a «Devuelto»", quienEspera: "esperando que Central pase", alerta: 30 },
  { clave: "firmar", titulo: "Firma de «Recibí el file»", detalle: "De la entrega a la firma de quien lo pidió", quienEspera: "sin firmar", alerta: 30 },
  { clave: "fuera", titulo: "Fuera del archivador", detalle: "De la entrega a la devolución", quienEspera: "todavía fuera", alerta: 540 },
];

function Tarjeta({ m, t }: { m: Medida; t: (typeof TRAMOS)[number] }) {
  const tarde = m.esperando.filter((e) => e.min >= t.alerta);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{t.titulo}</p>
        <p className="text-[11px] text-muted-foreground">{t.detalle}</p>
      </div>
      {m.n === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay casos cerrados en este tramo.</p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-bold tabular-nums text-foreground">{duracionOficina(m.mediana!)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            lo normal (mediana) · promedio {duracionOficina(m.promedio!)} · el más lento {duracionOficina(m.maximo!)} · {m.n} caso{m.n === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {m.porPersona.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {m.porPersona.map((p) => `${p.nombre}: ${duracionOficina(p.mediana)} (${p.n})`).join(" · ")}
        </p>
      )}
      {m.lentos.length > 0 && m.maximo! >= t.alerta && (
        <p className="text-xs text-muted-foreground">
          Más lentos: {m.lentos.filter((l) => l.min >= t.alerta).map((l) => `${l.cliente} (${duracionOficina(l.min)}, ${l.quien})`).join(" · ")}
        </p>
      )}
      {m.esperando.length > 0 && (
        <p className={cn("rounded-md px-2 py-1 text-xs font-medium", tarde.length ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground")}>
          {m.esperando.length} {t.quienEspera}
          {m.esperando.length > 0 && `: ${m.esperando.slice(0, 4).map((e) => `${e.cliente} · ${e.quien} · ${duracionOficina(e.min)}`).join(" — ")}`}
          {m.esperando.length > 4 ? ` y ${m.esperando.length - 4} más` : ""}
        </p>
      )}
    </div>
  );
}

export function TiemposDeFiles({ filas }: { filas: FilaTiempos[] }) {
  const t = tiemposDeFiles(filas);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        Pedidos de los últimos 30 días ({t.total}). Solo cuenta el horario de oficina: lunes a viernes de 8:00 a 13:00 y de 14:00 a 18:00, sábados de 9:00 a 12:00. Las entregas sin pedido no entran en «encuentra y entrega».
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {TRAMOS.map((tr) => (
          <Tarjeta key={tr.clave} m={t[tr.clave]} t={tr} />
        ))}
      </div>
    </div>
  );
}
