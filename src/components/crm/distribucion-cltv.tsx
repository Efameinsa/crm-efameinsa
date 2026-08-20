"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usd } from "@/lib/reportes";
import { cn } from "@/lib/utils";
import type { FinanzasMarketing } from "@/lib/finanzas";
import { HistogramaCltv } from "@/components/crm/histograma-cltv";

type Cltv = FinanzasMarketing["cltv"];

// Dos gráficos que responden preguntas distintas sobre el mismo dato, sin
// librerías: SVG a mano, como el resto de los gráficos del CRM.
//
//  · CAJA Y BIGOTES: cómo se reparten los valores. Va en ESCALA LOGARÍTMICA
//    a propósito — el cliente mayor vale decenas de veces el tercer cuartil,
//    así que en escala lineal la caja ocuparía un 2 % del ancho y no se vería
//    nada. Cada marca del eje es ×10. El factor exacto se calcula y se escribe
//    en el pie del gráfico, para que el texto no envejezca con los datos.
//  · PARETO: cuánta concentración hay. Barras por decil + acumulado, y al
//    hacer clic en una barra se despliega QUIÉNES son esos clientes — sin la
//    lista, el gráfico informa pero no deja actuar.

// Más alto y con más margen que la primera versión: las etiquetas de mediana
// y promedio se pisaban entre sí y con las marcas del eje cuando sus valores
// caían cerca (mediana 3.790 y promedio 8.413 quedan a un dedo en escala log).
// Ahora cada etiqueta tiene su propia banda horizontal.
const ANCHO = 620;
const ALTO_CAJA = 168;
const MARGEN = { izq: 46, der: 46, arr: 46, aba: 46 };

export function DistribucionCltv({ cltv }: { cltv: Cltv }) {
  const [abierto, setAbierto] = useState<number | null>(null);

  const total = cltv.total_usd || 1;
  const filas = cltv.deciles.map((d, i) => ({
    ...d,
    pctIngreso: (d.monto_usd / total) * 100,
    acumulado: (cltv.deciles.slice(0, i + 1).reduce((s, x) => s + x.monto_usd, 0) / total) * 100,
  }));
  const maximoBarra = Math.max(...cltv.deciles.map((d) => d.monto_usd), 1);

  // Escala logarítmica para el box plot.
  const minLog = Math.log10(Math.max(cltv.minimo_usd, 1));
  const maxLog = Math.log10(Math.max(cltv.maximo_usd, 10));
  const x = (v: number) =>
    MARGEN.izq + ((Math.log10(Math.max(v, 1)) - minLog) / (maxLog - minLog || 1)) * (ANCHO - MARGEN.izq - MARGEN.der);

  // Marcas de potencias de 10 dentro del rango.
  const marcas: number[] = [];
  for (let p = Math.ceil(minLog); p <= Math.floor(maxLog); p++) marcas.push(10 ** p);

  // Alinea la etiqueta según lo cerca que esté del borde, para que no se salga
  // del lienzo ni quede cortada.
  const anclaje = (px: number) =>
    px < MARGEN.izq + 70 ? "start" : px > ANCHO - MARGEN.der - 70 ? "end" : "middle";

  const yCaja = MARGEN.arr + 8;
  const altoCaja = 38;
  const promedioSobreQ3 = cltv.promedio_usd > cltv.q3_usd;

  return (
    <div className="space-y-6">
      {/* Orden deliberado: primero la FORMA (histograma), después su RESUMEN
          en cinco números (caja y bigotes) y al final la CONCENTRACIÓN
          (Pareto). Cada uno responde una pregunta distinta y en ese orden se
          entienden encadenados. */}
      <HistogramaCltv cltv={cltv} />

      {/* ---------- Caja y bigotes ---------- */}
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Cómo se reparte el valor de los clientes
        </p>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO_CAJA}`}
            role="img"
            aria-label={`Diagrama de caja del valor de vida del cliente: mínimo ${Math.round(cltv.minimo_usd)}, primer cuartil ${Math.round(cltv.q1_usd)}, mediana ${Math.round(cltv.mediana_usd)}, tercer cuartil ${Math.round(cltv.q3_usd)}, máximo ${Math.round(cltv.maximo_usd)} dólares`}
            className="h-auto w-full min-w-[520px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {/* eje */}
            {marcas.map((m) => (
              <g key={m}>
                {/* La rejilla llega solo hasta la caja; las cifras del eje van
                    en la última banda, debajo de la etiqueta del promedio. */}
                <line x1={x(m)} y1={yCaja - 4} x2={x(m)} y2={yCaja + altoCaja + 4} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="2 3" />
                <text x={x(m)} y={ALTO_CAJA - 8} textAnchor="middle" fontSize="9" fill="currentColor">
                  {m >= 1000 ? `${m / 1000}k` : m}
                </text>
              </g>
            ))}
            {/* bigotes */}
            <line x1={x(cltv.minimo_usd)} y1={yCaja + altoCaja / 2} x2={x(cltv.q1_usd)} y2={yCaja + altoCaja / 2} stroke="currentColor" strokeOpacity="0.55" />
            <line x1={x(cltv.q3_usd)} y1={yCaja + altoCaja / 2} x2={x(cltv.maximo_usd)} y2={yCaja + altoCaja / 2} stroke="currentColor" strokeOpacity="0.55" />
            <line x1={x(cltv.minimo_usd)} y1={yCaja + 6} x2={x(cltv.minimo_usd)} y2={yCaja + altoCaja - 6} stroke="currentColor" strokeOpacity="0.55" />
            <line x1={x(cltv.maximo_usd)} y1={yCaja + 6} x2={x(cltv.maximo_usd)} y2={yCaja + altoCaja - 6} stroke="currentColor" strokeOpacity="0.55" />
            {/* caja intercuartílica */}
            <rect
              x={x(cltv.q1_usd)}
              y={yCaja}
              width={Math.max(x(cltv.q3_usd) - x(cltv.q1_usd), 2)}
              height={altoCaja}
              rx="3"
              fill="var(--primary)"
              fillOpacity="0.16"
              stroke="var(--primary)"
              strokeOpacity="0.5"
            />
            {/* Mediana: etiqueta ARRIBA de la caja, con guía vertical. */}
            <line x1={x(cltv.mediana_usd)} y1={yCaja} x2={x(cltv.mediana_usd)} y2={yCaja + altoCaja} stroke="var(--primary)" strokeWidth="2.5" />
            <line x1={x(cltv.mediana_usd)} y1={MARGEN.arr - 14} x2={x(cltv.mediana_usd)} y2={yCaja} stroke="var(--primary)" strokeOpacity="0.35" strokeDasharray="2 2" />
            <text x={x(cltv.mediana_usd)} y={MARGEN.arr - 18} textAnchor={anclaje(x(cltv.mediana_usd))} fontSize="10" fontWeight="bold" fill="var(--primary)">
              mediana {usd(cltv.mediana_usd)}
            </text>
            {/* Promedio: etiqueta ABAJO, en su propia banda. Nunca puede
                chocar con la de la mediana aunque los valores estén juntos. */}
            <circle cx={x(cltv.promedio_usd)} cy={yCaja + altoCaja / 2} r="4.5" fill="#1E7F4F" />
            <line x1={x(cltv.promedio_usd)} y1={yCaja + altoCaja / 2} x2={x(cltv.promedio_usd)} y2={yCaja + altoCaja + 14} stroke="#1E7F4F" strokeOpacity="0.35" strokeDasharray="2 2" />
            <text x={x(cltv.promedio_usd)} y={yCaja + altoCaja + 24} textAnchor={anclaje(x(cltv.promedio_usd))} fontSize="10" fontWeight="bold" fill="#1E7F4F">
              promedio {usd(cltv.promedio_usd)}
            </text>
            {/* Extremos, en gris y pequeños, anclados a su borde para no
                salirse del lienzo. */}
            <text x={x(cltv.minimo_usd)} y={yCaja + altoCaja / 2 - 12} textAnchor="start" fontSize="8" fill="currentColor">
              mín {usd(cltv.minimo_usd)}
            </text>
            <text x={x(cltv.maximo_usd)} y={yCaja + altoCaja / 2 - 12} textAnchor="end" fontSize="8" fill="currentColor">
              máx {usd(cltv.maximo_usd)}
            </text>
          </svg>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          La caja abarca la mitad central de los clientes ({usd(cltv.q1_usd)} a {usd(cltv.q3_usd)}); los bigotes llegan al
          menor y al mayor. <b className="text-foreground">Escala logarítmica</b>: cada marca vale diez veces la
          anterior, porque el cliente más grande vale{" "}
          <b className="text-foreground">{(cltv.maximo_usd / (cltv.q3_usd || 1)).toFixed(0)} veces</b> el tercer cuartil
          y en escala normal la caja ocuparía apenas el{" "}
          {(((cltv.q3_usd - cltv.q1_usd) / (cltv.maximo_usd || 1)) * 100).toFixed(1)} % del ancho.
          {promedioSobreQ3 && (
            <>
              {" "}
              Fíjese que el <b className="text-foreground">promedio cae fuera de la caja</b>: más del 75 % de los
              clientes vale menos que el promedio, por eso conviene decidir con la mediana.
            </>
          )}
        </p>
      </div>

      {/* ---------- Pareto ---------- */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Concentración del ingreso (Pareto) — clic en una barra para ver quiénes son
        </p>
        <div className="space-y-1.5">
          {filas.map((d) => {
            const activo = abierto === d.decil;
            return (
              <div key={d.decil}>
                <button
                  type="button"
                  onClick={() => setAbierto(activo ? null : d.decil)}
                  className="grid w-full cursor-pointer grid-cols-[104px_1fr_auto] items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent"
                  aria-expanded={activo}
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <ChevronDown className={cn("size-3 transition-transform", activo && "rotate-180")} />
                    {d.decil * 10 - 10}–{d.decil * 10}%
                    <span className="text-[10px]">({d.clientes})</span>
                  </span>
                  <span className="h-4 overflow-hidden rounded-sm bg-secondary">
                    <span
                      className={cn("block h-full rounded-sm", d.decil === 1 ? "bg-primary" : "bg-primary/45")}
                      style={{ width: `${Math.max((d.monto_usd / maximoBarra) * 100, 1)}%` }}
                    />
                  </span>
                  <span className="w-32 text-right tabular-nums text-muted-foreground">
                    <b className="text-foreground">{d.pctIngreso.toFixed(1)}%</b> · acum. {d.acumulado.toFixed(0)}%
                  </span>
                </button>

                {activo && (
                  <div className="mb-1 ml-6 mt-1 rounded-lg border border-border bg-card p-2.5">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      {d.clientes} cliente{d.clientes === 1 ? "" : "s"} entre {usd(d.desde_usd)} y {usd(d.hasta_usd)} ·
                      aportan {usd(d.monto_usd)}
                      {d.muestra.length < d.clientes && ` · se listan los ${d.muestra.length} mayores`}
                    </p>
                    <ul className="divide-y divide-border">
                      {d.muestra.map((c) => (
                        <li key={c.cuenta_id} className="flex items-center justify-between gap-3 py-1 text-xs">
                          <Link href={`/gerencia/clientes/${c.cuenta_id}`} className="truncate text-foreground hover:underline">
                            {c.razon_social}
                          </Link>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            <b className="text-foreground">{usd(c.total_usd)}</b> · {c.compras} compra
                            {c.compras === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Clientes ordenados de mayor a menor valor histórico, en grupos del 10 %. Sobre{" "}
          <b className="text-foreground">{cltv.clientes.toLocaleString("es-PE")}</b> clientes con al menos una compra;{" "}
          <b className="text-foreground">{cltv.con_2_o_mas}</b> compraron dos o más veces (
          {cltv.compras_promedio.toFixed(1)} compras por cliente en promedio). El CLTV se calcula sobre todo el
          historial disponible, no solo el período filtrado.
        </p>
      </div>
    </div>
  );
}
