import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { fechaCalendario } from "@/lib/fechas";
import { CubrirAForm, TerminarCoberturaBoton } from "@/components/crm/cobertura-postventa-form";

type Nombre = { nombre: string } | null;

/**
 * «HOY CUBRO A…» (0530, Santos 17-10: «a veces falta alguien»). Cuando una
 * compañera falta, otra la cubre: los casos y carpetas siguen a nombre de la
 * ausente (a su vuelta no hay nada que mover), quien cubre recibe copia de
 * sus avisos y ve aquí lo que a ella le tocaba hoy o tenía vencido.
 */
export async function CoberturaPostventa() {
  const perfil = await requerirPerfil();
  if (!perfil.es_postventa) return null;
  const supabase = await createClient();
  const hoy = hoyLima();

  const [{ data: coberturas }, { data: companeras }] = await Promise.all([
    supabase
      .from("coberturas_postventa")
      .select("id, ausente, cubre, hasta, ausenteP:ausente(nombre), cubreP:cubre(nombre)")
      .is("terminada_at", null)
      .lte("desde", hoy)
      .gte("hasta", hoy),
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial")
      .eq("es_postventa", true)
      .eq("activo", true)
      .eq("es_prueba", Boolean(perfil.es_prueba))
      .neq("id", perfil.id)
      .neq("codigo_comercial", "PV")
      .order("codigo_comercial"),
  ]);
  const lasQueCubro = (coberturas ?? []).filter((c) => c.cubre === perfil.id);
  const meCubren = (coberturas ?? []).filter((c) => c.ausente === perfil.id);

  // Lo de la ausente que vence hoy o ya venció: carpetas con próxima acción.
  const pendientesDe = await Promise.all(
    lasQueCubro.map(async (c) => {
      const { data } = await supabase
        .from("oportunidades")
        .select("id, proxima_accion, proxima_accion_at, cuentas(razon_social)")
        .eq("comercial_id", c.ausente)
        .not("tipo_postventa", "is", null)
        .in("etapa", ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"])
        .lte("proxima_accion_at", hoy)
        .order("proxima_accion_at", { ascending: false })
        .limit(12);
      return { c, filas: data ?? [] };
    }),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
      {meCubren.map((c) => (
        <p key={c.id} className="mb-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{(c.cubreP as unknown as Nombre)?.nombre}</span> la está cubriendo
          hasta el {fechaCalendario(c.hasta)}. Sus casos siguen a su nombre.
        </p>
      ))}
      {pendientesDe.map(({ c, filas }) => (
        <div
          key={c.id}
          className="mb-3 rounded-lg border border-violet-300 bg-violet-50 p-2 text-xs dark:border-violet-800 dark:bg-violet-950/30"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-foreground">
              Hoy cubre a {(c.ausenteP as unknown as Nombre)?.nombre} (hasta el {fechaCalendario(c.hasta)}) · lo suyo para
              hoy o vencido: {filas.length}
            </p>
            <TerminarCoberturaBoton id={c.id} />
          </div>
          {filas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {filas.map((f) => (
                <li key={f.id}>
                  <Link href={`/comercial/oportunidades/${f.id}`} className="font-medium underline-offset-2 hover:underline">
                    {((f.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "")}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {f.proxima_accion ?? "sin acción"} · {fechaCalendario(f.proxima_accion_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-muted-foreground">
            Le llega copia de sus avisos. Lo que haga queda con su nombre; la carpeta sigue siendo de ella salvo que cotice o
            se la quede.
          </p>
        </div>
      ))}
      <CubrirAForm
        companeras={(companeras ?? [])
          .filter((x) => !lasQueCubro.some((c) => c.ausente === x.id))
          .map((x) => ({ id: x.id, nombre: x.nombre }))}
        hoy={hoy}
      />
    </section>
  );
}
