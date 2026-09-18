import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CalendarioPostventa, type VistaCalendario } from "@/components/crm/calendario-postventa";
import { eventoDeAtencion, eventoDeVisita, eventosDePedido, filtrarPorZona, type EventoCalendario } from "@/lib/calendario-postventa";
import { diasDelMes, diasDeSemana, lunesDe } from "@/lib/calendario";
import { sinPrecios, type ServicioPostventa } from "@/lib/postventa";

export const dynamic = "force-dynamic";

/**
 * El calendario del almacén (Santos, 18-09: «que tenga su calendario de
 * programación así como postventa»). Es el mismo calendario del área, con lo
 * que al almacén le toca: despachos programados y puestas en marcha de los
 * pedidos, las atenciones con día y técnico, y quién viene a la planta. Sin
 * precios y sin agendar desde acá: eso lo programa postventa.
 */
export default async function AgendaAlmacenPage({ searchParams }: { searchParams: Promise<{ vista?: string; fecha?: string; zona?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const vista: VistaCalendario = (["semana", "mes", "dia"] as const).includes(sp.vista as VistaCalendario) ? (sp.vista as VistaCalendario) : "semana";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? (sp.fecha as string) : hoy;
  const zona = sp.zona === "lima" || sp.zona === "provincia" ? sp.zona : "";
  const dias = vista === "mes" ? diasDelMes(fecha.slice(0, 7)).map((d) => d.iso) : vista === "semana" ? diasDeSemana(lunesDe(fecha)) : [fecha];
  const desde = dias[0];
  const hasta = dias[dias.length - 1];

  const [{ data: pedidos }, { data: programadas }, { data: visitas }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("*")
      .or(`and(fecha_despacho.gte.${desde},fecha_despacho.lte.${hasta}),and(puesta_en_marcha.gte.${desde},puesta_en_marcha.lte.${hasta})`)
      .limit(400),
    supabase
      .from("atenciones")
      .select("id, tipo, programada_at, tecnico, cliente_texto, cerrado_at, cuentas(razon_social, departamento)")
      .gte("programada_at", `${desde}T00:00:00-05:00`)
      .lte("programada_at", `${hasta}T23:59:59-05:00`)
      .limit(300),
    supabase.from("visitas_planta").select("id, empresa, persona, motivo, fecha, hora, cancelada_at").gte("fecha", desde).lte("fecha", hasta).limit(100),
  ]);

  const eventosPedidos = ((pedidos ?? []) as unknown as ServicioPostventa[]).map(sinPrecios).flatMap(eventosDePedido);
  const eventosAtenciones = (
    (programadas ?? []) as unknown as {
      id: string;
      tipo: string;
      programada_at: string;
      tecnico: string | null;
      cliente_texto: string | null;
      cerrado_at: string | null;
      cuentas: { razon_social: string; departamento: string | null } | null;
    }[]
  ).map((a) => {
    const dep = (a.cuentas?.departamento ?? "").toUpperCase();
    return eventoDeAtencion({
      id: a.id,
      tipo: a.tipo,
      programada_at: a.programada_at,
      tecnico: a.tecnico,
      cerrado_at: a.cerrado_at,
      cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      zona: dep ? (dep === "LIMA" ? "lima" : "provincia") : null,
    });
  });
  const eventosVisitas = ((visitas ?? []) as unknown as Parameters<typeof eventoDeVisita>[0][]).map(eventoDeVisita);
  const eventos: EventoCalendario[] = filtrarPorZona([...eventosPedidos, ...eventosAtenciones, ...eventosVisitas], zona);

  return (
    <SeccionPanel titulo="Calendario del almacén">
      <p className="mb-3 text-xs text-muted-foreground">
        Despachos programados, puestas en marcha, atenciones con técnico y visitas a la planta. Lo programa postventa; acá se ve
        qué toca cada día.
      </p>
      <CalendarioPostventa vista={vista} fecha={fecha} hoy={hoy} zona={zona} eventos={eventos} porProgramar={[]} atencionesPorProgramar={[]} rutaBase="/almacen/agenda" />
    </SeccionPanel>
  );
}
