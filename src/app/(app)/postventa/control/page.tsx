import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TableroControl, type TarjetaControl } from "@/components/crm/tablero-control";
import { fechaLima } from "@/lib/fechas";
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

export default async function ControlPedidosPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  // Solo los pedidos del flujo digital en curso: la cola vieja del Excel se
  // trabaja en Atenciones → Despachos, no acá.
  const { data } = await supabase
    .from("servicios_postventa")
    .select("*")
    .eq("completado", false)
    .is("cerrado_at", null)
    .not("informe_cierre_id", "is", null)
    .order("pedido_ejecutado_at", { ascending: false })
    .limit(80);

  const verPrecios = puedeVerPrecios(perfil);

  const pedidos: TarjetaControl[] = ((data ?? []) as unknown as ServicioPostventa[]).map((crudo) => {
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
      equipo: s.equipo ?? "Sin equipo",
      hechos: avance.hechos,
      total: avance.total,
      pct: Math.round((avance.hechos / avance.total) * 100),
      frena: frena ? { texto: frena.texto, dueno: etiquetaResponsable(frena.responsable), grave: frena.grave } : null,
      fechaDespacho: s.fecha_despacho ? fechaLima(s.fecha_despacho) : null,
      puedeAprobar: !s.aprobado_at && s.informe_cierre_id != null,
      pasosFase: (bloques.find((b) => b.numero === fase)?.pasos ?? []).map((p) => ({
        etiqueta: p.etiqueta,
        hecho: p.hecho,
        trabado: p.trabado ?? null,
        dueno: etiquetaResponsable(p.responsable),
      })),
      faltantesHasta,
    };
  });

  return (
    <SeccionPanel
      titulo="Control de pedidos"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {pedidos.length} en curso
        </span>
      }
    >
      <p className="mb-4 max-w-prose text-xs text-muted-foreground">
        Cada pedido está en la fase donde le falta trabajo; la barrita se abre y dice qué falta en esa fase. La
        tarjeta se puede arrastrar: si intenta pasarla a una fase que todavía no le toca, la alerta le dice qué
        falta — y al marcar esos pasos en la ficha, pasa sola.
      </p>

      {pedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos del flujo en curso ahora mismo.</p>
      ) : (
        <TableroControl pedidos={pedidos} />
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        La cola vieja del Excel se sigue trabajando en Atenciones → Despachos.
      </p>
    </SeccionPanel>
  );
}
