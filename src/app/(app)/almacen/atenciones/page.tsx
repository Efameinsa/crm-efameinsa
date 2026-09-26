import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Las atenciones con técnico y fecha, vistas desde el almacén (0246):
 * puestas en marcha, mantenimientos y soporte técnico. «Yo como postventa lo
 * calendarizo y le envío en paralelo esta programación al almacén» (Carlos,
 * 16-09). Es lo que el almacén prepara: repuestos, herramientas, la máquina
 * en planta si el mantenimiento es acá.
 */
const TIPOS = ["", "puesta_en_marcha", "solicitud_mantenimiento", "problema_tecnico", "solicitud_repuesto"] as const;
const ETIQUETA: Record<string, string> = { "": "Todas", ...ETIQUETA_TIPO_ATENCION };

interface Fila {
  id: string;
  tipo: string;
  etapa: string;
  programada_at: string;
  tecnico: string | null;
  cliente_texto: string | null;
  equipo_texto: string | null;
  detalle: string | null;
  servicio_id: string | null;
  cuentas: { razon_social: string; distrito: string | null; departamento: string | null } | null;
}

export default async function AlmacenAtencionesPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requerirPerfil();
  const tipo = (await searchParams).tipo ?? "";
  const supabase = await createClient();
  const hoy = hoyLima();
  let q = supabase
    .from("atenciones")
    .select("id, tipo, etapa, programada_at, tecnico, cliente_texto, equipo_texto, detalle, cerrado_at, servicio_id, cuentas(razon_social, distrito, departamento)")
    .not("programada_at", "is", null)
    .is("cerrado_at", null)
    .gte("programada_at", `${hoy}T00:00:00-05:00`)
    .order("programada_at")
    .limit(300);
  if (tipo && (TIPOS as readonly string[]).includes(tipo)) q = q.eq("tipo", tipo);
  const { data } = await q;
  const filas = (data ?? []) as unknown as Fila[];
  const porDia = new Map<string, Fila[]>();
  for (const a of filas) {
    const dia = new Date(a.programada_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    porDia.set(dia, [...(porDia.get(dia) ?? []), a]);
  }
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
  const diaLargo = (d: string) => new Date(d + "T12:00:00-05:00").toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "2-digit", month: "long" });

  return (
    <SeccionPanel titulo="Atenciones programadas">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {TIPOS.map((t) => (
          <Link
            key={t}
            href={t ? `/almacen/atenciones?tipo=${t}` : "/almacen/atenciones"}
            className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tipo === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
          >
            {ETIQUETA[t]}
          </Link>
        ))}
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay atenciones programadas de hoy en adelante.</p>
      ) : (
        <div className="space-y-3">
          {[...porDia.entries()].map(([dia, lista]) => (
            <div key={dia}>
              <p className={cn("text-xs font-bold uppercase tracking-wide", dia === hoy ? "text-primary" : "text-muted-foreground")}>
                {dia === hoy ? "Hoy" : diaLargo(dia)}
              </p>
              <ul className="mt-1 divide-y divide-border">
                {lista.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2 text-sm">
                    <span className="w-14 flex-none font-semibold tabular-nums text-foreground">{hora(a.programada_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-foreground">{a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {ETIQUETA_TIPO_ATENCION[a.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? a.tipo}
                        {a.tecnico ? ` · ${a.tecnico}` : ""}
                        {a.cuentas?.distrito || a.cuentas?.departamento
                          ? ` · ${[a.cuentas.distrito, a.cuentas.departamento].filter(Boolean).join(", ")}`
                          : ""}
                      </span>
                      {a.equipo_texto && <span className="line-clamp-1 break-words text-xs text-muted-foreground">{a.equipo_texto}</span>}
                      {a.detalle && <span className="line-clamp-2 break-words text-xs text-muted-foreground">{a.detalle}</span>}
                    </span>
                    {a.servicio_id && (
                      <Link href={`/almacen/pedidos/${a.servicio_id}`} className="text-xs font-medium text-primary hover:underline">
                        Ver el pedido
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SeccionPanel>
  );
}
