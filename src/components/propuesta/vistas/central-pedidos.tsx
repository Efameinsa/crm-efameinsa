import { createClient } from "@/lib/supabase/server";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { cierresPorLiberar, PASOS_CENTRAL, quienTiene, type CierrePorLiberar, type PasoCentral } from "@/lib/propuesta/cola-central-finanzas";
import { formatoMonto } from "@/lib/pagos-finanzas";
import { Chips, FilaTrabajo, Grupo, haceCuanto, Numero, Pildora, Vacio, type Tono } from "@/components/propuesta/kit";
import { cn } from "@/lib/utils";

/**
 * PEDIDOS POR LIBERAR, COMO UN TUBO (propuesta v2, 23-09).
 *
 * La pantalla de siempre (/central/cierres) muestra cada cierre con sus cuatro
 * pasos abiertos: sirve para hacer el paso, no para saber qué hay. Esta vista
 * contesta primero lo que Central se pregunta al llegar: ¿cuántos hay en cada
 * paso?, ¿cuáles me tocan a mí y cuáles esperan al almacén o a Finanzas?, ¿de
 * cuándo es cada uno? Cada fila lleva UN botón que abre la pantalla donde el
 * paso se hace.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Lo que le toca a Central, lo más cerca de salir primero; lo que espera a otros, al final. */
const ORDEN_GRUPOS: PasoCentral[] = ["ejecutar", "revisar_liquidacion", "generar", "pedir_series", "esperando_liquidacion", "esperando_almacen"];
const AYUDA: Record<PasoCentral, string> = {
  pedir_series: "Pídaselas al almacén o escríbalas usted.",
  esperando_almacen: "El almacén tiene que poner las series. Puede generar el pedido igual.",
  generar: "Las series están: genere el pedido y se imprime como anexo.",
  esperando_liquidacion: "Finanzas tiene que subir el PDF de la liquidación.",
  revisar_liquidacion: "Finanzas la subió: acéptela o devuélvala con el motivo.",
  ejecutar: "Liquidación aceptada: márquelo ejecutado y lo ven todas las áreas.",
};
/** En qué paso del circuito de cuatro está (1 series · 2 pedido · 3 liquidación · 4 ejecutado). */
const NUMERO_PASO: Record<PasoCentral, number> = { pedir_series: 1, esperando_almacen: 1, generar: 2, esperando_liquidacion: 3, revisar_liquidacion: 3, ejecutar: 4 };
const ETAPAS = ["Series", "Pedido", "Liquidación", "Ejecución"];

const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export async function conteo(supabase: Cliente): Promise<number> {
  const cierres = await cierresPorLiberar(supabase);
  return cierres.filter((c) => quienTiene(c.paso) === "Central").length;
}
export const alerta = true;

export default async function CentralPedidos({ searchParams, base }: PropsVista) {
  const supabase = await createClient();
  const cierres = await cierresPorLiberar(supabase);
  const filtro = searchParams.paso ?? null;

  const porPaso = new Map<PasoCentral, CierrePorLiberar[]>(PASOS_CENTRAL.map((p) => [p.clave, []]));
  for (const c of cierres) porPaso.get(c.paso)!.push(c);
  for (const lista of porPaso.values()) {
    lista.sort((a, b) => (a.urgente !== b.urgente ? (a.urgente ? -1 : 1) : a.desde.localeCompare(b.desde)));
  }
  const deCentral = cierres.filter((c) => quienTiene(c.paso) === "Central").length;

  const visibles = ORDEN_GRUPOS.filter((p) =>
    filtro === "central" ? quienTiene(p) === "Central" : filtro === "otros" ? quienTiene(p) !== "Central" : !filtro || !ORDEN_GRUPOS.includes(filtro as PasoCentral) || filtro === p,
  );

  if (cierres.length === 0) {
    return (
      <Vacio
        titulo="No hay pedidos por liberar"
        porque="Todos los cierres emitidos ya tienen su pedido ejecutado y la liquidación aceptada. Cuando un comercial emita un cierre nuevo, aparece aquí en «Pedir series»."
        accion={{ etiqueta: "Ver los cierres liberados", href: "/central/cierres?ver=liberados" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* El tubo: una cifra por paso, en el orden del circuito. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {PASOS_CENTRAL.map((p) => {
          const n = porPaso.get(p.clave)!.length;
          return (
            <Numero
              key={p.clave}
              etiqueta={p.etiqueta}
              valor={n}
              sub={p.quien === "Central" ? "Le toca a usted" : p.quien === "Almacén" ? "Espera al almacén" : "Espera a Finanzas"}
              href={`${base}?paso=${p.clave}`}
              tono={p.quien === "Central" ? "atencion" : "neutro"}
            />
          );
        })}
      </div>

      <Chips
        etiqueta="Filtrar por paso"
        opciones={[
          { etiqueta: "Todos", href: base, activa: !filtro, conteo: cierres.length },
          { etiqueta: "Le toca a usted", href: `${base}?paso=central`, activa: filtro === "central", conteo: deCentral },
          { etiqueta: "Esperan a otra área", href: `${base}?paso=otros`, activa: filtro === "otros", conteo: cierres.length - deCentral },
          // El paso suelto se elige tocando su cifra; aquí solo aparece si está elegido.
          ...PASOS_CENTRAL.filter((p) => filtro === p.clave).map((p) => ({ etiqueta: p.etiqueta, href: `${base}?paso=${p.clave}`, activa: true, conteo: porPaso.get(p.clave)!.length })),
        ]}
      />

      {visibles.every((p) => porPaso.get(p)!.length === 0) ? (
        <Vacio
          titulo={filtro === "central" ? "Nada le toca a usted ahora" : filtro === "otros" ? "Nada espera al almacén ni a Finanzas" : `No hay cierres en «${PASOS_CENTRAL.find((p) => p.clave === filtro)?.etiqueta ?? "este paso"}»`}
          porque={
            filtro === "central"
              ? "Todo lo que está por liberar espera al almacén o a Finanzas. Cuando le devuelvan algo, aparece aquí."
              : filtro === "otros"
                ? "Todo lo que está por liberar depende de usted: mire «Le toca a usted»."
                : "Ningún cierre está en este paso ahora mismo. Mire los demás pasos para ver dónde están."
          }
          accion={{ etiqueta: "Ver todos", href: base }}
        />
      ) : (
        visibles.map((clave) => {
          const lista = porPaso.get(clave)!;
          if (lista.length === 0) return null;
          const def = PASOS_CENTRAL.find((p) => p.clave === clave)!;
          const esDeCentral = def.quien === "Central";
          return (
            <Grupo key={clave} titulo={def.etiqueta} conteo={lista.length} tono={esDeCentral ? "atencion" : "neutro"} ayuda={AYUDA[clave]}>
              {lista.map((c) => {
                const d = diasDesde(c.desde);
                const tono: Tono = c.urgente && esDeCentral ? "urgente" : esDeCentral ? (d >= 2 ? "atencion" : "info") : "neutro";
                const detalle = [
                  c.seriesTotal > 0 ? `${c.seriesCon} de ${c.seriesTotal} series` : c.servicioId ? "Sin equipos en la lista" : "Series sin pedir",
                  c.numeroPedido ? `Pedido ${c.numeroPedido}` : null,
                  c.monto != null ? formatoMonto(c.moneda, c.monto) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <FilaTrabajo
                    key={c.informeId}
                    f={{
                      titulo: c.cliente,
                      href: `/central/cierres#c-${c.informeId}`,
                      sub: c.rechazo ? `Usted la devolvió ${haceCuanto(c.rechazo.at)}: «${c.rechazo.motivo}»` : detalle,
                      estado: c.urgente ? { texto: "Urgente", tono: "urgente" } : c.ejecutadoSinLiquidacion ? { texto: "Ya ejecutado con código", tono: "info" } : null,
                      dato: (
                        <>
                          <Pildora tono={c.serie === "OPEN" ? "neutro" : "info"}>
                            {c.serie === "OPEN" ? "Open" : "Efameinsa"} {c.codigo}
                          </Pildora>
                          <MiniPasos actual={NUMERO_PASO[c.paso]} />
                        </>
                      ),
                      espera: esDeCentral ? null : `Esperando ${def.quien === "Almacén" ? "al almacén" : "a Finanzas"}${c.rechazo ? " (la corregida)" : ""}`,
                      edad: `En este paso ${haceCuanto(c.desde)}`,
                      edadTono: esDeCentral && d >= 3 ? "urgente" : d >= 1 ? "atencion" : "neutro",
                      accion: esDeCentral ? { etiqueta: def.accion, href: `/central/cierres#c-${c.informeId}` } : null,
                      tono,
                    }}
                  />
                );
              })}
            </Grupo>
          );
        })
      )}
    </div>
  );
}

/** La línea de los cuatro pasos en chico: lo hecho en verde, el actual en granate. */
function MiniPasos({ actual }: { actual: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Paso ${actual} de 4: ${ETAPAS[actual - 1]}`} title={`Paso ${actual} de 4: ${ETAPAS[actual - 1]}`}>
      {ETAPAS.map((e, i) => (
        <span key={e} className={cn("h-1.5 w-4 rounded-full", i + 1 < actual ? "bg-[#1E7F4F]" : i + 1 === actual ? "bg-primary" : "bg-border")} />
      ))}
      <span className="ml-1 text-[11px] text-muted-foreground">
        {actual}/4 {ETAPAS[actual - 1]}
      </span>
    </span>
  );
}
