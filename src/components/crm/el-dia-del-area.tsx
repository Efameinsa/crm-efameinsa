import Link from "next/link";
import { CalendarClock, PackageCheck, Truck, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { type ServicioPostventa } from "@/lib/postventa";
import { hoyLima } from "@/lib/periodo";
import { fechaLima } from "@/lib/fechas";
import {
  contarElDia,
  ETIQUETA_CASILLERO,
  AYUDA_CASILLERO,
  type CasilleroDia,
} from "@/lib/dia-postventa";
import { cn } from "@/lib/utils";

/**
 * «La agenda diaria», que Carlos pidió dos veces el 09-09 y las dos con la
 * palabra urgente: «¿qué atenciones tuve? ¿cuántos pendientes tengo?… cuáles
 * tenemos despachos programados, despachos pendientes, puesta en marcha
 * pendiente, entregas pendientes».
 *
 * El motivo es el que dio él mismo: «siguen trabajando en el board… están
 * llenando de información repetida que ya está acá». Mientras el CRM no
 * conteste «¿qué tengo hoy?» de un vistazo, el área sigue llevando su cuenta
 * en otro lado — y esa cuenta paralela es la que después no cuadra.
 *
 * Va ARRIBA del calendario: el calendario contesta «¿cuándo?», esto contesta
 * «¿qué me falta?», y esa es la primera pregunta del día.
 */
const ICONO: Record<CasilleroDia, typeof Truck> = {
  puesta_pendiente: Wrench,
  despacho_programado: Truck,
  listo_sin_fecha: PackageCheck,
  sin_apertura: CalendarClock,
};

export async function ElDiaDelArea() {
  const supabase = await createClient();
  const hoy = hoyLima();

  // SIN FILTRO POR PERSONA A PROPÓSITO: `servicios_postventa` no tiene columna
  // de comercial —el responsable es `responsable_id` y casi siempre está
  // vacío— y quien decide qué ve cada quien es la RLS, igual que en el resto
  // de las pantallas del área. Filtrar acá a mano daba un número y la lista de
  // al lado daba otro.
  const q = supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, completado, cerrado_at, despachado_at, puesta_en_marcha, apertura_despacho_at, fecha_despacho")
    .eq("completado", false)
    .is("cerrado_at", null)
    .limit(1000);

  // Las visitas de HOY salen de las atenciones, no de los pedidos: son las dos
  // mitades del día del área.
  const [{ data: pedidos }, { data: visitas }, { count: sinTomar }] = await Promise.all([
    q,
    supabase
      .from("atenciones")
      .select("id, cliente_texto, tecnico, programada_at, cuentas(razon_social)")
      .gte("programada_at", `${hoy}T00:00:00-05:00`)
      .lte("programada_at", `${hoy}T23:59:59-05:00`)
      .is("cerrado_at", null)
      .order("programada_at"),
    supabase
      .from("atenciones")
      .select("id", { count: "exact", head: true })
      .eq("etapa", "registro")
      .is("cerrado_at", null)
      .is("tomada_at", null),
  ]);

  const cuenta = contarElDia((pedidos ?? []) as unknown as ServicioPostventa[], hoy);
  const total = cuenta.reduce((t, x) => t + x.cuantos, 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cuenta.map(({ casillero, cuantos, atrasados }) => {
          const Icono = ICONO[casillero];
          return (
            <Link
              key={casillero}
              href="/postventa/pedidos"
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-3 transition-colors hover:bg-accent",
                atrasados > 0 ? "border-destructive/40 bg-destructive/5" : "border-border",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 flex-none items-center justify-center rounded-full",
                  atrasados > 0 ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground",
                )}
              >
                <Icono className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-none tabular-nums text-foreground">{cuantos}</span>
                <span className="mt-1 block text-xs font-semibold text-foreground">{ETIQUETA_CASILLERO[casillero]}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{AYUDA_CASILLERO[casillero]}</span>
                {atrasados > 0 && (
                  <span className="mt-1 block text-[11px] font-semibold text-destructive">
                    {atrasados === 1 ? "1 con la fecha ya pasada" : `${atrasados} con la fecha ya pasada`}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href="/postventa" className="font-semibold text-primary hover:underline">
          {sinTomar ?? 0} {sinTomar === 1 ? "caso sin tomar" : "casos sin tomar"} en la bandeja
        </Link>
        <span className="text-muted-foreground">
          {total} {total === 1 ? "pedido vivo" : "pedidos vivos"} en total
        </span>
      </div>

      {/* Las visitas de hoy, con nombre y hora: es lo que se responde por
          teléfono sin abrir nada más. */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Programado para hoy</p>
        {(visitas ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Hoy no hay ninguna visita ni llamada agendada en el circuito.</p>
        ) : (
          <ul className="space-y-1">
            {(visitas ?? []).map((v) => {
              const x = v as unknown as {
                id: string; cliente_texto: string | null; tecnico: string | null; programada_at: string;
                cuentas: { razon_social: string } | null;
              };
              return (
                <li key={x.id}>
                  <Link
                    href={`/postventa/atenciones/${x.id}`}
                    className="flex flex-wrap items-center gap-x-2 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
                  >
                    <span className="font-semibold tabular-nums text-foreground">
                      {new Date(x.programada_at).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {x.cuentas?.razon_social ?? x.cliente_texto ?? "Cliente sin nombre"}
                    </span>
                    {x.tecnico && <span className="text-muted-foreground">{x.tecnico}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground">Hoy es {fechaLima(`${hoy}T12:00:00`)}.</p>
      </div>
    </div>
  );
}
