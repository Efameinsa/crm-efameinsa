import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { Kpi } from "@/components/crm/kpi";
import { PantallaExistente } from "@/lib/propuesta/paginas";
import { tipoDePerfil } from "@/lib/propuesta/menu";
import { cuentasPorCobrar } from "@/lib/pagos-finanzas";

export const dynamic = "force-dynamic";

/**
 * «HOY» — la primera regla de la propuesta: todos abren en una sola bandeja
 * con lo que pide acción. Para las áreas que ya tenían una buena bandeja se
 * reutiliza tal cual; postventa junta «El macro» y «Bandeja» en una sola
 * pantalla; gerencia estrena la suya: solo lo que espera una decisión suya.
 */
export default async function HoyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perfil = await requerirPerfil();
  const tipo = tipoDePerfil(perfil);

  if (tipo === "admin") redirect("/admin");
  if (tipo === "gerencia") return <HoyGerencia />;

  const claves: Record<string, string[]> = {
    central: ["central"],
    comercial: ["comercial"],
    preventivo: ["comercial"],
    postventa: ["postventa/macro", "postventa"],
    almacen: ["almacen"],
    finanzas: ["finanzas"],
    operaciones: ["operaciones"],
  };
  return (
    <div className="space-y-6">
      {(claves[tipo] ?? []).map((clave) => (
        <PantallaExistente key={clave} clave={clave} searchParams={searchParams} />
      ))}
    </div>
  );
}

async function HoyGerencia() {
  const supabase = await createClient();
  const hoy = hoyLima();
  const [aprobaciones, sinClasificar, atrasados, liberables, cobrar] = await Promise.all([
    supabase.from("cotizaciones").select("id", { count: "exact", head: true }).eq("estado_aprobacion", "pendiente_gerencia"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "pendiente_triaje").eq("es_prueba", false),
    supabase
      .from("servicios_postventa")
      .select("id", { count: "exact", head: true })
      .not("informe_cierre_id", "is", null)
      .lt("fecha_despacho", hoy)
      .is("despachado_at", null)
      .is("cerrado_at", null)
      .eq("es_prueba", false),
    supabase.from("v_cuentas_liberables").select("id", { count: "exact", head: true }),
    cuentasPorCobrar(supabase),
  ]);
  const vencidos = cobrar.filter((p) => (p.diasParaVencer ?? 0) < 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Lo que espera a gerencia</h1>
        <p className="text-sm text-muted-foreground">Cada número abre su lista. Si todo está en cero, no hay nada que decidir hoy.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Precios por aprobar" valor={aprobaciones.count ?? 0} sub="Cotizaciones bajo lista" alerta={(aprobaciones.count ?? 0) > 0} href="/gerencia/aprobaciones" />
        <Kpi etiqueta="Contactos sin clasificar" valor={sinClasificar.count ?? 0} sub="En la bandeja de Central" alerta={(sinClasificar.count ?? 0) > 0} href="/central" />
        <Kpi etiqueta="Despachos atrasados" valor={atrasados.count ?? 0} sub="Tenían fecha y no salieron" alerta={(atrasados.count ?? 0) > 0} href="/nuevo/operacion" />
        <Kpi etiqueta="Cobros vencidos" valor={vencidos} sub="Pasó el plazo de crédito" alerta={vencidos > 0} href="/nuevo/operacion/cobranza" />
        <Kpi etiqueta="Cartera para redistribuir" valor={liberables.count ?? 0} sub="Tres meses o más sin venta" href="/nuevo/clientes/liberables" />
      </div>
      <PantallaExistente clave="gerencia/reportes" searchParams={Promise.resolve({})} />
    </div>
  );
}
