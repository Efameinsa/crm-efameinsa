import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { cargarParque } from "@/lib/parque";
import type { EstadoMantenimiento } from "@/lib/ruta-mantenimiento";
import { veTodoPostventa } from "@/lib/postventa";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaParque } from "@/components/crm/lista-parque";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * «Mi parque» / «Las ventas de la empresa»: los clientes con máquinas o con
 * ventas, y a cuáles toca venderles el mantenimiento.
 *
 * Santos, 02-09: «el negocio pide que el comercial también esté verificando
 * de sus ventas a quién se le está venciendo el producto para poder venderle
 * el mantenimiento». Regla decidida: lo venden AMBOS, comercial y postventa,
 * y uno ve la gestión del otro. Por eso cada fila dice quién habló último con
 * el cliente y si ya hay una oportunidad de mantenimiento abierta y de quién:
 * si la hay, no se abre otra, se entra a esa.
 *
 * El comercial ve su cartera. Quien ve todo postventa (el área, gerencia, o
 * el comercial con la llave) ve el parque entero, con la cartera de cada uno.
 *
 * 10-09, GERENCIA: LA LISTA ARRANCA DE LAS VENTAS. Antes salía solo de las
 * máquinas fichadas y eso dejaba fuera a casi 400 clientes a los que la empresa
 * sí les vendió. Carlos: «yo como postventa tendría que tener acá todas las
 * ventas de todos los comerciales […] ¿y dónde están los 900?». Se trabaja
 * cronológicamente hacia atrás y la lista dice de quién es cada cliente.
 *
 * 11-09: EL SERVIDOR ARMA LA LISTA UNA VEZ; LOS FILTROS VIVEN EN EL NAVEGADOR.
 * Esta página solo decide quién puede entrar, con qué conjunto (su cartera o
 * la empresa) y baja los datos; año, lote, estado y búsqueda los aplica
 * `ListaParque` al instante, sin volver acá. Ver la nota en ese componente.
 */
export default async function ParquePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; todos?: string; anio?: string; origen?: string }>;
}) {
  const [perfil, sp] = await Promise.all([requerirPerfil(), searchParams]);
  // Solo para quien vende mantenimiento (Santos, 02-09: «solo prepárala para
  // Ariana, quítale al resto; mantener a postventa»): la llave hace_postventa,
  // el área, gerencia. Un comercial sin la llave vuelve a su día.
  const puedeVerTodo = veTodoPostventa(perfil);
  if (!puedeVerTodo) redirect("/comercial");
  const supabase = await createClient();
  const verTodo = sp.todos === "1";
  const estado = (["nunca", "vencido", "al_dia", "sin_dato"] as EstadoMantenimiento[]).includes(sp.estado as EstadoMantenimiento)
    ? (sp.estado as EstadoMantenimiento)
    : null;

  const todos = await cargarParque(supabase, { comercialId: verTodo ? null : perfil.id, hoy: hoyLima() });

  const enlaceConjunto = (todosFlag: boolean) => `/comercial/parque${todosFlag ? "?todos=1" : ""}`;

  return (
    <SeccionPanel
      titulo={verTodo ? "Las ventas de la empresa" : "Mi parque"}
      accion={
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-foreground">
            {todos.length} cliente{todos.length === 1 ? "" : "s"} · {todos.reduce((a, c) => a + c.equipos, 0)} máquinas fichadas
          </span>
          <span className="inline-flex overflow-hidden rounded-md border border-border font-medium">
            <Link href={enlaceConjunto(false)} className={cn("px-2.5 py-1", !verTodo ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              Mi cartera
            </Link>
            <Link href={enlaceConjunto(true)} className={cn("px-2.5 py-1", verTodo ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              Toda la empresa
            </Link>
          </span>
        </span>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Sus clientes con máquinas, y a cuáles toca venderles el mantenimiento. El semáforo es el del preventivo:
        <b className="text-destructive"> nunca</b>, <b className="text-amber-800">vencido</b> (más de 6 meses) o{" "}
        <b className="text-[#1E7F4F]">al día</b>. La última gestión es de quien sea, comercial o postventa: los dos
        venden mantenimiento y los dos ven lo que hizo el otro. Si ya hay una oportunidad abierta, se entra a esa.
      </p>

      <ListaParque
        todos={todos}
        verTodo={verTodo}
        inicial={{
          q: (sp.q ?? "").trim(),
          estado,
          anio: /^\d{4}$/.test(sp.anio ?? "") ? (sp.anio as string) : null,
          origen: sp.origen === "postventa" || sp.origen === "comercial" ? sp.origen : null,
        }}
      />
    </SeccionPanel>
  );
}
