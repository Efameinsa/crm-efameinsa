"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { proyectarCierre } from "@/lib/acciones/oportunidades";
import { cn } from "@/lib/utils";
import { fechaCalendario } from "@/lib/fechas";
import type { Potencial } from "@/lib/potenciales-semana";

/**
 * El cuadro semanal de potenciales, tal como lo describió el ing. Carlos
 * (25-08): «en esta semana, el martes vas a cerrar el cliente A con $20,000,
 * el miércoles $10,000… día a día. Si no lo cierras, lo pasas al siguiente
 * día y lo jalas. Al final tienes proyectado cerrar para esta semana 50 mil».
 *
 * Seis columnas (lunes a sábado: acá se trabaja el sábado) más «Por ubicar»:
 * los potenciales sin fecha, que son el reclamo natural — «tiene que estar en
 * la semana». Cada tarjeta se despliega para ver el desglose por equipo
 * («cotizan varios ítems, tenemos que permitirnos desglosar») y su fecha se
 * mueve con el selector, sin salir del cuadro.
 */

const DIA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ETAPA_LABEL: Record<string, string> = {
  cotizada: "Cotizado",
  seguimiento: "Seguimiento",
  potencial: "Negociación",
  filtrada: "Filtrado",
  asignada: "Recibido",
};

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString("es-PE")}`;

export function SemanaPotenciales({
  lunes,
  potenciales,
  esGerencia,
  hoyISO,
}: {
  lunes: string;
  potenciales: Potencial[];
  esGerencia: boolean;
  hoyISO: string;
}) {
  const dias = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${lunes}T12:00:00`);
    d.setDate(d.getDate() + i);
    return { iso: d.toISOString().slice(0, 10), etiqueta: `${DIA_CORTO[i]} ${d.getDate()}` };
  });
  const enSemana = (p: Potencial) => p.cierreProyectado !== null && p.cierreProyectado >= dias[0].iso && p.cierreProyectado <= dias[5].iso;
  const porDia = new Map<string, Potencial[]>(dias.map((d) => [d.iso, []]));
  const porUbicar: Potencial[] = [];
  // En negociación pero con la fecha fuera de la semana que se está mirando.
  // Hasta el 28-08 estos desaparecían de la pantalla: no entraban en ningún día
  // y «Por ubicar» solo acepta los que no tienen fecha. Así se perdió de vista
  // el COUNTRY CLUB LOS CONDORES, proyectado para el domingo 30 —el cuadro
  // llega hasta el sábado—, aunque su etapa dijera Potencial.
  const enOtraFecha: Potencial[] = [];
  for (const p of potenciales) {
    if (enSemana(p)) porDia.get(p.cierreProyectado!)!.push(p);
    // Sin fecha, literal. Hasta el 27-08 caía acá también lo que tenía fecha
    // de OTRA semana, y por eso la columna era ilegible («esto por ubicar
    // dificulta un poco la vista, ¿qué es esto?», ing. Carlos): se abría una
    // oportunidad a ponerle fecha y ya la tenía, para otro día.
    else if (p.etapa === "potencial" && p.cierreProyectado === null) porUbicar.push(p);
    else if (p.etapa === "potencial") enOtraFecha.push(p);
  }
  enOtraFecha.sort((a, b) => (a.cierreProyectado ?? "").localeCompare(b.cierreProyectado ?? ""));
  const totalSemana = [...porDia.values()].flat().reduce((s, p) => s + (p.montoUsd ?? 0), 0);

  const semanaVecina = (delta: number) => {
    const d = new Date(`${lunes}T12:00:00`);
    d.setDate(d.getDate() + delta * 7);
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={`?semana=${semanaVecina(-1)}`} className="rounded-md border border-border p-1.5 hover:bg-accent" aria-label="Semana anterior">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={`?semana=${semanaVecina(1)}`} className="rounded-md border border-border p-1.5 hover:bg-accent" aria-label="Semana siguiente">
            <ChevronRight className="size-4" />
          </Link>
          <span className="ml-2 text-sm text-muted-foreground">
            Semana del {dias[0].etiqueta} al {dias[5].etiqueta}
          </span>
        </div>
        <p className="text-sm">
          Proyectado de la semana:{" "}
          <b className="text-base text-[#1E7F4F]">{usd(totalSemana)}</b>
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[1080px] grid-cols-7 gap-2">
          {dias.map((d) => {
            const lista = porDia.get(d.iso)!;
            const totalDia = lista.reduce((s, p) => s + (p.montoUsd ?? 0), 0);
            return (
              <div key={d.iso} className={cn("rounded-lg border border-border bg-card", d.iso === hoyISO && "ring-2 ring-primary/40")}>
                <div className="border-b border-border px-2 py-1.5">
                  <p className="text-xs font-bold text-foreground">{d.etiqueta}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{lista.length > 0 ? usd(totalDia) : "—"}</p>
                </div>
                <div className="min-h-[120px] space-y-1.5 p-1.5">
                  {lista.map((p) => (
                    <TarjetaPotencial key={p.id} p={p} esGerencia={esGerencia} vencido={d.iso < hoyISO} />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5">
            <div className="border-b border-amber-500/30 px-2 py-1.5">
              <p className="text-xs font-bold text-amber-800">Por ubicar</p>
              <p className="text-[11px] text-amber-800/70">sin fecha — «tiene que estar en la semana»</p>
            </div>
            <div className="min-h-[120px] space-y-1.5 p-1.5">
              {porUbicar.map((p) => (
                <TarjetaPotencial key={p.id} p={p} esGerencia={esGerencia} vencido={false} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* En negociación, con fecha para otro día: no se mezclan con la semana
          —el cuadro sirve para proyectar ESTOS seis días— pero tampoco pueden
          desaparecer, que es lo que pasaba hasta el 28-08. */}
      {enOtraFecha.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-bold">En negociación, proyectadas para otra fecha ({enOtraFecha.length})</p>
            <p className="text-[11px] text-muted-foreground">
              Están en Potencial pero su cierre cae fuera de esta semana. Cámbieles la fecha para traerlas al cuadro.
            </p>
          </div>
          <div className="grid gap-1.5 p-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {enOtraFecha.map((p) => (
              <TarjetaPotencial key={p.id} p={p} esGerencia={esGerencia} vencido={false} conFecha />
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Entran las oportunidades en negociación y cualquier otra abierta con fecha proyectada esta semana. El monto es
        el de la última cotización enviada (o el estimado si aún no hay). Si un cierre no se dio, cámbiele la fecha —
        se jala al día siguiente, pero queda a la vista.
      </p>
    </div>
  );
}

function TarjetaPotencial({
  p,
  esGerencia,
  vencido,
  conFecha = false,
}: {
  p: Potencial;
  esGerencia: boolean;
  vencido: boolean;
  /** Fuera de la semana la fecha es el dato que falta para entender la tarjeta. */
  conFecha?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function mover(fecha: string | null) {
    startTransition(async () => {
      const r = await proyectarCierre(p.id, fecha);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <details className={cn("rounded-md border bg-background p-1.5 text-[11.5px] leading-tight", vencido ? "border-destructive/50" : "border-border")}>
      <summary className="cursor-pointer list-none">
        <span className="block truncate font-semibold text-foreground" title={p.cliente}>{p.cliente}</span>
        <span className="mt-0.5 flex items-center justify-between gap-1">
          <span className="tabular-nums font-bold text-[#1E7F4F]">
            {p.monto != null ? `${p.moneda === "PEN" ? "S/" : "US$"} ${Math.round(p.monto).toLocaleString("es-PE")}` : "sin monto"}
          </span>
          {esGerencia && <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold">{p.comercialCodigo ?? "—"}</span>}
        </span>
        {conFecha && p.cierreProyectado && (
          <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">
            Cierre proyectado: {fechaCalendario(p.cierreProyectado)}
          </span>
        )}
        {vencido && <span className="mt-0.5 block text-[10px] font-semibold text-destructive">No cerró — jalarlo a otro día</span>}
      </summary>

      <div className="mt-1.5 space-y-1.5 border-t border-border pt-1.5">
        <p className="text-[10.5px] text-muted-foreground">
          {p.presupuesto ?? "Sin presupuesto enviado"}
          {p.rubro ? ` · ${p.rubro}` : ""} · {ETAPA_LABEL[p.etapa] ?? p.etapa}
          {esGerencia ? ` · ${p.comercialNombre}` : ""}
        </p>
        {p.items.length > 0 && (
          <ul className="space-y-0.5">
            {p.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-1 text-[10.5px]">
                <span className="truncate text-muted-foreground" title={i.nombre}>
                  {i.cantidad > 1 ? `${i.cantidad} × ` : ""}{i.nombre}
                </span>
                <span className="shrink-0 tabular-nums">{Math.round(i.precio * i.cantidad).toLocaleString("es-PE")}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            defaultValue={p.cierreProyectado ?? ""}
            onChange={(e) => mover(e.target.value || null)}
            className="h-6 flex-1 rounded border border-input bg-background px-1 text-[10.5px]"
            aria-label="Fecha proyectada de cierre"
          />
          <Link href={`/comercial/oportunidades/${p.id}`} className="shrink-0 text-[10.5px] font-semibold text-primary hover:underline">
            Abrir →
          </Link>
        </div>
      </div>
    </details>
  );
}
