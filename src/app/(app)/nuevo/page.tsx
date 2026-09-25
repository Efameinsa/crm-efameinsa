import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { BadgeDollarSign, Inbox, Landmark, Truck, Users } from "lucide-react";
import { Numero, TARJETA } from "@/components/propuesta/kit";
import { cn } from "@/lib/utils";
import { PantallaExistente } from "@/lib/propuesta/paginas";
import { tipoDePerfil } from "@/lib/propuesta/menu";
import { cuentasPorCobrar } from "@/lib/pagos-finanzas";
import { colaDelDia, colaSupervision } from "@/lib/propuesta/cola-del-dia";
import { ColaDelDia } from "@/components/propuesta/cola-del-dia";
import { colaCentral, colaFinanzas } from "@/lib/propuesta/cola-central-finanzas";

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

  // LA COLA DE TRABAJO (23-09): para quien trabaja casos uno por uno, «Hoy» es
  // la lista de lo que toca, no el tablero. El tablero sigue a un clic.
  if (["postventa", "almacen", "comercial", "preventivo", "central", "finanzas", "operaciones"].includes(tipo)) {
    const sp = await searchParams;
    const supabase = await createClient();
    const { tareas, agenda } =
      tipo === "central"
        ? await colaCentral(supabase)
        : tipo === "finanzas"
          ? await colaFinanzas(supabase)
          : tipo === "operaciones"
            ? await colaSupervision(supabase, perfil, { central: () => colaCentral(supabase), finanzas: () => colaFinanzas(supabase) })
            : await colaDelDia(supabase, perfil, tipo);
    const numeros: Record<string, { etiqueta: string; href: string }> = {
      central: { etiqueta: "Ver la bandeja de siempre", href: "/central" },
      operaciones: { etiqueta: "Ver las autorizaciones", href: "/operaciones" },
      finanzas: { etiqueta: "Ver Por confirmar en números", href: "/finanzas" },
      postventa: { etiqueta: "Ver El macro en números", href: "/postventa/macro" },
      almacen: { etiqueta: "Ver Mi día en números", href: "/almacen" },
      comercial: { etiqueta: "Ver mi tablero", href: "/comercial" },
      preventivo: { etiqueta: "Ver mi tablero", href: "/comercial" },
    };
    return <ColaDelDia nombre={perfil.nombre} tareas={tareas} agenda={agenda} ver={sp.ver ?? null} todo={sp.todo ?? null} enNumeros={numeros[tipo]} />;
  }

  const claves: Record<string, string[]> = {
    central: ["central"],
    comercial: ["comercial"],
    preventivo: ["comercial"],
    postventa: ["postventa/macro", "postventa"],
    almacen: ["almacen"],
    finanzas: ["finanzas"],
    facturacion: ["facturacion"],
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
      <div className={cn("propuesta-hero p-5", TARJETA)}>
        <h1 className="text-[22px] font-bold text-foreground">Lo que espera a gerencia</h1>
        <p className="text-sm text-muted-foreground">Cada número abre su lista. Si todo está en cero, no hay nada que decidir hoy.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Numero icono={BadgeDollarSign} etiqueta="Precios por aprobar" valor={aprobaciones.count ?? 0} sub="Cotizaciones bajo lista" tono="urgente" href="/gerencia/aprobaciones" />
        <Numero icono={Inbox} etiqueta="Contactos sin clasificar" valor={sinClasificar.count ?? 0} sub="En la bandeja de Central" tono="atencion" href="/central" />
        <Numero icono={Truck} etiqueta="Despachos atrasados" valor={atrasados.count ?? 0} sub="Tenían fecha y no salieron" tono="urgente" href="/nuevo/operacion" />
        <Numero icono={Landmark} etiqueta="Cobros vencidos" valor={vencidos} sub="Pasó el plazo de crédito" tono="urgente" href="/nuevo/operacion/cobranza" />
        <Numero icono={Users} etiqueta="Cartera para redistribuir" valor={(liberables.count ?? 0).toLocaleString("es-PE")} sub="Tres meses o más sin venta" href="/nuevo/clientes/liberables" />
      </div>
      <div className={cn("p-1", TARJETA)}>
      <PantallaExistente clave="gerencia/reportes" searchParams={Promise.resolve({})} />
      </div>
    </div>
  );
}
