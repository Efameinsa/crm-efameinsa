import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { fechaCalendarioLarga, fechaLima } from "@/lib/fechas";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ChipsParam } from "@/components/crm/chips-param";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Evidencia del embudo real de marketing: la lista de contactos que hay
// detrás de cada barra (leads → asignados → ventas), con lo necesario para
// auditar cada número a mano. Para las ventas se muestra la PRUEBA del
// enlace lado a lado: teléfono / correo / RUC del lead contra los del
// cliente, y el código PRO de Central si existe. Misma cohorte que el
// panel: leads por fecha de llegada, sin importar cuándo cerró la venta.

type Filtro = "todos" | "asignados" | "ventas";
const ETIQUETA_FILTRO: Record<Filtro, string> = { todos: "Leads en el CRM", asignados: "Asignados a comercial", ventas: "Ventas cerradas" };

interface Lead {
  id: string;
  codigo: string | null;
  recibido_at: string;
  nombre_contacto: string | null;
  razon_social: string | null;
  telefono: string | null;
  telefono_normalizado: string | null;
  email: string | null;
  num_doc: string | null;
  canal: string;
  estado: string;
  utm_campaign: string | null;
  asignado_a: string | null;
  cuenta_id: string | null;
  mensaje: string | null;
}
interface Op {
  id: string;
  lead_id: string | null;
  etapa: string;
  cuenta_id: string;
  comercial_id: string;
  cerrada_at: string | null;
  procedencia: string | null;
  codigo_central: string | null;
  origen: string;
}
interface Venta { oportunidad_id: string; fecha_venta: string; monto_total: number; moneda: string }
interface Cuenta { id: string; razon_social: string; tipo_doc: string; num_doc: string | null }
interface Contacto { cuenta_id: string; telefono_normalizado: string | null; email: string | null }

const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export default async function LeadsMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; plataforma?: string; campania?: string; filtro?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "mes");
  const plataforma = sp.plataforma === "google" || sp.plataforma === "meta" ? sp.plataforma : undefined;
  const filtro: Filtro = sp.filtro === "asignados" || sp.filtro === "ventas" ? sp.filtro : "todos";
  const campania = sp.campania || null;

  const supabase = await createClient();

  let q = supabase
    .from("leads")
    .select("id, codigo, recibido_at, nombre_contacto, razon_social, telefono, telefono_normalizado, email, num_doc, canal, estado, utm_campaign, asignado_a, cuenta_id, mensaje")
    .not("utm_campaign", "is", null)
    .gte("recibido_at", `${periodo.desde}T00:00:00`)
    .lte("recibido_at", `${periodo.hasta}T23:59:59`)
    .order("recibido_at", { ascending: false });
  if (campania) q = q.eq("utm_campaign", campania);
  const { data: leadsData } = await q;
  let leads = (leadsData ?? []) as Lead[];

  // Campañas (nombre + plataforma) para etiquetar y filtrar por plataforma.
  const { data: campaniasData } = await supabase.from("campanias").select("campaign_id, nombre, plataforma");
  const campanias = new Map((campaniasData ?? []).map((c) => [String(c.campaign_id), c]));
  if (plataforma) leads = leads.filter((l) => campanias.get(String(l.utm_campaign))?.plataforma === plataforma);

  const leadIds = leads.map((l) => l.id);
  const { data: opsData } = leadIds.length
    ? await supabase.from("oportunidades").select("id, lead_id, etapa, cuenta_id, comercial_id, cerrada_at, procedencia, codigo_central, origen").in("lead_id", leadIds)
    : { data: [] as Op[] };
  const ops = (opsData ?? []) as Op[];
  const opsPorLead = new Map<string, Op[]>();
  for (const o of ops) { if (!o.lead_id) continue; if (!opsPorLead.has(o.lead_id)) opsPorLead.set(o.lead_id, []); opsPorLead.get(o.lead_id)!.push(o); }

  const opIds = ops.map((o) => o.id);
  const { data: ventasData } = opIds.length
    ? await supabase.from("ventas").select("oportunidad_id, fecha_venta, monto_total, moneda").in("oportunidad_id", opIds)
    : { data: [] as Venta[] };
  const ventasPorOp = new Map<string, Venta[]>();
  for (const v of (ventasData ?? []) as Venta[]) { if (!ventasPorOp.has(v.oportunidad_id)) ventasPorOp.set(v.oportunidad_id, []); ventasPorOp.get(v.oportunidad_id)!.push(v); }

  const cuentaIds = Array.from(new Set([...ops.map((o) => o.cuenta_id), ...leads.map((l) => l.cuenta_id).filter(Boolean) as string[]]));
  const [{ data: cuentasData }, { data: contactosData }, { data: perfilesData }] = await Promise.all([
    cuentaIds.length ? supabase.from("cuentas").select("id, razon_social, tipo_doc, num_doc").in("id", cuentaIds) : Promise.resolve({ data: [] as Cuenta[] }),
    cuentaIds.length ? supabase.from("contactos").select("cuenta_id, telefono_normalizado, email").in("cuenta_id", cuentaIds) : Promise.resolve({ data: [] as Contacto[] }),
    supabase.from("perfiles").select("id, nombre, codigo_comercial"),
  ]);
  const cuentas = new Map(((cuentasData ?? []) as Cuenta[]).map((c) => [c.id, c]));
  const contactosPorCuenta = new Map<string, Contacto[]>();
  for (const c of (contactosData ?? []) as Contacto[]) { if (!contactosPorCuenta.has(c.cuenta_id)) contactosPorCuenta.set(c.cuenta_id, []); contactosPorCuenta.get(c.cuenta_id)!.push(c); }
  const perfiles = new Map((perfilesData ?? []).map((p) => [p.id, p]));

  // Filas: un lead por fila; si tiene oportunidad ganada, se muestra la venta.
  const filas = leads.map((l) => {
    const misOps = opsPorLead.get(l.id) ?? [];
    const ganada = misOps.find((o) => o.etapa === "venta") ?? null;
    const asignado = misOps.length > 0 || !!l.asignado_a;
    const cuentaId = ganada?.cuenta_id ?? misOps[0]?.cuenta_id ?? l.cuenta_id ?? null;
    const cuenta = cuentaId ? cuentas.get(cuentaId) ?? null : null;
    const contactos = cuentaId ? contactosPorCuenta.get(cuentaId) ?? [] : [];
    const ventas = ganada ? ventasPorOp.get(ganada.id) ?? [] : [];
    const comercialId = ganada?.comercial_id ?? misOps[0]?.comercial_id ?? l.asignado_a ?? null;
    // Evidencia del enlace lead ↔ cliente
    const telLead = l.telefono_normalizado;
    const emailLead = l.email?.trim().toLowerCase() ?? null;
    const coincideTel = !!telLead && contactos.some((c) => c.telefono_normalizado === telLead);
    const coincideEmail = !!emailLead && contactos.some((c) => (c.email ?? "").trim().toLowerCase() === emailLead);
    const coincideDoc = !!cuenta?.num_doc && soloDigitos(l.num_doc) === cuenta.num_doc;
    return { l, ganada, asignado, cuenta, ventas, comercialId, coincideTel, coincideEmail, coincideDoc, campania: campanias.get(String(l.utm_campaign)) ?? null };
  });
  const visibles = filas.filter((f) => (filtro === "todos" ? true : filtro === "asignados" ? f.asignado : !!f.ganada));

  const base = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta });
  if (plataforma) base.set("plataforma", plataforma);
  const volver = `/gerencia/marketing?${base.toString()}`;
  const totalMonto = visibles.reduce((s, f) => s + f.ventas.reduce((x, v) => x + (v.moneda === "USD" ? v.monto_total : 0), 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={volver} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver al panel de marketing
        </Link>
        <ChipsParam
          nombre="filtro"
          valor={filtro === "todos" ? null : filtro}
          opciones={[
            { valor: null, etiqueta: `Leads (${filas.length})` },
            { valor: "asignados", etiqueta: `Asignados (${filas.filter((f) => f.asignado).length})` },
            { valor: "ventas", etiqueta: `Ventas (${filas.filter((f) => f.ganada).length})` },
          ]}
        />
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {ETIQUETA_FILTRO[filtro]} · leads de publicidad llegados del{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.desde)}</span> al{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.hasta)}</span>
        {plataforma && <> · {plataforma === "google" ? "Google Ads" : "Meta Ads"}</>}
        {campania && <> · campaña {campanias.get(campania)?.nombre ?? campania}</>}
        {filtro === "ventas" && totalMonto > 0 && (
          <>
            {" "}
            · <span className="font-medium text-foreground">US$ {Math.round(totalMonto).toLocaleString("es-PE")}</span> con monto registrado
          </>
        )}
      </p>

      <SeccionPanel titulo={`${ETIQUETA_FILTRO[filtro]} — ${visibles.length}`}>
        {visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada que mostrar con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead (llegada)</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Comercial</TableHead>
                  <TableHead>Cliente en el CRM</TableHead>
                  {filtro === "ventas" ? (
                    <>
                      <TableHead>Prueba del enlace</TableHead>
                      <TableHead>Venta</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </>
                  ) : (
                    <TableHead>Estado</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map(({ l, ganada, asignado, cuenta, ventas, comercialId, coincideTel, coincideEmail, coincideDoc, campania: camp }) => {
                  const perfil = comercialId ? perfiles.get(comercialId) : null;
                  const contenidoCliente = cuenta ? (
                    <>
                      <p className="line-clamp-2 font-medium text-foreground" title={cuenta.razon_social}>{cuenta.razon_social}</p>
                      <p className="text-[11px] text-muted-foreground">{cuenta.tipo_doc !== "SIN_DOC" ? `${cuenta.tipo_doc} ${cuenta.num_doc}` : "sin RUC/DNI"}</p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  );
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-[240px] whitespace-normal">
                        <p className="font-medium text-foreground">{l.nombre_contacto || l.razon_social || "Sin nombre"}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {fechaLima(l.recibido_at)} · {l.telefono ?? "sin teléfono"}
                          {l.email ? ` · ${l.email}` : ""}
                        </p>
                        {l.codigo && <p className="text-[10px] text-muted-foreground">{l.codigo}</p>}
                      </TableCell>
                      <TableCell className="max-w-[180px] whitespace-normal text-xs">
                        <p className="line-clamp-2 text-foreground" title={camp?.nombre ?? String(l.utm_campaign)}>{camp?.nombre ?? `ID ${l.utm_campaign}`}</p>
                        <p className="text-[10px] text-muted-foreground">{camp?.plataforma === "meta" ? "Meta Ads" : camp?.plataforma === "google" ? "Google Ads" : CANAL_LABEL[l.canal] ?? l.canal}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {perfil ? (
                          <>
                            {perfil.nombre}
                            {perfil.codigo_comercial ? <span className="text-muted-foreground"> ({perfil.codigo_comercial})</span> : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px] whitespace-normal text-xs">
                        {cuenta ? (
                          <Link href={`/gerencia/clientes/${cuenta.id}`} className="block hover:underline">{contenidoCliente}</Link>
                        ) : (
                          contenidoCliente
                        )}
                      </TableCell>
                      {filtro === "ventas" ? (
                        <>
                          <TableCell className="text-[11px]">
                            <ul className="space-y-0.5">
                              <Prueba ok={coincideTel} texto={`Teléfono ${l.telefono_normalizado ?? "—"}`} />
                              <Prueba ok={coincideEmail} texto={`Correo ${l.email ?? "—"}`} />
                              <Prueba ok={coincideDoc} texto={`RUC/DNI ${l.num_doc ?? "—"}`} />
                              {ganada?.codigo_central && <li className="text-muted-foreground">Código Central: {ganada.codigo_central}</li>}
                            </ul>
                          </TableCell>
                          <TableCell className="text-xs">
                            {ganada && (
                              <>
                                <p className="tabular-nums text-foreground">{ganada.cerrada_at ? fechaLima(ganada.cerrada_at) : "—"}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {ganada.origen === "historico_excel" ? "hoja del comercial" : "registrada en el CRM"}
                                  {ganada.procedencia ? ` · declarado: ${ganada.procedencia}` : ""}
                                </p>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                            {ventas.length === 0 ? (
                              <span className="text-amber-700">sin monto en la hoja</span>
                            ) : (
                              ventas.map((v, i) => (
                                <p key={i} className="font-semibold text-foreground">
                                  {v.moneda === "PEN" ? "S/" : "US$"} {v.monto_total.toLocaleString("es-PE")}
                                </p>
                              ))
                            )}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="text-xs">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              ganada ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : asignado ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
                            )}
                          >
                            {ganada ? "Venta" : asignado ? "Asignado" : l.estado === "historico" ? "Gestionado fuera del CRM" : l.estado === "pendiente_triaje" ? "Pendiente de triaje" : l.estado === "duplicado" ? "Repetido, ya estaba registrado" : l.estado}
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {filtro === "ventas" && visibles.length > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Una venta se atribuye a un lead solo cuando coincide un identificador único (teléfono, correo, RUC/DNI o código PRO de Central) con un solo
            lead candidato, llegado antes o el mismo día de la venta. Nunca por nombre.
          </p>
        )}
      </SeccionPanel>
    </div>
  );
}

function Prueba({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={cn("flex items-center gap-1", ok ? "text-[#1E7F4F]" : "text-muted-foreground/70")}>
      {ok ? <Check className="size-3" /> : <span className="inline-block size-3 text-center leading-3">·</span>}
      <span className={cn(!ok && "line-through decoration-muted-foreground/40")}>{texto}</span>
    </li>
  );
}
