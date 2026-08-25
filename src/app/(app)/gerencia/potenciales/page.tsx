import { createClient } from "@/lib/supabase/server";
import { cargarPotenciales, lunesSemana } from "@/lib/potenciales-semana";
import { SemanaPotenciales } from "@/components/crm/semana-potenciales";
import { SeccionPanel } from "@/components/crm/seccion-panel";

export const dynamic = "force-dynamic";

/**
 * El cuadro semanal de potenciales de TODO el equipo (reunión 25-08): «es más
 * fácil mirar los potenciales que son en la semana 10 que mirar todo el CRM».
 * Gerencia ve el proyectado día a día, entra al desglose de cada presupuesto
 * y puede mover fechas igual que el comercial.
 */
export default async function PotencialesGerenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; comercial?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: comerciales } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .eq("rol", "comercial")
    .eq("activo", true)
    .eq("es_prueba", false)
    .order("codigo_comercial");

  const lunes = lunesSemana(sp.semana);
  const { potenciales } = await cargarPotenciales(lunes, sp.comercial ?? null);
  const hoyISO = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })).toISOString().slice(0, 10);

  return (
    <SeccionPanel titulo="Potenciales de la semana">
      <form className="mb-3" action="/gerencia/potenciales">
        <input type="hidden" name="semana" value={lunes} />
        <select
          name="comercial"
          defaultValue={sp.comercial ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Todos los comerciales</option>
          {(comerciales ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}
              {c.nombre}
            </option>
          ))}
        </select>
        <button type="submit" className="ml-2 h-8 rounded-md border border-border px-3 text-xs hover:bg-accent">
          Filtrar
        </button>
      </form>
      <SemanaPotenciales lunes={lunes} potenciales={potenciales} esGerencia hoyISO={hoyISO} />
    </SeccionPanel>
  );
}
