import { View, Text, Svg, Path, Circle } from "@react-pdf/renderer";
import { duracionOficina } from "@/lib/files-tiempos";
import { LINEAS, type Linea, type PanelPostventa } from "@/lib/panel-postventa";

// Los mismos de reporte-diario-pdf, repetidos para no importarlo de vuelta (se importan entre sí).
const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const VERDE = "#1E7F4F";

// LA HOJA DE GRÁFICOS DE POSTVENTA (Santos, 13-10). Se dibuja con cajas y no
// con <Svg> salvo el anillo: las barras de cajas no pueden dar el «unsupported
// number» de react-pdf aunque un total venga en cero. Cada barra lleva su
// número escrito al lado: el color identifica, el número se lee (y sirve
// impreso en blanco y negro).

// Una línea = un color, siempre el mismo y en este orden (paleta validada para
// daltonismo; los tres claros van siempre con su número al lado).
export const COLOR_LINEA: Record<Linea, string> = {
  repuestos: "#2a78d6",
  mantenimiento: "#eb6834",
  soporte: "#1baf7a",
  pedidos: "#eda100",
  otros: "#e87ba4",
};
const RIEL = "#ECE9E8";
const BORDE = "#D8D4D3";

const caja = { borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 9 } as const;
const tituloCaja = { fontSize: 8, fontFamily: "Helvetica-Bold", color: CARBON, marginBottom: 2 } as const;
const notaCaja = { fontSize: 6.5, color: GRIS, marginBottom: 7 } as const;
const pct = (n: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0);

function Caja({ titulo, nota, children, flex }: { titulo: string; nota?: string; children: React.ReactNode; flex?: number }) {
  return (
    // `flex` solo dentro de una fila: en columna aplasta la caja a cero.
    <View style={flex ? [caja, { flex }] : caja} wrap={false}>
      <Text style={tituloCaja}>{titulo}</Text>
      {nota ? <Text style={notaCaja}>{nota}</Text> : <View style={{ height: 6 }} />}
      {children}
    </View>
  );
}

function Kpi({ etiqueta, valor, sub, color = CARBON }: { etiqueta: string; valor: string; sub: string; color?: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 3, borderTopColor: color }}>
      <Text style={{ fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 }}>{etiqueta}</Text>
      <Text style={{ fontSize: 18, lineHeight: 1.1, fontFamily: "Helvetica-Bold", color: CARBON, marginTop: 4, height: 21 }}>{valor}</Text>
      <Text style={{ fontSize: 6.5, color: GRIS, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

/** Barra horizontal con su rótulo a la izquierda y el número a la derecha. */
function BarraH({ rotulo, n, max, color, extra }: { rotulo: string; n: number; max: number; color: string; extra?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
      <Text style={{ width: 92, fontSize: 7, color: CARBON, paddingRight: 4 }}>{rotulo}</Text>
      <View style={{ flex: 1, height: 9, backgroundColor: RIEL, borderRadius: 2, flexDirection: "row" }}>
        {n > 0 && <View style={{ width: `${pct(n, max)}%`, height: 9, backgroundColor: color, borderRadius: 2 }} />}
      </View>
      <Text style={{ width: extra ? 64 : 22, fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
        {n}
        {extra ? <Text style={{ fontFamily: "Helvetica", color: GRIS, fontSize: 6.5 }}>{`  ${extra}`}</Text> : null}
      </Text>
    </View>
  );
}

/** Anillo de efectividad: arco verde sobre riel gris, con el % al centro. */
function Anillo({ efectivas, total }: { efectivas: number; total: number }) {
  const r = 30;
  const c = 38;
  const p = total > 0 ? efectivas / total : 0;
  const a = Math.min(p, 0.9999) * 2 * Math.PI;
  const x = (c + r * Math.sin(a)).toFixed(2);
  const y = (c - r * Math.cos(a)).toFixed(2);
  const arco = `M ${c} ${c - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y}`;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 76, height: 76 }}>
        <Svg width={76} height={76} viewBox="0 0 76 76">
          <Circle cx={c} cy={c} r={r} stroke={RIEL} strokeWidth={9} fill="none" />
          {p > 0 && <Path d={arco} stroke={VERDE} strokeWidth={9} fill="none" strokeLinecap="round" />}
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, width: 76, height: 76, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{Math.round(p * 100)}%</Text>
        </View>
      </View>
      <Text style={{ fontSize: 6.5, color: GRIS, marginTop: 4, textAlign: "center" }}>
        {efectivas} con contacto · {total - efectivas} sin contacto
      </Text>
    </View>
  );
}

const ROTULO_PENDIENTE: [RegExp, string][] = [
  [/^Presupuestos/, "Presupuestos por salir"],
  [/programados para/, "Seguimientos del día"],
  [/pasaron de fecha|habían pasado/, "Seguimientos vencidos"],
];
const rotuloPendiente = (t: string) => ROTULO_PENDIENTE.find(([re]) => re.test(t))?.[1] ?? t;
const ROTULO_LINEA_CORTO: Record<Linea, string> = {
  repuestos: "Repuestos",
  mantenimiento: "Mantenimiento",
  soporte: "Soporte y garantía",
  pedidos: "Despacho y PEM",
  otros: "Seguimiento y otros",
};

export function PanelPostventaPdf({
  panel,
  resumen,
}: {
  panel: PanelPostventa;
  resumen: { cotizaciones: number; cotizaciones_enviadas: number; ventas: number; monto_vendido_usd: number; complementarias: number };
}) {
  const totalHoy = panel.porLinea.reduce((t, l) => t + l.efectivas + l.sinContacto, 0);
  const efectivas = panel.porLinea.reduce((t, l) => t + l.efectivas, 0);
  const maxLinea = Math.max(1, ...panel.porLinea.map((l) => l.efectivas + l.sinContacto));
  const totalesSemana = panel.semana.map((d) => LINEAS.reduce((t, l) => t + d.porLinea[l.clave], 0));
  const maxSemana = Math.max(1, ...totalesSemana);
  // El promedio, de los días anteriores en que trabajó: un feriado en cero no lo hunde.
  const anteriores = totalesSemana.slice(0, -1).filter((n) => n > 0);
  const promedio = anteriores.length > 0 ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : 0;
  const maxVia = Math.max(1, ...panel.porVia.map((v) => v.n));
  const maxHora = Math.max(1, ...panel.porHora.map((h) => h.n));
  const totalPend = panel.pendientes.reduce((t, p) => t + p.n, 0);
  const maxPend = Math.max(1, ...panel.pendientes.map((p) => p.n));
  const totalPres = panel.presupuestos.reduce((t, p) => t + p.n, 0);
  const usdPres = panel.presupuestos.reduce((t, p) => t + p.usd, 0);
  const COLOR_ESTADO: Record<string, string> = {
    Aceptado: VERDE,
    Enviado: "#2a78d6",
    "Aprobado, por enviar": "#86b6ef",
    "En gerencia": "#eda100",
    "Observado por gerencia": GRANATE,
    Borrador: "#B9B4B2",
    "No aceptado": "#6B6B6B",
  };
  const ALTO = 74;
  const usd = (n: number) => `US$ ${Math.round(n).toLocaleString("es-PE")}`;
  const lineaTop = [...panel.porLinea].sort((a, b) => b.efectivas + b.sinContacto - (a.efectivas + a.sinContacto))[0];
  const comparado = promedio > 0 ? Math.round(((totalHoy - promedio) / promedio) * 100) : null;

  return (
    <View>
      {/* Lo primero: cinco números grandes. */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
        <Kpi
          etiqueta="Gestiones del día"
          valor={String(totalHoy)}
          sub={comparado === null ? "sin días anteriores para comparar" : `${comparado >= 0 ? "+" : ""}${comparado}% vs. su promedio`}
          color={GRANATE}
        />
        <Kpi etiqueta="Con contacto" valor={`${totalHoy > 0 ? Math.round((efectivas / totalHoy) * 100) : 0}%`} sub={`${efectivas} de ${totalHoy}`} color={VERDE} />
        <Kpi etiqueta="Presupuestos" valor={String(resumen.cotizaciones)} sub={`${resumen.cotizaciones_enviadas} enviados · ${usd(usdPres)}`} color="#2a78d6" />
        <Kpi etiqueta="Ventas cerradas" valor={String(resumen.ventas)} sub={resumen.ventas > 0 ? usd(resumen.monto_vendido_usd) : "—"} color={VERDE} />
        <Kpi etiqueta="Sus pendientes" valor={String(totalPend)} sub="por atender" color="#eda100" />
      </View>

      {/* Trabajo en equipo y respuesta (0530): la ayuda cuenta para quien la da.
          Va en una franja baja: como fila de Kpi empujaba los dos últimos
          cuadros del panel a una hoja casi vacía. */}
      {panel.equipo && (
        <View style={{ flexDirection: "row", borderWidth: 0.6, borderColor: "#DDD9D5", borderRadius: 4, marginBottom: 8 }}>
          {[
            { t: "Ayudó a compañeras", v: String(panel.equipo.ayudasDadas), s: "gestiones en carpetas de otra", c: "#7c3aed" },
            { t: "La ayudaron", v: String(panel.equipo.ayudasRecibidas), s: "gestiones de otras en las suyas", c: "#a78bfa" },
            {
              t: "Respuesta a Central",
              v: panel.equipo.medianaMin === null ? "—" : duracionOficina(panel.equipo.medianaMin),
              s: `mediana · ${panel.equipo.atendidas} de ${panel.equipo.derivaciones} (6 días)`,
              c: "#2a78d6",
            },
            { t: "Derivaciones sin gestión", v: String(panel.equipo.sinGestion), s: "últimos 6 días", c: panel.equipo.sinGestion > 0 ? GRANATE : VERDE },
          ].map((k, i) => (
            <View
              key={k.t}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: 6, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: "#DDD9D5" }}
            >
              <View style={{ width: 3, height: 18, backgroundColor: k.c, borderRadius: 1, marginRight: 5 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 6, color: GRIS, textTransform: "uppercase" }}>{k.t}</Text>
                <Text style={{ fontSize: 6, color: GRIS }}>{k.s}</Text>
              </View>
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{k.v}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Fila 1: por línea + anillo de efectividad. */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Caja
          titulo="Gestiones del día por línea"
          nota={totalHoy > 0 && lineaTop ? `Lo más trabajado hoy: ${lineaTop.titulo.toLowerCase()}. Tramo claro = sin contacto.` : "Sin gestiones registradas este día."}
          flex={2.2}
        >
          {panel.porLinea.map((l) => {
            const n = l.efectivas + l.sinContacto;
            return (
              <View key={l.linea} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: COLOR_LINEA[l.linea], marginRight: 5 }} />
                <Text style={{ width: 112, fontSize: 7.5 }}>{l.titulo}</Text>
                <View style={{ flex: 1, height: 11, backgroundColor: RIEL, borderRadius: 2, flexDirection: "row" }}>
                  {l.efectivas > 0 && (
                    <View style={{ width: `${pct(l.efectivas, maxLinea)}%`, height: 11, backgroundColor: COLOR_LINEA[l.linea], borderRadius: 2 }} />
                  )}
                  {l.sinContacto > 0 && (
                    <View
                      style={{
                        width: `${pct(l.sinContacto, maxLinea)}%`,
                        height: 11,
                        backgroundColor: COLOR_LINEA[l.linea],
                        opacity: 0.35,
                        borderRadius: 2,
                        marginLeft: l.efectivas > 0 ? 1.5 : 0,
                      }}
                    />
                  )}
                </View>
                <Text style={{ width: 70, fontSize: 7.5, textAlign: "right" }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{n}</Text>
                  <Text style={{ color: GRIS, fontSize: 6.5 }}>{n > 0 ? `  (${l.sinContacto} s/c)` : ""}</Text>
                </Text>
              </View>
            );
          })}
        </Caja>
        <Caja titulo="Efectividad" nota="Gestiones en que habló con el cliente." flex={1}>
          <Anillo efectivas={efectivas} total={totalHoy} />
        </Caja>
      </View>

      {/* Fila 2: los últimos seis días, columnas apiladas por línea. */}
      <View style={{ marginBottom: 8 }}>
        <Caja
          titulo="Sus últimos seis días hábiles, por línea"
          nota={anteriores.length > 0 ? `Promedio de los días anteriores con gestión: ${promedio.toFixed(1)} por día.` : "Sin días anteriores con gestión."}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: ALTO + 14, paddingHorizontal: 6 }}>
            {panel.semana.map((d, i) => {
              const total = totalesSemana[i];
              return (
                <View key={d.fecha} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{total}</Text>
                  <View style={{ width: 34, height: (total / maxSemana) * ALTO }}>
                    {[...LINEAS].reverse().map((l) =>
                      d.porLinea[l.clave] > 0 ? (
                        <View
                          key={l.clave}
                          style={{
                            height: (d.porLinea[l.clave] / maxSemana) * ALTO,
                            backgroundColor: COLOR_LINEA[l.clave],
                            borderTopWidth: 1,
                            borderTopColor: "#FFFFFF",
                          }}
                        />
                      ) : null,
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", borderTopWidth: 0.75, borderTopColor: GRIS, paddingTop: 3, paddingHorizontal: 6 }}>
            {panel.semana.map((d, i) => (
              <Text
                key={d.fecha}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 7,
                  color: i === panel.semana.length - 1 ? CARBON : GRIS,
                  fontFamily: i === panel.semana.length - 1 ? "Helvetica-Bold" : "Helvetica",
                }}
              >
                {i === panel.semana.length - 1 ? `${d.etiqueta} (hoy)` : d.etiqueta}
              </Text>
            ))}
          </View>
          {/* Leyenda: siempre, porque son cinco series. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 7, gap: 10 }}>
            {LINEAS.map((l) => (
              <View key={l.clave} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: COLOR_LINEA[l.clave], marginRight: 3 }} />
                <Text style={{ fontSize: 6.5, color: GRIS }}>{ROTULO_LINEA_CORTO[l.clave]}</Text>
              </View>
            ))}
          </View>
        </Caja>
      </View>

      {/* Fila 3: por vía y por hora. */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Caja titulo="¿Por qué medio gestionó?" nota="Gestiones del día por vía de contacto." flex={1}>
          {panel.porVia.length === 0 ? (
            <Text style={{ fontSize: 7, color: GRIS, fontStyle: "italic" }}>Sin gestiones este día.</Text>
          ) : (
            panel.porVia.map((v) => <BarraH key={v.via} rotulo={v.via} n={v.n} max={maxVia} color={GRANATE} />)
          )}
        </Caja>
        <Caja titulo="¿A qué hora trabajó?" nota="Gestiones registradas en cada hora; lo de las 18 h en adelante, en la última." flex={1}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 56 }}>
            {panel.porHora.map((h) => (
              <View key={h.hora} style={{ flex: 1, alignItems: "center" }}>
                {h.n > 0 && <Text style={{ fontSize: 6, marginBottom: 1 }}>{h.n}</Text>}
                <View style={{ width: 10, height: h.n > 0 ? Math.max(2, (h.n / maxHora) * 44) : 0, backgroundColor: GRANATE, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", borderTopWidth: 0.75, borderTopColor: GRIS, paddingTop: 2 }}>
            {panel.porHora.map((h) => (
              <Text key={h.hora} style={{ flex: 1, textAlign: "center", fontSize: 5.5, color: GRIS }}>
                {h.hora === 18 ? "18+" : h.hora}
              </Text>
            ))}
          </View>
        </Caja>
      </View>

      {/* Fila 4: presupuestos por estado y pendientes por tipo. */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Caja titulo="Sus presupuestos del día, por estado" nota={totalPres > 0 ? `${totalPres} presupuestos por ${usd(usdPres)}.` : undefined} flex={1}>
          {totalPres === 0 ? (
            <Text style={{ fontSize: 7, color: GRIS, fontStyle: "italic" }}>No armó ni envió presupuestos este día.</Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", height: 12, borderRadius: 2, marginBottom: 7 }}>
                {panel.presupuestos.map((p, i) => (
                  <View
                    key={p.estado}
                    style={{ width: `${pct(p.n, totalPres)}%`, height: 12, backgroundColor: COLOR_ESTADO[p.estado] ?? GRIS, borderLeftWidth: i > 0 ? 1.5 : 0, borderLeftColor: "#FFFFFF" }}
                  />
                ))}
              </View>
              {panel.presupuestos.map((p) => (
                <View key={p.estado} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: COLOR_ESTADO[p.estado] ?? GRIS, marginRight: 5 }} />
                  <Text style={{ flex: 1, fontSize: 7 }}>{p.estado}</Text>
                  <Text style={{ width: 18, fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{p.n}</Text>
                  <Text style={{ width: 62, fontSize: 6.5, color: GRIS, textAlign: "right" }}>{usd(p.usd)}</Text>
                </View>
              ))}
            </>
          )}
        </Caja>
        <Caja titulo="Sus pendientes, por tipo" nota={totalPend > 0 ? "Solo lo suyo; el detalle va en el apartado 5." : undefined} flex={1}>
          {panel.pendientes.length === 0 ? (
            <Text style={{ fontSize: 7, color: GRIS, fontStyle: "italic" }}>Sin pendientes: al día.</Text>
          ) : (
            panel.pendientes.map((p) => (
              <BarraH key={p.titulo} rotulo={rotuloPendiente(p.titulo)} n={p.n} max={maxPend} color={/vencid|pasaron|habían pasado/.test(p.titulo) ? GRANATE : "#eda100"} />
            ))
          )}
        </Caja>
      </View>
    </View>
  );
}
