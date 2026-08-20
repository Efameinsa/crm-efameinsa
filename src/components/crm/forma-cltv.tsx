import { usd } from "@/lib/reportes";
import { bigotesTukey, bordesTramos, curvaDensidad, escalaTramos } from "@/lib/distribucion";
import type { FinanzasMarketing } from "@/lib/finanzas";

type Cltv = FinanzasMarketing["cltv"];

// LA FORMA DEL VALOR DE VIDA DEL CLIENTE: histograma y caja y bigotes, uno
// encima del otro y CON EL MISMO EJE.
//
// Antes eran dos gráficos separados y en escalas distintas —el histograma en
// tramos y la caja en logaritmo— y pasaba algo que no se sostiene: el
// histograma enseñaba una campana claramente estirada a la derecha y la caja
// se veía simétrica. No era una contradicción de los datos sino de los ejes.
// En logaritmo puro el bigote de la izquierda (114 → 3.087) mide 1,43 décadas
// y el de la derecha (7.490 → 194.400) mide 1,41: iguales a la vista, aunque
// el sesgo esté ahí.
//
// Dos decisiones lo arreglan:
//  1. UN SOLO EJE, el de los tramos de negocio (ver `@/lib/distribucion`), con
//     las mismas marcas y los mismos márgenes para los dos gráficos, dibujados
//     en el mismo SVG para que no puedan desalinearse. Las guías de la mediana
//     y del promedio los atraviesan de arriba abajo y cosen la lectura.
//  2. BIGOTES DE TUKEY con los atípicos punto por punto. Ahí aparece la
//     asimetría de verdad: ningún cliente atípico por abajo y 63 por arriba,
//     un reguero de puntos que se estira justo por debajo de la cola del
//     histograma.
//
// La curva de densidad se estima sobre los datos cliente por cliente y en la
// misma unidad que las barras (clientes por tramo), así que se superpone sin
// ningún truco de escala.
//
// SVG a mano, sin librería, como el resto de los gráficos del CRM.

const ANCHO = 620;
const M = { izq: 24, der: 24 };
// Cada banda tiene su propia altura y ninguna se pisa con la de al lado: la
// primera versión ahorraba lienzo y las etiquetas se montaban unas sobre otras.
const Y_ETIQUETAS = 11; // mediana y promedio, arriba del todo
const Y_HIST = 20; // techo del histograma
const ALTO_HIST = 118;
const Y_BASE = Y_HIST + ALTO_HIST; // 138, línea de base de las barras
const Y_CAJA = Y_BASE + 25; // 163, techo de la caja
const ALTO_CAJA = 26;
const Y_CENTRO = Y_CAJA + ALTO_CAJA / 2; // 176, la línea de los bigotes
const Y_EJE = Y_CAJA + ALTO_CAJA + 12; // 201, cifras del eje compartido
const ALTO = Y_EJE + 8;

const VERDE = "#1E7F4F"; // el promedio, el mismo verde en todos los gráficos

/** 2500 → "2,5k"; 200000 → "200k". Cifras cortas para que el eje respire. */
function corto(v: number): string {
  if (v < 1000) return String(Math.round(v));
  const miles = v / 1000;
  return `${miles % 1 === 0 ? miles : miles.toFixed(1).replace(".", ",")}k`;
}

export function FormaCltv({ cltv }: { cltv: Cltv }) {
  const tramos = cltv.histograma;
  if (!tramos.length) return null;

  const valores = cltv.valores ?? [];
  const bordes = bordesTramos(tramos, cltv.minimo_usd, cltv.maximo_usd);
  const u = escalaTramos(bordes);
  const n = tramos.length;

  const util = ANCHO - M.izq - M.der;
  const anchoTramo = util / n;
  const px = (valor: number) => M.izq + u(valor) * anchoTramo;
  const pxU = (posicion: number) => M.izq + posicion * anchoTramo;

  // La curva y las barras comparten unidad (clientes por tramo), así que
  // comparten también la altura máxima. La curva puede pasar por encima de la
  // barra más alta —dentro del tramo los clientes no están repartidos
  // parejo— y el eje tiene que dar para las dos.
  const curva = valores.length ? curvaDensidad(valores.map(u), n) : [];
  const maxBarra = Math.max(...tramos.map((t) => t.clientes), 1);
  const maxY = Math.max(maxBarra, ...curva.map((p) => p.y));
  const alturaDe = (clientes: number) => (clientes / maxY) * ALTO_HIST;

  const caminoCurva = curva
    .map((p, i) => `${i === 0 ? "M" : "L"}${pxU(p.u).toFixed(1)} ${(Y_BASE - alturaDe(p.y)).toFixed(1)}`)
    .join(" ");

  const { inferior, superior, atipicos } = valores.length
    ? bigotesTukey(valores, cltv.q1_usd, cltv.q3_usd)
    : { inferior: cltv.minimo_usd, superior: cltv.maximo_usd, atipicos: [] as number[] };

  // Las etiquetas de arriba se anclan según lo cerca que estén del borde para
  // que no se salgan del lienzo.
  const anclaje = (x: number) => (x < M.izq + 62 ? "start" : x > ANCHO - M.der - 62 ? "end" : "middle");
  const xMediana = px(cltv.mediana_usd);
  const xPromedio = px(cltv.promedio_usd);

  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Cómo se reparte el valor de los clientes
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          role="img"
          aria-label={`Distribución del valor de vida del cliente. Histograma: ${tramos
            .map((t) => `${t.tramo}, ${t.clientes} clientes`)
            .join("; ")}. Resumen: mínimo ${Math.round(cltv.minimo_usd)}, primer cuartil ${Math.round(
            cltv.q1_usd,
          )}, mediana ${Math.round(cltv.mediana_usd)}, promedio ${Math.round(
            cltv.promedio_usd,
          )}, tercer cuartil ${Math.round(cltv.q3_usd)}, máximo ${Math.round(cltv.maximo_usd)} dólares, con ${
            atipicos.length
          } clientes atípicos, todos por encima.`}
          className="h-auto w-full min-w-[560px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {/* Rejilla: una línea fina y continua en cada corte de tramo, que
              atraviesa los dos gráficos. Es lo que deja ver de un vistazo que
              la caja cae justo debajo del pico del histograma. */}
          {bordes.map((borde, i) => (
            <line
              key={borde}
              x1={pxU(i)}
              y1={Y_HIST}
              x2={pxU(i)}
              y2={Y_CAJA + ALTO_CAJA}
              stroke="currentColor"
              strokeOpacity="0.12"
            />
          ))}
          <line x1={M.izq} y1={Y_BASE} x2={ANCHO - M.der} y2={Y_BASE} stroke="currentColor" strokeOpacity="0.28" />

          {/* ---------- Histograma ---------- */}
          {tramos.map((t, i) => {
            const alto = alturaDe(t.clientes);
            const ancho = anchoTramo * 0.78;
            const x = pxU(i) + (anchoTramo - ancho) / 2;
            const pico = t.clientes === maxBarra;
            return (
              <g key={t.tramo}>
                <title>{`${t.clientes} clientes · ${t.tramo}`}</title>
                <rect
                  x={x}
                  y={Y_BASE - alto}
                  width={ancho}
                  height={Math.max(alto, t.clientes > 0 ? 1.5 : 0)}
                  rx="2"
                  fill="var(--primary)"
                  fillOpacity={pico ? 0.5 : 0.28}
                />
                {t.clientes > 0 && (
                  <text
                    x={x + ancho / 2}
                    y={Y_BASE - alto - 4}
                    textAnchor="middle"
                    fontSize="7.5"
                    fontWeight={pico ? "bold" : "normal"}
                    fill="currentColor"
                    // La curva pasa justo por encima de las barras: el número
                    // se dibuja sobre un halo del color del fondo para que se
                    // lea igual cuando le cruza la línea por detrás.
                    stroke="var(--card)"
                    strokeWidth="2.5"
                    paintOrder="stroke"
                  >
                    {t.clientes}
                  </text>
                )}
              </g>
            );
          })}

          {/* Curva de densidad: la misma forma, sin los escalones que impone
              el corte de los tramos. */}
          {caminoCurva && (
            <path d={caminoCurva} fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinejoin="round" />
          )}

          {/* ---------- Guías que cosen los dos gráficos ---------- */}
          <line
            x1={xMediana}
            y1={Y_ETIQUETAS + 4}
            x2={xMediana}
            y2={Y_CAJA}
            stroke="var(--primary)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
            strokeOpacity="0.65"
          />
          <text x={xMediana} y={Y_ETIQUETAS} textAnchor={anclaje(xMediana)} fontSize="8.5" fontWeight="bold" fill="var(--primary)">
            mediana {usd(cltv.mediana_usd)}
          </text>
          <line
            x1={xPromedio}
            y1={Y_ETIQUETAS + 4}
            x2={xPromedio}
            y2={Y_CENTRO}
            stroke={VERDE}
            strokeWidth="1.2"
            strokeDasharray="3 2"
            strokeOpacity="0.65"
          />
          <text x={xPromedio} y={Y_ETIQUETAS} textAnchor={anclaje(xPromedio)} fontSize="8.5" fontWeight="bold" fill={VERDE}>
            promedio {usd(cltv.promedio_usd)}
          </text>

          {/* ---------- Caja y bigotes ---------- */}
          <g>
            <title>{`Mitad central de los clientes: de ${usd(cltv.q1_usd)} a ${usd(cltv.q3_usd)}`}</title>
            {/* bigotes hasta el último dato dentro de vez y media la caja */}
            <line x1={px(inferior)} y1={Y_CENTRO} x2={px(cltv.q1_usd)} y2={Y_CENTRO} stroke="currentColor" strokeOpacity="0.5" />
            <line x1={px(cltv.q3_usd)} y1={Y_CENTRO} x2={px(superior)} y2={Y_CENTRO} stroke="currentColor" strokeOpacity="0.5" />
            <line x1={px(inferior)} y1={Y_CENTRO - 5} x2={px(inferior)} y2={Y_CENTRO + 5} stroke="currentColor" strokeOpacity="0.5" />
            <line x1={px(superior)} y1={Y_CENTRO - 5} x2={px(superior)} y2={Y_CENTRO + 5} stroke="currentColor" strokeOpacity="0.5" />
            <rect
              x={px(cltv.q1_usd)}
              y={Y_CAJA}
              width={Math.max(px(cltv.q3_usd) - px(cltv.q1_usd), 2)}
              height={ALTO_CAJA}
              rx="2"
              fill="var(--primary)"
              fillOpacity="0.16"
              stroke="var(--primary)"
              strokeOpacity="0.45"
            />
            <line
              x1={xMediana}
              y1={Y_CAJA}
              x2={xMediana}
              y2={Y_CAJA + ALTO_CAJA}
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
          </g>

          {/* Atípicos: uno por cliente. Se solapan a propósito —donde el
              color carga es donde hay más— y por eso van translúcidos. */}
          {atipicos.map((v, i) => (
            <circle key={`${v}-${i}`} cx={px(v)} cy={Y_CENTRO} r="2.3" fill="var(--primary)" fillOpacity="0.45">
              <title>{usd(v)}</title>
            </circle>
          ))}

          {/* El promedio va con un anillo del color del fondo para que se lea
              aunque caiga encima de la caja o de un punto. */}
          <circle cx={xPromedio} cy={Y_CENTRO} r="4" fill={VERDE} stroke="var(--card)" strokeWidth="1.5" />

          <text x={px(inferior)} y={Y_BASE + 15} textAnchor="start" fontSize="7.5" fill="currentColor">
            mín {usd(cltv.minimo_usd)}
          </text>
          {atipicos.length > 0 && (
            <>
              <text x={px(superior) + 4} y={Y_BASE + 15} textAnchor="start" fontSize="7.5" fill="currentColor">
                {atipicos.length} atípicos →
              </text>
              <text x={ANCHO - M.der} y={Y_BASE + 15} textAnchor="end" fontSize="7.5" fill="currentColor">
                máx {usd(cltv.maximo_usd)}
              </text>
            </>
          )}

          {/* ---------- Eje compartido ---------- */}
          {bordes.map((borde, i) => (
            <text key={borde} x={pxU(i)} y={Y_EJE} textAnchor={i === 0 ? "start" : i === n ? "end" : "middle"} fontSize="7.5" fill="currentColor">
              {corto(borde)}
            </text>
          ))}
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Arriba, cuántos clientes hay en cada tramo, con la curva que resume esa forma; abajo, los mismos clientes
        resumidos en una caja: la mitad central va de {usd(cltv.q1_usd)} a {usd(cltv.q3_usd)}.{" "}
        <b className="text-foreground">Los dos gráficos comparten el eje</b> —cada tramo ocupa el mismo ancho y dentro
        de él las cifras crecen en proporción, no de a poquitos— así que se leen en vertical: la caja cae justo debajo
        del pico y el bigote se estira por debajo de la cola.
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        La campana está <b className="text-foreground">estirada hacia la derecha</b>: la mayoría se agrupa en los
        tramos bajos y unos pocos se van muy lejos. El bigote llega hasta donde alcanza lo normal (una vez y media la
        caja) y lo que sigue son <b className="text-foreground">{atipicos.length} clientes atípicos, todos por arriba y
        ninguno por abajo</b> — esa es la asimetría. Por eso el <b className="text-[#1E7F4F]">promedio</b> queda fuera
        de la caja, a la derecha del <b className="text-primary">valor típico</b>: decidir con el promedio sobreestima
        lo que deja un cliente normal.
      </p>
    </div>
  );
}
