import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// Presupuestos registrados por comercial (pedido de Carlos, reunión 19-08
// tarde): "te derivé 50 leads, ¿cuántos presupuestos cotizaste?" — el
// complemento de la carga de derivación, en las mismas ventanas hoy /
// semana / 30 días. Central lo ve SOLO en cantidades (sin montos), que es
// exactamente lo que controla; gerencia ve los montos en su panel.
// Las ventanas cortan en hora de Lima (offset -05:00 explícito): una
// cotización de las 8 pm no debe caer en "mañana".
//
// Desde el 01-09 el nombre de cada comercial lleva al LISTADO de sus
// presupuestos enviados (/central/presupuestos), con filtro por día, semana,
// mes y año: el ing. Carlos pidió que Central pudiera abrir cuáles son, no
// solo contarlos (E1 de docs/22).
//
// 02-09 — EL MISMO CRITERIO QUE EL LISTADO. Gerencia comparó los dos reportes
// del 01-09 y no cuadraban: el listado de Central decía 12 presupuestos y esta
// tabla 13 («doble check», Word de observaciones del 01.09). El 13.º era un
// BORRADOR sin número que Katerine abandonó a las 19:27 y reemplazó tres
// minutos después por el Presu_2210. Esta tabla contaba todo lo CREADO en el
// día, borradores incluidos; el listado cuenta lo que tiene NÚMERO por su
// fecha de ENVÍO. Dos criterios para la misma pregunta son dos números
// distintos sin error a la vista, así que ahora acá se cuenta exactamente lo
// mismo que allá: presupuestos con número, enviados o aceptados, por la fecha
// en que se enviaron. Un borrador no es un presupuesto todavía.
export async function CargaCotizaciones() {
  const supabase = await createClient();
  const hoy = hoyLima();
  const d = new Date(`${hoy}T12:00:00Z`);
  const lunes = new Date(d);
  lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const inicioSemana = lunes.toISOString().slice(0, 10);
  const hace30 = new Date(d.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: cotizaciones }, { data: comerciales }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("enviada_at, oportunidades!inner(comercial_id)")
      .not("correlativo", "is", null)
      .in("estado", ["enviada", "aceptada"])
      .not("codigo", "like", "PRUEBA%")
      .gte("enviada_at", `${hace30}T00:00:00-05:00`)
      .limit(2000),
    supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("rol", "comercial").eq("activo", true).eq("es_prueba", false).eq("es_soporte", false).order("codigo_comercial"),
  ]);

  const filas = (comerciales ?? []).map((c) => {
    const mias = (cotizaciones ?? []).filter(
      (cz) => (cz.oportunidades as unknown as { comercial_id: string } | null)?.comercial_id === c.id,
    );
    const desde = (fecha: string) => mias.filter((cz) => String(cz.enviada_at) >= `${fecha}T00:00:00-05:00`).length;
    return {
      id: c.id,
      nombre: c.nombre,
      codigo: c.codigo_comercial,
      hoy: desde(hoy),
      semana: desde(inicioSemana),
      mes: mias.length,
    };
  });
  const totales = filas.reduce(
    (t, f) => ({ hoy: t.hoy + f.hoy, semana: t.semana + f.semana, mes: t.mes + f.mes }),
    { hoy: 0, semana: 0, mes: 0 },
  );

  return (
    <SeccionPanel titulo="Presupuestos enviados por comercial">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Comercial</th>
              <th className="pb-2 pl-2 text-right font-medium">Hoy</th>
              <th className="pb-2 pl-2 text-right font-medium">Esta semana</th>
              <th className="pb-2 pl-2 text-right font-medium">Últimos 30 días</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const max = Math.max(1, ...filas.map((x) => x.semana));
              return (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="py-1.5">
                    <Link
                      href={`/central/presupuestos?comercial=${f.id}`}
                      className="text-foreground hover:text-primary hover:underline"
                    >
                      {f.nombre}
                      {f.codigo && <span className="ml-1 text-muted-foreground">({f.codigo})</span>}
                    </Link>
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{f.hoy}</td>
                  <td className="py-1.5 pl-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${(f.semana / max) * 100}%` }} />
                      </div>
                      <span className="w-5 text-right tabular-nums">{f.semana}</span>
                    </div>
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{f.mes}</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="pt-2">
                <Link href="/central/presupuestos" className="text-foreground hover:text-primary hover:underline">
                  Total enviados
                </Link>
              </td>
              <td className="pt-2 pl-2 text-right tabular-nums">{totales.hoy}</td>
              <td className="pt-2 pl-2 text-right tabular-nums">{totales.semana}</td>
              <td className="pt-2 pl-2 text-right tabular-nums">{totales.mes}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        La semana corre de lunes a domingo. Cuenta solo presupuestos con número, por su fecha de envío: el mismo criterio
        que el listado, para que los dos digan lo mismo. Los borradores y las prácticas no cuentan; los presupuestos que aún
        viven en el Excel de cada comercial tampoco.{" "}
        <Link href="/central/presupuestos" className="font-medium text-primary hover:underline">
          Ver el listado de presupuestos enviados →
        </Link>
      </p>
    </SeccionPanel>
  );
}
