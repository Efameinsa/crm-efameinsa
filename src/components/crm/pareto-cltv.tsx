import { usd } from "@/lib/reportes";
import type { FinanzasMarketing } from "@/lib/finanzas";

// Pareto del valor de vida del cliente: los clientes se ordenan de mayor a
// menor y se agrupan en deciles (10 % cada uno). La barra es cuánto ingreso
// aporta ese decil; la línea de texto, el acumulado.
//
// Por qué esta vista y no un promedio: el CLTV está muy sesgado — hoy el
// promedio (US$ 12.356) más que duplica a la mediana (US$ 5.490), así que
// planificar con el promedio sobreestima lo que deja un cliente típico. El
// Pareto muestra la decisión de fondo: si el primer decil concentra la mitad
// del ingreso, retener a esos pocos vale más que captar muchos pequeños.
export function ParetoCltv({ cltv }: { cltv: FinanzasMarketing["cltv"] }) {
  const total = cltv.total_usd || 1;
  const maximo = Math.max(...cltv.deciles.map((d) => d.monto_usd), 1);
  // Acumulado sin mutar nada: el render debe ser puro (react-hooks/immutability
  // rechaza incluso un contador local dentro del map). Son 10 deciles, así que
  // recorrer el prefijo en cada paso no tiene costo apreciable.
  const filas = cltv.deciles.map((d, i) => ({
    ...d,
    pctIngreso: (d.monto_usd / total) * 100,
    acumulado: (cltv.deciles.slice(0, i + 1).reduce((s, x) => s + x.monto_usd, 0) / total) * 100,
  }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Mediana" valor={usd(cltv.mediana_usd)} ayuda="el cliente típico" destacado />
        <Dato etiqueta="Promedio" valor={usd(cltv.promedio_usd)} ayuda="inflado por los grandes" />
        <Dato etiqueta="Percentil 90" valor={usd(cltv.p90_usd)} ayuda="el 10% superior supera esto" />
        <Dato etiqueta="Máximo" valor={usd(cltv.maximo_usd)} ayuda="el cliente más grande" />
      </div>

      <div className="mt-4 space-y-1.5">
        {filas.map((d) => {
          return (
            <div key={d.decil} className="grid grid-cols-[92px_1fr_auto] items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {d.decil * 10 - 10}–{d.decil * 10}%
                <span className="ml-1 text-[10px]">({d.clientes})</span>
              </span>
              <div className="h-4 overflow-hidden rounded-sm bg-secondary">
                <div
                  className={d.decil === 1 ? "h-full rounded-sm bg-primary" : "h-full rounded-sm bg-primary/45"}
                  style={{ width: `${Math.max((d.monto_usd / maximo) * 100, 1)}%` }}
                />
              </div>
              <span className="w-32 text-right tabular-nums text-muted-foreground">
                <b className="text-foreground">{d.pctIngreso.toFixed(1)}%</b> · acum. {d.acumulado.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Clientes ordenados de mayor a menor valor histórico, en grupos del 10 %. Sobre{" "}
        <b className="text-foreground">{cltv.clientes.toLocaleString("es-PE")}</b> clientes con al menos una compra;{" "}
        <b className="text-foreground">{cltv.con_2_o_mas}</b> compraron dos o más veces (
        {cltv.compras_promedio.toFixed(1)} compras por cliente en promedio). El CLTV se calcula sobre todo el
        historial disponible, no solo el período filtrado.
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor, ayuda, destacado }: { etiqueta: string; valor: string; ayuda: string; destacado?: boolean }) {
  return (
    <div className={"rounded-lg border p-3 " + (destacado ? "border-primary/30 bg-primary/5" : "border-border")}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={"mt-0.5 text-base font-bold tabular-nums " + (destacado ? "text-primary" : "text-foreground")}>{valor}</p>
      <p className="text-[10px] leading-tight text-muted-foreground">{ayuda}</p>
    </div>
  );
}
