import { Hourglass, Upload, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { pedidosPorLiquidar, type EstadoLiquidacion, type PedidoPorLiquidar } from "@/lib/propuesta/cola-central-finanzas";
import { formatoMonto } from "@/lib/pagos-finanzas";
import { FilaTrabajo, Grupo, haceCuanto, Numero, Pildora, Vacio, type Tono } from "@/components/propuesta/kit";

/**
 * POR LIQUIDAR (propuesta v2, 23-09). Los pedidos que Central ya generó y
 * esperan la liquidación de Finanzas. Arriba lo que Central devolvió —ya se
 * atrasó una vez—, luego lo que falta subir, y al final lo que ya se subió y
 * espera que Central lo acepte (no es trabajo de Finanzas, pero se ve para
 * que nadie pregunte «¿y la mía?»). El PDF se sube en /finanzas/liquidar.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>;
const GRUPOS: { clave: EstadoLiquidacion; titulo: string; ayuda: string; tono: Tono; accion: string | null }[] = [
  { clave: "rechazada", titulo: "Rechazadas por Central", ayuda: "Corrija lo que dice el motivo y súbala de nuevo.", tono: "urgente", accion: "Subir la corregida" },
  { clave: "por_subir", titulo: "Por subir", ayuda: "Mire el cierre y el pedido, y suba el PDF.", tono: "atencion", accion: "Subir la liquidación" },
  { clave: "subida", titulo: "Subidas, esperando a Central", ayuda: "Central la acepta o se la devuelve con el motivo.", tono: "neutro", accion: null },
];

export async function conteo(supabase: Cliente): Promise<number> {
  return (await pedidosPorLiquidar(supabase)).filter((p) => p.estado !== "subida").length;
}
export const alerta = true;

export default async function FinanzasPorLiquidar({ base }: PropsVista) {
  const supabase = await createClient();
  const pedidos = await pedidosPorLiquidar(supabase);
  const porEstado = new Map<EstadoLiquidacion, PedidoPorLiquidar[]>(GRUPOS.map((g) => [g.clave, []]));
  for (const p of pedidos) porEstado.get(p.estado)!.push(p);
  const n = (c: EstadoLiquidacion) => porEstado.get(c)!.length;

  if (pedidos.length === 0) {
    return (
      <Vacio
        titulo="No hay liquidaciones pendientes"
        porque="Todos los pedidos que generó Central tienen su liquidación aceptada. Cuando Central genere uno nuevo aparece aquí en «Por subir»."
        accion={{ etiqueta: "Ir a los abonos por confirmar", href: "/finanzas" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Numero icono={XCircle} etiqueta="Rechazadas" valor={n("rechazada")} sub="Central las devolvió" tono="urgente" href={`${base}#rechazada`} />
        <Numero icono={Upload} etiqueta="Por subir" valor={n("por_subir")} sub="Le toca a usted" tono="atencion" href={`${base}#por_subir`} />
        <Numero icono={Hourglass} etiqueta="Esperando a Central" valor={n("subida")} sub="Ya las subió" href={`${base}#subida`} />
      </div>

      {GRUPOS.map((g) => {
        const lista = porEstado.get(g.clave)!;
        if (lista.length === 0) return null;
        return (
          <div key={g.clave} id={g.clave} className="scroll-mt-4">
            <Grupo titulo={g.titulo} ayuda={g.ayuda} conteo={lista.length} tono={g.tono}>
              {lista.map((p) => (
                <FilaTrabajo
                  key={p.id}
                  f={{
                    titulo: p.cliente,
                    sub:
                      p.rechazo
                        ? `Motivo de Central: «${p.rechazo.motivo}»`
                        : [`Pedido ${p.numeroPedido}`, p.codigoCierre ? `cierre ${p.codigoCierre}` : null, p.monto != null ? formatoMonto(p.moneda, p.monto) : null].filter(Boolean).join(" · "),
                    estado: p.rechazo ? { texto: "Rechazada", tono: "urgente" } : null,
                    dato: (
                      <>
                        {p.serie && <Pildora tono={p.serie === "OPEN" ? "neutro" : "info"}>{p.serie === "OPEN" ? "Open" : "Efameinsa"}</Pildora>}
                        {p.rechazo && <span className="text-[11px] text-muted-foreground">Pedido {p.numeroPedido}</span>}
                        <span className="flex gap-2 text-[11px]">
                          <a href={`/api/informes/${p.informeId}/pdf`} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
                            Ver el cierre
                          </a>
                          <a href={`/pedidos/${p.id}/imprimir`} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
                            Ver el pedido
                          </a>
                        </span>
                      </>
                    ),
                    espera: g.clave === "subida" ? "Esperando a Central" : null,
                    edad: g.clave === "rechazada" ? `Devuelta ${haceCuanto(p.desde)}` : g.clave === "subida" ? `Subida ${haceCuanto(p.desde)}` : `Pedido generado ${haceCuanto(p.desde)}`,
                    edadTono: g.clave === "subida" ? "neutro" : g.tono,
                    accion: g.accion ? { etiqueta: g.accion, href: "/finanzas/liquidar" } : null,
                    tono: g.tono,
                  }}
                />
              ))}
            </Grupo>
          </div>
        );
      })}
    </div>
  );
}
