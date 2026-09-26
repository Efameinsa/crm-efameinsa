import { AlertTriangle, CalendarClock, Hourglass, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { hoyLima } from "@/lib/periodo";
import { avisosDeCentral, diasEntre, formatoMonto, pedidosPorConfirmar, type PedidoFinanzas } from "@/lib/pagos-finanzas";
import Link from "@/components/enlace";
import { FilaTrabajo, Grupo, haceCuanto, Numero, Pildora, Vacio, type Tono } from "@/components/propuesta/kit";

/**
 * POR CONFIRMAR, EN EL ORDEN EN QUE SE TRABAJA (propuesta v2, 23-09).
 *
 * La lista de siempre (/finanzas) ya ordena bien, pero todo se ve igual: una
 * tarjeta grande por pedido. Aquí se parte en grupos que dicen POR QUÉ va
 * primero: alguien de postventa está esperando la respuesta, sale en tres
 * días, está observado, o puede esperar. Cada fila dice en qué cuenta buscar
 * el abono y cuánto falta; el botón abre el pedido donde se confirma.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>;
type Clave = "urgencia" | "postventa" | "pronto" | "observados" | "resto";
const GRUPOS: { clave: Clave; titulo: string; ayuda: string; tono: Tono }[] = [
  // La sirena de Central (0298) va primero (auditoría 25-09).
  { clave: "urgencia", titulo: "🚨 Central pide apurar", ayuda: "El cliente necesita la factura o quiere despachar.", tono: "urgente" },
  { clave: "postventa", titulo: "Postventa espera su respuesta", ayuda: "Pidieron confirmar el abono para programar la salida.", tono: "urgente" },
  { clave: "pronto", titulo: "Salen en 3 días o menos", ayuda: "Sin el abono confirmado no se despachan.", tono: "atencion" },
  { clave: "observados", titulo: "Observados", ayuda: "Usted los observó: esperan respuesta del comercial.", tono: "atencion" },
  { clave: "resto", titulo: "El resto", ayuda: "Salen más adelante o todavía sin fecha.", tono: "neutro" },
];

export async function conteo(supabase: Cliente): Promise<number> {
  return (await pedidosPorConfirmar(supabase)).length;
}
export const alerta = true;

function grupoDe(p: PedidoFinanzas, hoy: string): Clave {
  if (p.urgenciaAt) return "urgencia";
  if (p.solicitadoAt) return "postventa";
  if (p.fechaDespacho && diasEntre(hoy, p.fechaDespacho) <= 3) return "pronto";
  if (p.observadoAt) return "observados";
  return "resto";
}

function salida(p: PedidoFinanzas, hoy: string): { texto: string; tono: Tono } {
  if (!p.fechaDespacho) return { texto: "Sin fecha de despacho", tono: "neutro" };
  const d = diasEntre(hoy, p.fechaDespacho);
  if (d < 0) return { texto: `Despacho atrasado ${-d} d`, tono: "urgente" };
  if (d === 0) return { texto: "Sale hoy", tono: "urgente" };
  if (d === 1) return { texto: "Sale mañana", tono: "urgente" };
  return { texto: `Sale en ${d} días`, tono: d <= 3 ? "atencion" : "neutro" };
}

export default async function FinanzasPorConfirmar({ base }: PropsVista) {
  const supabase = await createClient();
  const hoy = hoyLima();
  const [pedidos, avisos] = await Promise.all([pedidosPorConfirmar(supabase), avisosDeCentral(supabase, 14)]);
  // LO QUE CENTRAL LE DERIVÓ (auditoría 25-09: solo se veía en /finanzas).
  const bloqueAvisos =
    avisos.length > 0 ? (
      <Grupo titulo="Avisos de Central" ayuda="Lo que Central le derivó en los últimos 14 días." conteo={avisos.length} tono="neutro">
        {avisos.map((a) => (
          <FilaTrabajo
            key={a.id}
            f={{
              titulo: a.cliente ?? "Aviso de Central",
              href: a.servicioId ? `/finanzas/pedidos/${a.servicioId}` : "/finanzas",
              sub: a.detalle || "Sin detalle",
              estado: null,
              dato: null,
              espera: null,
              edad: haceCuanto(a.createdAt),
              edadTono: "neutro",
              accion: { etiqueta: a.servicioId ? "Ver el pedido" : "Ver", href: a.servicioId ? `/finanzas/pedidos/${a.servicioId}` : "/finanzas" },
              tono: "neutro",
            }}
          />
        ))}
      </Grupo>
    ) : null;
  const porGrupo = new Map<Clave, PedidoFinanzas[]>(GRUPOS.map((g) => [g.clave, []]));
  for (const p of pedidos) porGrupo.get(grupoDe(p, hoy))!.push(p);
  const n = (c: Clave) => porGrupo.get(c)!.length;

  if (pedidos.length === 0) {
    return (
      <div className="space-y-4">
      <Vacio
        titulo="No hay abonos por confirmar"
        porque="Todos los pedidos liberados tienen lo que exige su condición de pago. Cuando Central libere un pedido nuevo aparece aquí, y le suena la campana."
        accion={{ etiqueta: "Ver los cobros pendientes", href: "/finanzas/cobrar" }}
      />
      {bloqueAvisos}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Numero icono={Wallet} etiqueta="Por confirmar" valor={pedidos.length} sub="Pedidos liberados sin su abono" href={base} />
        <Numero icono={Hourglass} etiqueta="Postventa espera" valor={n("postventa")} sub="Pidieron su respuesta" tono="urgente" href={`${base}#postventa`} />
        <Numero icono={CalendarClock} etiqueta="Salen en 3 días o menos" valor={n("pronto")} sub="Confírmelos primero" tono="atencion" href={`${base}#pronto`} />
        <Numero icono={AlertTriangle} etiqueta="Observados" valor={n("observados")} sub="Esperan al comercial" href={`${base}#observados`} />
      </div>

      {GRUPOS.map((g) => {
        const lista = porGrupo.get(g.clave)!;
        if (lista.length === 0) return null;
        return (
          <div key={g.clave} id={g.clave} className="scroll-mt-4">
            <Grupo titulo={g.titulo} ayuda={g.ayuda} conteo={lista.length} tono={g.tono}>
              {lista.map((p) => {
                const s = salida(p, hoy);
                const cuenta = p.serie === "OPEN" ? "Cuenta Open" : p.serie === "EFAMEINSA" ? "Cuenta Efameinsa" : null;
                const ref = [p.codigoCierre ? `Cierre ${p.codigoCierre}` : null, p.numeroErp ? `Pedido ${p.numeroErp}` : null, p.comercialNombre].filter(Boolean).join(" · ");
                return (
                  <FilaTrabajo
                    key={p.id}
                    f={{
                      titulo: p.cliente,
                      href: `/finanzas/pedidos/${p.id}`,
                      sub: `${ref ? `${ref} · ` : ""}Debe haber ${formatoMonto(p.moneda, p.requerido)} · ya ${formatoMonto(p.moneda, p.pagado)}${p.condicion ? ` · ${p.condicion}` : ""}`,
                      estado: g.clave === "postventa" ? { texto: "Postventa pidió confirmar", tono: "urgente" } : p.observadoAt ? { texto: "Observado", tono: "atencion" } : null,
                      dato: (
                        <>
                          {cuenta && <Pildora tono={p.serie === "OPEN" ? "neutro" : "info"}>{cuenta}</Pildora>}
                          <span className="text-xs font-bold tabular-nums text-destructive">Falta {formatoMonto(p.moneda, p.falta)}</span>
                        </>
                      ),
                      espera: p.urgenciaAt
                        ? `Central, ${haceCuanto(p.urgenciaAt)}${p.urgenciaN > 1 ? ` (${p.urgenciaN}.º aviso)` : ""}: ${p.urgenciaMotivo ?? "el cliente está esperando"}`
                        : p.observadoAt ? `Observado ${haceCuanto(p.observadoAt)}: ${p.observadoMotivo ?? "sin motivo"} · esperando al comercial` : null,
                      edad: p.solicitadoAt ? `Pidió ${haceCuanto(p.solicitadoAt)} · ${s.texto.toLowerCase()}` : s.texto,
                      edadTono: p.solicitadoAt ? "urgente" : s.tono,
                      accion: { etiqueta: "Confirmar u observar", href: `/finanzas/pedidos/${p.id}` },
                      tono: g.tono === "neutro" ? "neutro" : g.tono,
                    }}
                  />
                );
              })}
            </Grupo>
          </div>
        );
      })}
      {bloqueAvisos}
      <p className="text-xs text-muted-foreground">
        ¿Busca la lista de siempre, con los avisos y el expediente a mano? <Link href="/finanzas" className="font-semibold text-primary hover:underline">Por confirmar en números</Link>
      </p>
    </div>
  );
}
