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

  const { comerciales, totales, meta_seguimientos } = resumen;

  return (
    <div className="space-y-4">
      <FiltroFechaSupervision fecha={fecha} hoy={hoy} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Seguimientos efectivos" valor={totales.seguimientos_efectivos} sub={`meta ${meta_seguimientos} por comercial`} />
        <Kpi etiqueta="Cotizaciones ejecutadas" valor={totales.cotizaciones} sub="registradas en el CRM ese día" />
        <Kpi etiqueta="Ventas del día" valor={totales.ventas} sub="oportunidades cerradas" />
        <Kpi
          etiqueta="En meta"
          valor={totales.comerciales_en_meta}
          sub={`de ${comerciales.length} comercial${comerciales.length === 1 ? "" : "es"}`}
          alerta={totales.comerciales_en_meta === 0}
        />
      </div>

      {totales.comerciales_sin_actividad > 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <b className="text-foreground">{totales.comerciales_sin_actividad}</b> comercial
          {totales.comerciales_sin_actividad === 1 ? "" : "es"} sin ninguna gestión registrada este día.
        </p>
      )}

      <SeccionPanel titulo="Gestión por comercial">
        <div className="grid gap-3 lg:grid-cols-2">
          {comerciales.map((c) => (
            <TarjetaSupervision key={c.id} c={c} meta={meta_seguimientos} fecha={fecha} />
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
