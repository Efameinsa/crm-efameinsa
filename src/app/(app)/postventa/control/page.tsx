import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import Link from "next/link";
import { TableroControl, type TarjetaControl } from "@/components/crm/tablero-control";
import { TablaPorPaso, type FilaTabla } from "@/components/crm/tabla-por-paso";
import { cn } from "@/lib/utils";
import { fechaLima } from "@/lib/fechas";
import { ColaDespachos } from "@/components/crm/cola-despachos";
import {
  avancePedido,
  bloquesPedido,
  etiquetaResponsable,
  puedeVerPrecios,
  queLoFrena,
  sinPrecios,
  type ServicioPostventa,
} from "@/lib/postventa";

export const dynamic = "force-dynamic";

/**
 * El control de los pedidos — el Excel de Hever, como tablero de fases.
 *
 * Pedido del ing. Carlos (01-09): «el concepto de ese Excel, el CONTROL de
 * ese Excel es lo que te menciono». La primera versión fue una matriz de
 * nueve columnas de símbolos y Santos la vetó el mismo día: la pregunta real
 * del área es «¿qué tengo en cada fase y qué me toca mover?». Tres columnas
 * —las mismas fases de la ficha del pedido (bloquesPedido)— con una tarjeta
 * por pedido; el detalle de los pasos, en el checklist de la tarjeta y en la
 * ficha.
 *
 * Esta página solo COCINA los datos (con los precios ya tapados para el
 * área); el tablero vive en TableroControl, que es cliente porque el
 * arrastre con su alertita —la experiencia que diseñó Santos— necesita
 * navegador.
 */

function faseActual(bloques: ReturnType<typeof bloquesPedido>): 1 | 2 | 3 {
  for (const b of bloques) if (!b.completo) return b.numero;
  return 3;
}

export default async function ControlPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; falta?: string; q?: string; estado?: string }>;
}) {
  // Dos vistas del mismo control (Carlos, 02-09): el tablero de fases —lo que
  // diseñó Santos— y la tabla POR PASO, para «¿a quiénes no les he enviado el
  // plano?» cuando hay veinte pedidos. `falta` deja solo los que deben ese paso.
  const sp = await searchParams;
  const vista =
    sp.vista === "paso" ? "paso" : sp.vista === "despachos" ? "despachos" : sp.vista === "cerrados" ? "cerrados" : "tablero";
  const falta = /^[a-z_]+$/.test(sp.falta ?? "") ? (sp.falta as string) : null;
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  // TAMBIÉN LOS PEDIDOS ANTERIORES AL CIRCUITO (Carlos, 15-09). Hasta hoy acá
  // entraban solo los del flujo digital (con cierre en el CRM) y la cola vieja
  // del Excel vivía escondida en Atenciones → Despachos del Excel. Por eso
  // Suyón, Choquehuanca y los equipos anteriores de Bungarena «no figuraban en
  // Pedidos» aunque estaban cargados desde el 25-08. Un pedido vivo es un
  // pedido vivo, venga de donde venga; lo único que sigue afuera es lo que
  // Central todavía no lanzó (0237).
  const { data } = await supabase
    .from("servicios_postventa")
    .select("*")
    .eq("completado", false)
    .is("cerrado_at", null)
    .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
    .order("pedido_ejecutado_at", { ascending: false, nullsFirst: false })
    .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
    .limit(250);

  const verPrecios = puedeVerPrecios(perfil);

  // LOS CERRADOS (Rubí, 26-09: «si cierro un pedido, ¿dónde puedo verlo?»).
  // Esta pantalla solo traía los vivos, así que un pedido cerrado desaparecía
  // del área y había que buscarlo por el cliente. Central ya tenía su lista de
  // cerrados en «Sus pedidos»; postventa, ninguna. Del más reciente al más
  // antiguo, con buscador por cliente o equipo.
  const busquedaCerrados = (sp.q ?? "").trim();
  const cerrados =
    vista === "cerrados"
      ? (((
          await supabase
            .from("servicios_postventa")
            .select("id, cliente_texto, equipo, cerrado_at, completado, despachado_at, puesta_en_marcha, informe_cierre_id, updated_at")
            .or("cerrado_at.not.is.null,completado.eq.true")
            .order("cerrado_at", { ascending: false, nullsFirst: false })
            .order("updated_at", { ascending: false })
            .limit(busquedaCerrados ? 500 : 150)
        ).data ?? []) as {
          id: string;
          cliente_texto: string | null;
          equipo: string | null;
          cerrado_at: string | null;
          completado: boolean;
          despachado_at: string | null;
          puesta_en_marcha: string | null;
          informe_cierre_id: string | null;
          updated_at: string;
        }[]).filter((c) => {
          if (!busquedaCerrados) return true;
          const t = busquedaCerrados.toUpperCase();
          return `${c.cliente_texto ?? ""} ${c.equipo ?? ""}`.toUpperCase().includes(t);
        })
      : [];

  const pedidos: (TarjetaControl & { pasosTabla: FilaTabla["pasos"] })[] = ((data ?? []) as unknown as ServicioPostventa[]).map((crudo) => {
    const s = verPrecios ? crudo : sinPrecios(crudo);
    const bloques = bloquesPedido(s);
    const fase = faseActual(bloques);
    const avance = avancePedido(s);
    const frena = queLoFrena(s);

    // Lo pendiente ANTES de cada fase futura: es el guion de la alertita del
    // arrastre («para pasar a Despacho falta: …»).
    const faltantesHasta: Record<number, string[]> = {};
    for (const destino of [2, 3]) {
      faltantesHasta[destino] = bloques
        .filter((b) => b.numero < destino)
        .flatMap((b) => b.pasos.filter((p) => !p.hecho).map((p) => p.etiqueta));
    }

    return {
      id: s.id,
      fase,
      cliente: (s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, ""),
      // El pedido anterior al circuito se reconoce de un vistazo (0239).
      equipo: (s.informe_cierre_id ? "" : "【anterior al circuito】 ") + (s.equipo ?? "Sin equipo"),
      hechos: avance.hechos,
      total: avance.total,
      pct: Math.round((avance.hechos / avance.total) * 100),
      frena: frena ? { texto: frena.texto, dueno: etiquetaResponsable(frena.responsable), grave: frena.grave } : null,
      fechaDespacho: s.fecha_despacho ? fechaLima(s.fecha_despacho) : null,
      puedeAprobar: !s.aprobado_at && s.informe_cierre_id != null,
      fasesDetalle: bloques.map((b) => ({
        numero: b.numero,
        titulo: `${"①②③"[b.numero - 1]} ${b.titulo}`,
        actual: b.numero === fase,
        pasos: b.pasos.map((p) => ({
          etiqueta: p.etiqueta,
          hecho: p.hecho,
          trabado: p.trabado ?? null,
          dueno: etiquetaResponsable(p.responsable),
        })),
      })),
      faltantesHasta,
      pasosTabla: bloques.flatMap((b) =>
        b.pasos.map((p) => ({
          clave: p.clave,
          etiqueta: p.etiqueta,
          hecho: p.hecho,
          cuando: p.cuando,
          trabado: p.trabado ?? null,
          dueno: etiquetaResponsable(p.responsable),
        })),
      ),
    };
  });

  // La tabla por paso trabaja sobre los mismos pedidos: todos los pasos de
  // las tres fases, en orden, con su fecha y su responsable.
  const filas: FilaTabla[] = pedidos.map((t) => ({
    id: t.id,
    cliente: t.cliente,
    equipo: t.equipo,
    pasos: t.pasosTabla,
  }));

  return (
    <SeccionPanel
      titulo="Control de pedidos"
      accion={
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {pedidos.length} en curso
          </span>
          <span className="inline-flex overflow-hidden rounded-md border border-border text-xs font-medium">
            <Link
              href="/postventa/control"
              className={cn("px-2.5 py-1", vista === "tablero" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
            >
              Tablero
            </Link>
            <Link
              href="/postventa/control?vista=paso"
              className={cn("px-2.5 py-1", vista === "paso" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
            >
              Por paso
            </Link>
            {/* LA COLA DEL EXCEL, ACÁ Y NO EN OTRA PANTALLA. El mismo despacho
                vivía en dos destinos —este tablero y «Atenciones › Despachos»—
                y ninguno mencionaba al otro (informe de UX del 08-09). Es el
                mismo objeto visto de dos formas; ahora son dos vistas de una
                sola pantalla. */}
            <Link
              href="/postventa/control?vista=despachos"
              className={cn("px-2.5 py-1", vista === "despachos" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
            >
              Cola del Excel
            </Link>
            <Link
              href="/postventa/control?vista=cerrados"
              className={cn("px-2.5 py-1", vista === "cerrados" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
            >
              Cerrados
            </Link>
          </span>
        </span>
      }
    >
      <p className="mb-4 max-w-prose text-xs text-muted-foreground">
        {vista === "cerrados"
          ? "Los pedidos que ya se cerraron, del más reciente al más antiguo. Toque uno para ver todo su recorrido: despacho, puesta en marcha, fotos y documentos."
          : vista === "paso"
          ? "Una fila por empresa (la flecha despliega sus pedidos y su máquina), una columna por paso. Toque «Falta plano», «Falta despacho» o el paso que quiera y quedan solo los pedidos que lo deben: esa es su lista de trabajo. Cada paso se marca en la ficha del pedido."
          : "Cada pedido está en la fase donde le falta trabajo; la barrita se abre y dice qué falta en esa fase. La tarjeta se puede arrastrar: si intenta pasarla a una fase que todavía no le toca, la alerta le dice qué falta — y al marcar esos pasos en la ficha, pasa sola."}
      </p>

      {vista === "cerrados" ? (
        <div className="space-y-3">
          <form action="/postventa/control" className="flex gap-2">
            <input type="hidden" name="vista" value="cerrados" />
            <input
              name="q"
              defaultValue={busquedaCerrados}
              placeholder="Buscar por cliente o equipo"
              className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent">
              Buscar
            </button>
          </form>
          {cerrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {busquedaCerrados ? `Ningún pedido cerrado coincide con «${busquedaCerrados}».` : "Todavía no hay pedidos cerrados."}
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {cerrados.map((c) => (
                <li key={c.id}>
                  <Link href={`/postventa/pedidos/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-accent">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {(c.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "")}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {c.informe_cierre_id ? "" : "【anterior al circuito】 "}
                        {(c.equipo ?? "Sin equipo").replace(/\s+/g, " ")}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5 text-[11px]">
                      {c.despachado_at && <span className="rounded-full bg-secondary px-2 py-0.5">Despachado {fechaLima(c.despachado_at)}</span>}
                      <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-semibold text-[#1E7F4F]">
                        {c.cerrado_at ? `Cerrado ${fechaLima(c.cerrado_at)}` : "Completado"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!busquedaCerrados && cerrados.length >= 150 && (
            <p className="text-[11px] text-muted-foreground">Se muestran los 150 más recientes. Use el buscador para encontrar uno anterior.</p>
          )}
        </div>
      ) : vista === "despachos" ? (
        <ColaDespachos
          pestana="lista"
          verValue="despachos"
          busqueda={(sp.q ?? "").trim()}
          estado={sp.estado ?? ""}
          verPrecios={puedeVerPrecios(perfil)}
          hrefBase="/postventa/control"
        />
      ) : pedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos del flujo en curso ahora mismo.</p>
      ) : vista === "paso" ? (
        <TablaPorPaso filas={filas} falta={falta} base="/postventa/control" />
      ) : (
        <TableroControl pedidos={pedidos} />
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        La cola vieja del Excel está acá mismo, en la vista «Cola del Excel».
      </p>
    </SeccionPanel>
  );
}
