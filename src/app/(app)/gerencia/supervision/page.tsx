import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { cargarSupervisionDiaria } from "@/lib/supervision";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { FiltroFechaSupervision } from "@/components/crm/filtro-fecha-supervision";
import { TarjetaSupervision } from "@/components/crm/tarjeta-supervision";
import { LineasIndicadoresSupervision, ResumenEquipoHoy } from "@/components/crm/indicadores-comerciales";
import { cargarIndicadoresDelDia } from "@/lib/indicadores-comerciales";

// Depende de searchParams y de datos vivos: nunca cachear.
export const dynamic = "force-dynamic";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function SupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sp = await searchParams;
  const hoy = hoyLima();
  const fecha = sp.fecha && RE_FECHA.test(sp.fecha) && sp.fecha <= hoy ? sp.fecha : hoy;

  const supabase = await createClient();
  const resumen = await cargarSupervisionDiaria(supabase, fecha);

  if (!resumen) {
    return (
      <div className="space-y-4">
        <FiltroFechaSupervision fecha={fecha} hoy={hoy} />
        <SeccionPanel titulo="Sin datos">
          <p className="text-sm text-muted-foreground">No se pudo cargar la supervisión del día. Intente de nuevo en unos segundos.</p>
        </SeccionPanel>
      </div>
    );
  }

  const { totales, meta_seguimientos } = resumen;
  // WhatsApp de campaña, visitas y videollamadas (ing. Carlos, 30-09: «¿cuántas
  // visitas hay el día de hoy?… las visitas de este comercial»). Se calculan
  // en TypeScript, al lado de la función SQL, sin tocarla.
  const ids = resumen.comerciales.map((c) => c.id);
  const [indicadores, { count: programadasPlanta }] = await Promise.all([
    cargarIndicadoresDelDia(supabase, ids, fecha, hoy),
    supabase
      .from("visitas_planta")
      .select("id", { count: "exact", head: true })
      .eq("fecha", fecha)
      .is("cancelada_at", null)
      .is("cerrada_at", null),
  ]);
  const codigos = new Map(resumen.comerciales.map((c) => [c.id, c.codigo ?? c.nombre.split(" ")[0]]));
  // Postventa TAMBIÉN se muestra (pedido de gerencia 25-08: «hay que mostrar
  // PV»), pero aparte: su tarjeta va después de las comerciales y NO entra al
  // KPI «En meta» — un caso de garantía no es una gestión de venta y medirla
  // contra la meta de 30 seguimientos sería injusto en ambas direcciones.
  const comerciales = resumen.comerciales.filter((c) => !c.es_postventa);
  const postventa = resumen.comerciales.filter((c) => c.es_postventa);

  return (
    <div className="space-y-4">
      <FiltroFechaSupervision fecha={fecha} hoy={hoy} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Gestiones efectivas"
          valor={totales.seguimientos_efectivos}
          sub={`sin WhatsApp de campaña · meta ${meta_seguimientos} por comercial`}
        />
        <Kpi
          etiqueta="Cotizaciones ejecutadas"
          valor={totales.cotizaciones + totales.cotizaciones_archivo + totales.cotizaciones_archivo_sin_asesor}
          sub={
            totales.cotizaciones_archivo + totales.cotizaciones_archivo_sin_asesor > 0
              ? `${totales.cotizaciones} en el CRM · ${totales.cotizaciones_archivo + totales.cotizaciones_archivo_sin_asesor} del archivo`
              : "registradas en el CRM ese día"
          }
        />
        <Kpi etiqueta="Ventas del día" valor={totales.ventas} sub="oportunidades cerradas" />
        <Kpi
          etiqueta="En meta"
          valor={totales.comerciales_en_meta}
          sub={`de ${comerciales.length} comercial${comerciales.length === 1 ? "" : "es"}`}
          alerta={totales.comerciales_en_meta === 0}
        />
      </div>

      <ResumenEquipoHoy eq={indicadores} nombres={codigos} programadasPlanta={programadasPlanta ?? 0} esHoy={fecha === hoy} />

      {(totales.comerciales_sin_actividad > 0 || totales.cotizaciones_archivo_sin_asesor > 0) && (
        <div className="space-y-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {totales.comerciales_sin_actividad > 0 && (
            <p>
              <b className="text-foreground">{totales.comerciales_sin_actividad}</b> comercial
              {totales.comerciales_sin_actividad === 1 ? "" : "es"} sin ninguna gestión registrada este día.
            </p>
          )}
          {/* Sin esta línea el total del día no cuadraría con la suma de las
              tarjetas y parecería un error de la pantalla. */}
          {totales.cotizaciones_archivo_sin_asesor > 0 && (
            <p>
              <b className="text-foreground">{totales.cotizaciones_archivo_sin_asesor}</b> cotizaci
              {totales.cotizaciones_archivo_sin_asesor === 1 ? "ón" : "ones"} de ese día no se pudo atribuir a un comercial:
              el documento no traía el correo del asesor en la firma.
            </p>
          )}
        </div>
      )}

      <SeccionPanel titulo="Gestión por comercial">
        <div className="grid gap-3 lg:grid-cols-2">
          {comerciales.map((c) => (
            <TarjetaSupervision
              key={c.id}
              c={c}
              meta={c.meta_gestiones ?? meta_seguimientos}
              fecha={fecha}
              indicadores={
                indicadores.porComercial.get(c.id) && (
                  <LineasIndicadoresSupervision eq={indicadores} c={indicadores.porComercial.get(c.id)!} />
                )
              }
            />
          ))}
          {postventa.map((c) => (
            <TarjetaSupervision key={c.id} c={c} meta={c.meta_gestiones ?? meta_seguimientos} fecha={fecha} esPostventa />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Gestión efectiva = contacto real (llamada, WhatsApp, correo, visita o videollamada) que no terminó en &ldquo;No
          contestó&rdquo;. Las marcas de un botón en los chats de campaña van aparte y no suman: su indicador es la
          línea de WhatsApp de campaña. Visitas y videollamadas se miden por semana. Clic en una tarjeta para ver el
          detalle del comercial. Las metas se editan en{" "}
          <Link href="/gerencia/metas" className="font-medium text-primary hover:underline">
            Metas
          </Link>
          .
        </p>
      </SeccionPanel>
    </div>
  );
}
