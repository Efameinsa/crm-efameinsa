import { usd } from "@/lib/reportes";
import type { FinanzasMarketing } from "@/lib/finanzas";

type Cltv = FinanzasMarketing["cltv"];

// Histograma del valor de vida del cliente: la "campana sesgada". Muestra la
// FORMA de la distribución, que es lo que el resumen numérico esconde — aquí
// se ve de un golpe que la mayoría se apiña en los tramos bajos y que hay una
// cola larga de pocos clientes muy grandes.
//
// Sirve sobre todo para explicar por qué el promedio no representa al cliente
// típico: se dibujan las dos marcas (mediana y promedio) sobre el eje y el
// promedio cae claramente a la DERECHA del pico.
//
// SVG a mano, sin librería, como el resto de los gráficos del CRM.
const ANCHO = 620;
const ALTO = 200;
const M = { izq: 34, der: 14, arr: 16, aba: 46 };

export function HistogramaCltv({ cltv }: { cltv: Cltv }) {
  const h = cltv.histograma;
  if (!h.length) return null;

  const maxClientes = Math.max(...h.map((x) => x.clientes), 1);
  const anchoUtil = ANCHO - M.izq - M.der;
  const altoUtil = ALTO - M.arr - M.aba;
  const anchoBarra = anchoUtil / h.length;

  // Las marcas de mediana y promedio se colocan sobre el tramo al que
  // pertenecen, centradas en él: el eje es categórico (tramos), no continuo,
  // así que interpolar dentro de la barra daría una posición falsamente precisa.
  const tramoDe = (v: number) => h.findIndex((t) => v >= t.desde && v < t.hasta);
  const centroTramo = (i: number) => M.izq + i * anchoBarra + anchoBarra / 2;
  const iMediana = tramoDe(cltv.mediana_usd);
  const iPromedio = tramoDe(cltv.promedio_usd);
  // Si ambas marcas caen en el mismo tramo, se separan un poco para que sus
  // etiquetas no se pisen.
  const mismoTramo = iMediana === iPromedio;
  const xMediana = iMediana >= 0 ? centroTramo(iMediana) - (mismoTramo ? anchoBarra * 0.2 : 0) : null;
  const xPromedio = iPromedio >= 0 ? centroTramo(iPromedio) + (mismoTramo ? anchoBarra * 0.2 : 0) : null;

  // textAnchor según cercanía al borde, para que la etiqueta no se salga.
  const anclaje = (x: number) => (x < M.izq + 60 ? "start" : x > ANCHO - M.der - 60 ? "end" : "middle");

  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Cuántos clientes hay en cada rango de valor
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          role="img"
          aria-label={`Histograma del valor de vida del cliente: ${h.map((t) => `${t.tramo}, ${t.clientes} clientes`).join("; ")}`}
          className="h-auto w-full min-w-[560px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {/* eje vertical de referencia */}
          {[0, 0.5, 1].map((f) => {
            const y = M.arr + altoUtil * (1 - f);
            return (
              <g key={f}>
                <line x1={M.izq} y1={y} x2={ANCHO - M.der} y2={y} stroke="currentColor" strokeOpacity="0.14" />
                <text x={M.izq - 6} y={y + 3} textAnchor="end" fontSize="8" fill="currentColor">
                  {Math.round(maxClientes * f)}
                </text>
              </g>
            );
          })}

          {h.map((t, i) => {
            const alto = (t.clientes / maxClientes) * altoUtil;
            const x = M.izq + i * anchoBarra;
            return (
              <g key={t.tramo}>
                <rect
                  x={x + anchoBarra * 0.12}
                  y={M.arr + altoUtil - alto}
                  width={anchoBarra * 0.76}
                  height={Math.max(alto, t.clientes > 0 ? 1.5 : 0)}
                  rx="2"
                  fill="var(--primary)"
                  fillOpacity={t.clientes === maxClientes ? 0.95 : 0.5}
                />
                {/* cantidad encima de la barra */}
                {t.clientes > 0 && (
                  <text
                    x={x + anchoBarra / 2}
                    y={M.arr + altoUtil - alto - 4}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="currentColor"
                  >
                    {t.clientes}
                  </text>
                )}
                {/* etiqueta del tramo, en su propia línea bajo el eje */}
                <text x={x + anchoBarra / 2} y={M.arr + altoUtil + 13} textAnchor="middle" fontSize="8" fill="currentColor">
                  {t.tramo}
                </text>
              </g>
            );
          })}

          {/* Marcas de mediana y promedio: en filas separadas para que sus
              etiquetas nunca se pisen entre sí ni con los tramos. */}
          {xMediana !== null && (
            <g>
              <line x1={xMediana} y1={M.arr} x2={xMediana} y2={M.arr + altoUtil} stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="3 2" />
              <text x={xMediana} y={M.arr + altoUtil + 27} textAnchor={anclaje(xMediana)} fontSize="8.5" fontWeight="bold" fill="var(--primary)">
                mediana {usd(cltv.mediana_usd)}
              </text>
            </g>
          )}
          {xPromedio !== null && (
            <g>
              <line x1={xPromedio} y1={M.arr} x2={xPromedio} y2={M.arr + altoUtil} stroke="#1E7F4F" strokeWidth="1.5" strokeDasharray="3 2" />
              <text x={xPromedio} y={M.arr + altoUtil + 39} textAnchor={anclaje(xPromedio)} fontSize="8.5" fontWeight="bold" fill="#1E7F4F">
                promedio {usd(cltv.promedio_usd)}
              </text>
            </g>
          )}
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        La forma es una campana <b className="text-foreground">estirada hacia la derecha</b>: la mayoría de los clientes
        se agrupa en los tramos bajos y unos pocos se van muy lejos. Por eso el{" "}
        <b className="text-[#1E7F4F]">promedio</b> queda a la derecha del pico y del{" "}
        <b className="text-primary">valor típico</b> — decidir con el promedio sobreestima lo que deja un cliente normal.
      </p>
    </div>
  );
}
