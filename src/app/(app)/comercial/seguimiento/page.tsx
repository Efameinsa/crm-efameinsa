import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { traerPorLotes } from "@/lib/lotes";
import { ETIQUETA_ETAPA, haceCuanto } from "@/lib/derivados-central";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Cuánto hacia atrás se miran las preguntas de Central. */
const DIAS_ATRAS = 30;

const CERRADAS = new Set(["venta", "rechazada", "derivada"]);

type Fila = {
  leadId: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  oportunidadId: string | null;
  etapa: string | null;
  preguntadoAt: string;
  ultimaGestion: string | null;
  /** La próxima acción, si quedó agendada de hoy en adelante. */
  agendado: { accion: string | null; fecha: string } | null;
  respondido: boolean;
};

/**
 * LO QUE CENTRAL PREGUNTÓ (0446). Buzón, Ariana 13-10: el aviso «Central
 * pregunta por el seguimiento de 82 contactos» nombraba ocho «y 74 más» y
 * llevaba a la lista general de oportunidades, sin decir cuáles eran. Acá
 * están todos, uno por fila con su expediente: los que siguen sin una gestión
 * desde la pregunta arriba, y abajo los que ya se respondieron (con una
 * gestión registrada después, con la próxima acción agendada de hoy en
 * adelante —la compra a futuro, buzón Brenda 13-10— o con el expediente
 * cerrado).
 *
 * Cada uno ve lo que le preguntaron a él (RLS `consulta_seguimiento_select`).
 */
export default async function SeguimientoPreguntadoPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const desde = new Date(Date.now() - DIAS_ATRAS * 86_400_000).toISOString();

  const { data: consultas, error } = await supabase
    .from("consultas_seguimiento")
    .select("lead_id, created_at")
    .eq("para", perfil.id)
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudo cargar lo que preguntó Central: ${error.message}`);

  // La pregunta más reciente de cada contacto es la que cuenta.
  const preguntaPorLead = new Map<string, string>();
  for (const c of consultas ?? []) if (!preguntaPorLead.has(c.lead_id)) preguntaPorLead.set(c.lead_id, c.created_at);
  const leadIds = [...preguntaPorLead.keys()];

  type LeadCrudo = {
    id: string;
    codigo: string | null;
    razon_social: string | null;
    nombre_contacto: string | null;
    telefono: string | null;
    oportunidad_id: string | null;
  };
  type OpCruda = { id: string; lead_id: string | null; etapa: string; proxima_accion: string | null; proxima_accion_at: string | null };
  const [leads, opsDeLead] = await Promise.all([
    traerPorLotes<LeadCrudo>(leadIds, (lote) =>
      supabase.from("leads").select("id, codigo, razon_social, nombre_contacto, telefono, oportunidad_id").in("id", lote),
    ),
    traerPorLotes<OpCruda>(leadIds, (lote) =>
      supabase.from("oportunidades").select("id, lead_id, etapa, proxima_accion, proxima_accion_at").in("lead_id", lote).order("created_at"),
    ),
  ]);
  if (leads.error || opsDeLead.error) throw new Error(`No se pudo cargar lo que preguntó Central: ${leads.error ?? opsDeLead.error}`);

  // El expediente: el directo del lead (0141) manda; si no, el primero creado con él.
  const primeraPorLead = new Map<string, string>();
  for (const o of opsDeLead.data) if (o.lead_id && !primeraPorLead.has(o.lead_id)) primeraPorLead.set(o.lead_id, o.id);
  const opDe = (l: LeadCrudo) => l.oportunidad_id ?? primeraPorLead.get(l.id) ?? null;
  const opIds = [...new Set(leads.data.map(opDe).filter((x): x is string => !!x))];
  const faltantes = opIds.filter((id) => !opsDeLead.data.some((o) => o.id === id));

  const [opsDirectas, acts] = await Promise.all([
    traerPorLotes<OpCruda>(faltantes, (lote) => supabase.from("oportunidades").select("id, lead_id, etapa, proxima_accion, proxima_accion_at").in("id", lote)),
    traerPorLotes<{ oportunidad_id: string; realizada_at: string }>(opIds, (lote) =>
      supabase.from("actividades").select("oportunidad_id, realizada_at").in("oportunidad_id", lote),
    ),
  ]);
  if (opsDirectas.error || acts.error) throw new Error(`No se pudo cargar lo que preguntó Central: ${opsDirectas.error ?? acts.error}`);

  const opPorId = new Map([...opsDeLead.data, ...opsDirectas.data].map((o) => [o.id, o]));
  const hoy = hoyLima();
  const ultimaPorOp = new Map<string, string>();
  for (const a of acts.data) {
    const u = ultimaPorOp.get(a.oportunidad_id);
    if (!u || a.realizada_at > u) ultimaPorOp.set(a.oportunidad_id, a.realizada_at);
  }

  const filas: Fila[] = leads.data.map((l) => {
    const op = opDe(l);
    const o = op ? opPorId.get(op) : undefined;
    const etapa = o?.etapa ?? null;
    const preguntadoAt = preguntaPorLead.get(l.id) as string;
    const ultimaGestion = op ? (ultimaPorOp.get(op) ?? null) : null;
    const agendado =
      o?.proxima_accion_at && o.proxima_accion_at.slice(0, 10) >= hoy && !(etapa && CERRADAS.has(etapa))
        ? { accion: o.proxima_accion, fecha: o.proxima_accion_at.slice(0, 10) }
        : null;
    return {
      leadId: l.id,
      codigo: l.codigo,
      nombre: (l.razon_social?.trim() || l.nombre_contacto?.trim() || l.codigo || "Contacto sin nombre").replace(/^\d{8,11}\s*-\s*/, ""),
      telefono: l.telefono,
      oportunidadId: op,
      etapa,
      preguntadoAt,
      ultimaGestion,
      agendado,
      respondido:
        (etapa !== null && CERRADAS.has(etapa)) || agendado !== null || (ultimaGestion !== null && ultimaGestion > preguntadoAt),
    };
  });
  // Lo más viejo sin gestión primero: es lo que más urge.
  filas.sort((a, b) => (a.ultimaGestion ?? "").localeCompare(b.ultimaGestion ?? ""));
  const pendientes = filas.filter((f) => !f.respondido);
  const respondidos = filas.filter((f) => f.respondido);

  return (
    <div className="space-y-4">
      <SeccionPanel
        titulo="Lo que Central preguntó"
        accion={
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {pendientes.length} por responder · {respondidos.length} ya respondido{respondidos.length === 1 ? "" : "s"}
          </span>
        }
      >
        <p className="mb-3 max-w-prose text-xs text-muted-foreground">
          Contactos derivados por los que Central le preguntó en los últimos {DIAS_ATRAS} días porque llevaban más de 7 días sin
          una gestión. Para regularizar cada uno, entre a su expediente y registre lo que hizo (llamada, WhatsApp, cotización) con su
          próxima acción —si es compra a futuro, agendada para la fecha en que lo retomará— o, si ya no procede, ciérrelo como
          «No prosperó». En cuanto lo haga, pasa solo a «Ya respondidos» y Central lo ve.
        </p>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Central no le ha preguntado por ningún contacto en los últimos {DIAS_ATRAS} días.</p>
        ) : pendientes.length === 0 ? (
          <p className="text-sm text-[#1E7F4F]">Todo lo que preguntó Central ya tiene respuesta.</p>
        ) : (
          <ListaPreguntados filas={pendientes} />
        )}
      </SeccionPanel>
      {respondidos.length > 0 && (
        <SeccionPanel titulo={`Ya respondidos (${respondidos.length})`}>
          <ListaPreguntados filas={respondidos} />
        </SeccionPanel>
      )}
    </div>
  );
}

function ListaPreguntados({ filas }: { filas: Fila[] }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {filas.map((f) => {
        const etapa = f.etapa ? ETIQUETA_ETAPA[f.etapa] : null;
        return (
          <li key={f.leadId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{f.codigo ?? "—"}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{f.nombre}</span>
            {f.telefono && <span className="text-xs text-muted-foreground">{f.telefono}</span>}
            {etapa && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", etapa.clase)}>{etapa.texto}</span>}
            <span className="text-xs text-muted-foreground">
              {f.ultimaGestion ? `Última gestión ${haceCuanto(f.ultimaGestion)}` : "Sin gestiones"} · preguntado {haceCuanto(f.preguntadoAt)}
            </span>
            {f.agendado && (
              <span className="text-xs font-medium text-foreground">
                Agendado: {f.agendado.accion ?? "próxima acción"} · {f.agendado.fecha.split("-").reverse().join("/")}
              </span>
            )}
            {f.oportunidadId ? (
              <Link href={`/comercial/oportunidades/${f.oportunidadId}`} className="text-xs font-semibold text-primary hover:underline">
                Abrir expediente
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Sin expediente</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
