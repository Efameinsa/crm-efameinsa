import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { cargarSupervisionDiaria } from "@/lib/supervision";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { FiltroFechaSupervision } from "@/components/crm/filtro-fecha-supervision";
import { TarjetaSupervision } from "@/components/crm/tarjeta-supervision";

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
        <Kpi etiqueta="Seguimientos efectivos" valor={totales.seguimientos_efectivos} sub={`meta ${meta_seguimientos} por comercial`} />
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
            <TarjetaSupervision key={c.id} c={c} meta={c.meta_gestiones ?? meta_seguimientos} fecha={fecha} />
          ))}
          {postventa.map((c) => (
            <TarjetaSupervision key={c.id} c={c} meta={c.meta_gestiones ?? meta_seguimientos} fecha={fecha} esPostventa />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Seguimiento efectivo = contacto real (llamada, WhatsApp, correo o visita) que no terminó en &ldquo;No
          contestó&rdquo;. Clic en una tarjeta para ver el detalle del comercial. La meta se edita en Parámetros.
        </p>
      </SeccionPanel>
    </div>
  );
}
