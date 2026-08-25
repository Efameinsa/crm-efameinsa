import { Search, FileDown } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo, type PresetPeriodo } from "@/lib/periodo";
import { fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Lo que Central derivó, y en qué quedó.
 *
 * POR QUÉ EXISTE. Central reportó el 25-08 que «no puede ver sus derivados,
 * solo ve lo que ella registró». Es exacto: en cuanto asigna un contacto, este
 * sale de la bandeja de triaje y no vuelve a aparecer en ninguna pantalla suya.
 * Lo único que le quedaba eran los CONTEOS por comercial —«hoy derivaste 4 a
 * C5»— sin poder abrir cuáles ni saber qué pasó con ellos.
 *
 * Y es justo ella quien lo necesita: es la que atiende al cliente que vuelve a
 * llamar preguntando si alguien lo contactó. Sin esto tenía que preguntarle al
 * comercial por WhatsApp.
 *
 * QUÉ AGREGA sobre el conteo que ya existía: el contacto, a quién se le
 * derivó, cuánto tardó en derivarse —el dato que gerencia venía midiendo a
 * mano— y en qué etapa está hoy el trabajo del comercial, con sus cotizaciones.
 * El sistema ya la deja leer todo eso; lo que faltaba era la pantalla.
 */

const PRESETS: PresetPeriodo[] = ["mes", "mes_anterior", "30d", "anio", "todo"];

const ETIQUETA_ETAPA: Record<string, { texto: string; clase: string }> = {
  asignada: { texto: "Recibido, sin filtrar", clase: "bg-secondary text-muted-foreground" },
  filtrada: { texto: "Filtrado", clase: "bg-secondary text-foreground" },
  cotizada: { texto: "Cotizado", clase: "bg-primary/10 text-primary" },
  seguimiento: { texto: "En seguimiento", clase: "bg-primary/10 text-primary" },
  potencial: { texto: "En negociación", clase: "bg-amber-500/15 text-amber-800" },
  venta: { texto: "Vendido", clase: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada: { texto: "Rechazado", clase: "bg-destructive/10 text-destructive" },
  derivada: { texto: "Pasado a otro", clase: "bg-secondary text-muted-foreground" },
};

const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  formulario_web: "Formulario web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Correo",
  presencial: "Presencial",
  referido: "Referido",
  otro: "Otro",
};

/** "3 h 20 min", "2 d 4 h". Es la demora que gerencia venía midiendo a mano. */
function demora(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return "—";
  const min = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export default async function DerivadosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; comercial?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "30d");
  const busqueda = (sp.q ?? "").trim();
  const supabase = await createClient();

  const { data: comerciales } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .eq("rol", "comercial")
    .eq("activo", true)
    .eq("es_prueba", false)
    .order("codigo_comercial");

  let q = supabase
    .from("leads")
    .select("id, codigo, nombre_contacto, razon_social, telefono, canal, mensaje, recibido_at, asignado_at, asignado_a")
    .eq("estado", "asignado")
    .eq("es_prueba", false)
    .gte("asignado_at", `${periodo.desde}T00:00:00-05:00`)
    .lte("asignado_at", `${periodo.hasta}T23:59:59-05:00`);
  if (sp.comercial) q = q.eq("asignado_a", sp.comercial);
  if (busqueda) q = q.or(`codigo.ilike.%${busqueda}%,nombre_contacto.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`);

  const { data: leads } = await q.order("asignado_at", { ascending: false }).limit(400);
  const ids = (leads ?? []).map((l) => l.id);

  // Qué hizo el comercial con cada uno. Va en dos consultas y no en un join
  // anidado porque la oportunidad cuelga del lead y la cotización de la
  // oportunidad: pedirlo todo junto traía filas repetidas por cada cotización.
  const { data: ops } = ids.length
    ? await supabase.from("oportunidades").select("id, lead_id, etapa").in("lead_id", ids)
    : { data: [] };
  const opIds = (ops ?? []).map((o) => o.id);
  const { data: cots } = opIds.length
    ? await supabase
        .from("cotizaciones")
        .select("id, codigo, oportunidad_id, estado, enviada_at, total, moneda")
        .in("oportunidad_id", opIds)
    : { data: [] };

  const opPorLead = new Map((ops ?? []).map((o) => [o.lead_id as string, o]));
  const cotsPorOp = new Map<string, typeof cots>();
  for (const c of cots ?? []) {
    const xs = cotsPorOp.get(c.oportunidad_id) ?? [];
    xs.push(c);
    cotsPorOp.set(c.oportunidad_id, xs);
  }
  const nombreDe = new Map((comerciales ?? []).map((c) => [c.id, c]));

  return (
    <SeccionPanel
      titulo="Lo que derivé"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {(leads ?? []).length} contacto{(leads ?? []).length === 1 ? "" : "s"}
        </span>
      }
    >
      <FiltroPeriodo
        {...periodo}
        presetActivo={periodo.preset}
        presets={PRESETS}
        comerciales={comerciales ?? []}
        comercialId={sp.comercial ?? null}
      />

      <form className="my-3 flex gap-2" action="/central/derivados">
        {/* El período y el comercial elegidos se conservan al buscar. */}
        <input type="hidden" name="desde" value={periodo.desde} />
        <input type="hidden" name="hasta" value={periodo.hasta} />
        {sp.comercial && <input type="hidden" name="comercial" value={sp.comercial} />}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={busqueda} placeholder="Código, nombre o teléfono" className="pl-8" />
        </div>
        <Button type="submit" size="sm">Buscar</Button>
      </form>

      {!leads || leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No derivó ningún contacto en este período{busqueda ? ` que diga «${busqueda}»` : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead>Contacto</TableHead>
                <TableHead>Vía</TableHead>
                <TableHead>Derivado a</TableHead>
                <TableHead>Cuándo</TableHead>
                <TableHead>Demoró</TableHead>
                <TableHead>En qué quedó</TableHead>
                <TableHead>Cotizaciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => {
                const op = opPorLead.get(l.id);
                const etapa = op ? ETIQUETA_ETAPA[op.etapa as string] : null;
                const misCots = op ? (cotsPorOp.get(op.id) ?? []) : [];
                const com = l.asignado_a ? nombreDe.get(l.asignado_a) : null;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-[220px] align-top">
                      <span className="text-xs font-medium text-foreground">{l.nombre_contacto ?? "—"}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">{l.codigo}</span>
                      {l.telefono && (
                        <span className="block text-[11px] text-muted-foreground">{l.telefono}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-xs">{ETIQUETA_CANAL[l.canal] ?? l.canal}</TableCell>
                    <TableCell className="align-top text-xs">
                      <b>{com?.codigo_comercial ?? "—"}</b>
                      <span className="block text-[11px] text-muted-foreground">{com?.nombre ?? ""}</span>
                    </TableCell>
                    <TableCell className="align-top text-xs tabular-nums">
                      {l.asignado_at ? fechaHoraLima(l.asignado_at) : "—"}
                    </TableCell>
                    <TableCell className="align-top text-xs tabular-nums text-muted-foreground">
                      {demora(l.recibido_at, l.asignado_at)}
                    </TableCell>
                    <TableCell className="align-top">
                      {/* Sin oportunidad: el lead se derivó pero el comercial
                          todavía no lo abrió. Decirlo así, y no dejarlo en
                          blanco, es lo que le permite a Central reclamar. */}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          etapa?.clase ?? "bg-amber-500/15 text-amber-800",
                        )}
                      >
                        {etapa?.texto ?? "Sin abrir todavía"}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      {misCots.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        misCots.map((c) => (
                          <Link
                            key={c.id}
                            href={`/api/cotizaciones/${c.id}/pdf`}
                            target="_blank"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <FileDown className="size-3" />
                            <span className="font-mono">{c.codigo ?? "Borrador"}</span>
                            <span className="text-muted-foreground">
                              {c.moneda} {Number(c.total).toLocaleString("es-PE")}
                            </span>
                          </Link>
                        ))
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SeccionPanel>
  );
}
