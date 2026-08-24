import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// Carga de derivación por comercial (pedido de Carlos 19-08, "determinante
// para Central"): cuántos leads se derivaron a cada comercial hoy, en la
// semana y en los últimos 30 días — reemplaza el reporte manual que los
// comerciales mandaban al final del día. Se muestra en la vista de Central
// y en el panel de gerencia. Solo cuenta derivaciones vivas del CRM
// (estado 'asignado'), no el histórico importado.
export async function CargaDerivacion() {
  const supabase = await createClient();
  const hoy = hoyLima();
  const d = new Date(`${hoy}T12:00:00Z`);
  const lunes = new Date(d);
  lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const inicioSemana = lunes.toISOString().slice(0, 10);
  const hace30 = new Date(d.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: asignados }, { data: comerciales }, { count: pendientes }] = await Promise.all([
    supabase
      .from("leads")
      .select("asignado_a, asignado_at")
      .eq("estado", "asignado")
      // Los contactos sintéticos de la cuenta de práctica no son carga de
      // Central ni de nadie (migración 0072).
      .eq("es_prueba", false)
      .gte("asignado_at", `${hace30}T00:00:00`)
      .limit(2000),
    supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("rol", "comercial").eq("activo", true).eq("es_prueba", false).order("codigo_comercial"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "pendiente_triaje"),
  ]);

  const filas = (comerciales ?? []).map((c) => {
    const mios = (asignados ?? []).filter((l) => l.asignado_a === c.id);
    const deFecha = (desde: string) => mios.filter((l) => String(l.asignado_at) >= `${desde}T00:00:00`).length;
    return { id: c.id, nombre: c.nombre, codigo: c.codigo_comercial, hoy: deFecha(hoy), semana: deFecha(inicioSemana), mes: mios.length };
  });
  const totales = filas.reduce(
    (t, f) => ({ hoy: t.hoy + f.hoy, semana: t.semana + f.semana, mes: t.mes + f.mes }),
    { hoy: 0, semana: 0, mes: 0 },
  );

  return (
    <SeccionPanel titulo="Carga de derivación por comercial">
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
                  <td className="py-1.5 text-foreground">
                    {f.nombre}
                    {f.codigo && <span className="ml-1 text-muted-foreground">({f.codigo})</span>}
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
              <td className="pt-2 text-foreground">Total derivados</td>
              <td className="pt-2 pl-2 text-right tabular-nums">{totales.hoy}</td>
              <td className="pt-2 pl-2 text-right tabular-nums">{totales.semana}</td>
              <td className="pt-2 pl-2 text-right tabular-nums">{totales.mes}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {(pendientes ?? 0) > 0 ? (
          <>
            <b className="text-amber-700">{pendientes}</b> lead{pendientes === 1 ? "" : "s"} en bandeja sin derivar.
          </>
        ) : (
          "Bandeja al día — sin leads esperando."
        )}{" "}
        La semana corre de lunes a domingo. Solo derivaciones hechas en el CRM.
      </p>
    </SeccionPanel>
  );
}
