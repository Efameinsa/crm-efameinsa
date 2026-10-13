import { View, Text } from "@react-pdf/renderer";
import { LINEAS, type Linea } from "@/lib/panel-postventa";
import type { PanoramaPendientes, SeguimientoPendiente } from "@/lib/panorama-pendientes";
import { COLOR_LINEA } from "@/lib/pdf/panel-postventa-pdf";
import { sumarDias } from "@/lib/calendario";

// LA HOJA «LO QUE FALTA GESTIONAR» (Santos, 13-10). Arriba, de un vistazo: cuánto
// hay vencido y desde cuándo, en qué línea y qué viene en la semana. Abajo, la
// lista COMPLETA de las cuentas pendientes, de la más atrasada a la más nueva,
// para organizarse. Mismas cajas y colores que el panel del día.

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#D8D4D3";
const RIEL = "#ECE9E8";
const FILA_GRIS = "#F4F2F1";
const AMBAR = "#eda100";
const AZUL = "#2a78d6";
// Atraso: un solo tono, de claro (poco) a oscuro (mucho).
const TRAMOS: { rotulo: string; min: number; max: number; color: string }[] = [
  { rotulo: "1 a 3 días", min: 1, max: 3, color: "#E3A9A3" },
  { rotulo: "4 a 7 días", min: 4, max: 7, color: "#CF7A72" },
  { rotulo: "8 a 15 días", min: 8, max: 15, color: "#B44A41" },
  { rotulo: "16 a 30 días", min: 16, max: 30, color: "#972820" },
  { rotulo: "Más de 30 días", min: 31, max: Infinity, color: "#5E0C0A" },
];
const CORTO: Record<Linea, string> = {
  repuestos: "Repuestos",
  mantenimiento: "Mantenimiento",
  soporte: "Soporte/garantía",
  pedidos: "Despacho y PEM",
  otros: "Seguimiento",
};
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const caja = { borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 9 } as const;
const pct = (n: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0);
const corta = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return !t ? "—" : t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Caja({ titulo, nota, children, flex }: { titulo: string; nota?: string; children: React.ReactNode; flex?: number }) {
  return (
    // `flex` solo dentro de una fila: en columna aplasta la caja a cero.
    <View style={flex ? [caja, { flex }] : caja} wrap={false}>
      <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: CARBON, marginBottom: 2 }}>{titulo}</Text>
      {nota ? <Text style={{ fontSize: 6.5, color: GRIS, marginBottom: 7 }}>{nota}</Text> : <View style={{ height: 6 }} />}
      {children}
    </View>
  );
}

function Kpi({ etiqueta, valor, sub, color }: { etiqueta: string; valor: number; sub: string; color: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 3, borderTopColor: color }}>
      <Text style={{ fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 }}>{etiqueta}</Text>
      <Text style={{ fontSize: 18, lineHeight: 1.1, fontFamily: "Helvetica-Bold", color: CARBON, marginTop: 4, height: 21 }}>{valor}</Text>
      <Text style={{ fontSize: 6.5, color: GRIS, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function Leyenda({ items }: { items: { rotulo: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
      {items.map((i) => (
        <View key={i.rotulo} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: i.color, marginRight: 3 }} />
          <Text style={{ fontSize: 6.5, color: GRIS }}>{i.rotulo}</Text>
        </View>
      ))}
    </View>
  );
}

/** Cabecera granate de una tabla, con su total; no queda sola al pie de la hoja. */
function Cabecera({ titulo, total }: { titulo: string; total: number }) {
  return (
    <View
      minPresenceAhead={40}
      style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: GRANATE, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 2, marginTop: 10 }}
    >
      <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", letterSpacing: 0.3 }}>{titulo}</Text>
      <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" }}>TOTAL: {total}</Text>
    </View>
  );
}

function Th({ cols }: { cols: [string, string, ("right" | "left")?][] }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: BORDE }}>
      {cols.map(([t, w, a]) => (
        <Text key={t} style={{ width: w, fontSize: 6.5, color: GRIS, textTransform: "uppercase", fontFamily: "Helvetica-Bold", textAlign: a ?? "left" }}>
          {t}
        </Text>
      ))}
    </View>
  );
}

/** «12 d» en una pastilla del color de su tramo; «Hoy» y «en 3 d» en gris. */
function Atraso({ dias }: { dias: number }) {
  if (dias <= 0)
    return <Text style={{ fontSize: 7, color: dias === 0 ? AMBAR : GRIS, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{dias === 0 ? "Para el día" : `en ${-dias} d`}</Text>;
  const t = TRAMOS.find((x) => dias >= x.min && dias <= x.max)!;
  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
      <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: "#FFFFFF", backgroundColor: t.color, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 }}>
        {dias} d
      </Text>
    </View>
  );
}

const fila = (i: number) => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  borderBottomWidth: 0.5,
  borderBottomColor: BORDE,
  paddingVertical: 3.5,
  paddingHorizontal: 5,
  ...(i % 2 ? { backgroundColor: FILA_GRIS } : {}),
});

export function PanoramaPendientesPdf({ p, esHoy }: { p: PanoramaPendientes; esHoy: boolean }) {
  const vencidos = p.seguimientos.filter((s) => s.atraso > 0);
  const delDia = p.seguimientos.filter((s) => s.atraso === 0);
  const proximos = p.seguimientos.filter((s) => s.atraso < 0);
  const anotVencidos = p.anotados.filter((a) => a.atraso > 0).length;

  const porTramo = TRAMOS.map((t) => ({ ...t, n: vencidos.filter((s) => s.atraso >= t.min && s.atraso <= t.max).length }));
  const maxTramo = Math.max(1, ...porTramo.map((t) => t.n));

  const porLinea = LINEAS.map((l) => {
    const de = p.seguimientos.filter((s) => s.linea === l.clave);
    return { ...l, v: de.filter((s) => s.atraso > 0).length, h: de.filter((s) => s.atraso === 0).length, x: de.filter((s) => s.atraso < 0).length };
  });
  const maxLinea = Math.max(1, ...porLinea.map((l) => l.v + l.h + l.x));

  const semana = Array.from({ length: 7 }, (_, i) => {
    const f = sumarDias(p.dia, i + 1);
    const d = new Date(`${f}T12:00:00Z`).getUTCDay();
    return { f, etiqueta: `${DIA_CORTO[d]} ${f.slice(8, 10)}`, n: proximos.filter((s) => s.fecha === f).length + p.anotados.filter((a) => a.fecha === f).length };
  });
  const maxSemana = Math.max(1, ...semana.map((d) => d.n));

  // LAS CUENTAS: una fila por cliente, con todo lo que tiene pendiente (vencido o del día).
  const cuentas = new Map<string, SeguimientoPendiente[]>();
  for (const s of [...vencidos, ...delDia]) cuentas.set(s.cliente, [...(cuentas.get(s.cliente) ?? []), s]);
  const filasCuentas = [...cuentas].map(([cliente, items]) => ({ cliente, items, atraso: Math.max(...items.map((i) => i.atraso)) })).sort((a, b) => b.atraso - a.atraso);
  const conAtraso30 = vencidos.filter((s) => s.atraso > 30).length;
  const deCuandoLoMas = vencidos[0];

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
        <Kpi etiqueta="Vencidos" valor={vencidos.length} sub={conAtraso30 > 0 ? `seguimientos · ${conAtraso30} de más de 30 días` : "seguimientos · ninguno de más de 30 d"} color={GRANATE} />
        <Kpi etiqueta={esHoy ? "Para hoy" : "Para ese día"} valor={delDia.length} sub="seguimientos programados" color={AMBAR} />
        <Kpi etiqueta="Próximos 7 días" valor={proximos.length} sub="ya agendados" color={AZUL} />
        <Kpi etiqueta="Por salir" valor={p.presupuestos.length} sub="presupuestos armados sin enviar" color="#1baf7a" />
        <Kpi etiqueta="Anotados" valor={p.anotados.length} sub={anotVencidos > 0 ? `${anotVencidos} con fecha pasada` : esHoy ? "abiertos" : "solo en el reporte de hoy"} color="#e87ba4" />
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Caja
          titulo="¿Desde cuándo están vencidos?"
          nota={deCuandoLoMas ? `El más antiguo: ${corta(deCuandoLoMas.cliente, 34)}, programado el ${fechaCorta(deCuandoLoMas.fecha)}.` : "Sin seguimientos vencidos."}
          flex={1}
        >
          {porTramo.map((t) => (
            <View key={t.rotulo} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
              <Text style={{ width: 70, fontSize: 7 }}>{t.rotulo}</Text>
              <View style={{ flex: 1, height: 10, backgroundColor: RIEL, borderRadius: 2, flexDirection: "row" }}>
                {t.n > 0 && <View style={{ width: `${pct(t.n, maxTramo)}%`, height: 10, backgroundColor: t.color, borderRadius: 2 }} />}
              </View>
              <Text style={{ width: 24, fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{t.n}</Text>
            </View>
          ))}
        </Caja>
        <Caja titulo="Lo pendiente, por línea" nota="Seguimientos vencidos, del día y de los próximos 7 días." flex={1.25}>
          {porLinea.map((l) => {
            const n = l.v + l.h + l.x;
            return (
              <View key={l.clave} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: COLOR_LINEA[l.clave as Linea], marginRight: 4 }} />
                <Text style={{ width: 96, fontSize: 7 }}>{l.titulo}</Text>
                <View style={{ flex: 1, height: 10, backgroundColor: RIEL, borderRadius: 2, flexDirection: "row" }}>
                  {[
                    [l.v, GRANATE],
                    [l.h, AMBAR],
                    [l.x, AZUL],
                  ].map(([k, c], i) =>
                    (k as number) > 0 ? (
                      <View key={i} style={{ width: `${pct(k as number, maxLinea)}%`, height: 10, backgroundColor: c as string, borderLeftWidth: 1, borderLeftColor: "#FFFFFF" }} />
                    ) : null,
                  )}
                </View>
                <Text style={{ width: 24, fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{n}</Text>
              </View>
            );
          })}
          <Leyenda
            items={[
              { rotulo: "Vencido", color: GRANATE },
              { rotulo: esHoy ? "Para hoy" : "Para ese día", color: AMBAR },
              { rotulo: "Próximos 7 días", color: AZUL },
            ]}
          />
        </Caja>
      </View>

      <View style={{ marginBottom: 4 }}>
        <Caja titulo="Su agenda de los próximos 7 días" nota="Seguimientos y pendientes anotados que ya tienen fecha.">
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 52 }}>
            {semana.map((d) => (
              <View key={d.f} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{d.n}</Text>
                <View style={{ width: 30, height: d.n > 0 ? Math.max(2, (d.n / maxSemana) * 36) : 0, backgroundColor: AZUL, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", borderTopWidth: 0.75, borderTopColor: GRIS, paddingTop: 3 }}>
            {semana.map((d) => (
              <Text key={d.f} style={{ flex: 1, textAlign: "center", fontSize: 7, color: GRIS }}>
                {d.etiqueta}
              </Text>
            ))}
          </View>
        </Caja>
      </View>

      {/* LA LISTA COMPLETA: sin «y 84 más». */}
      <Cabecera titulo="CUENTAS CON GESTIÓN PENDIENTE (DE LA MÁS ATRASADA A LA MÁS NUEVA)" total={filasCuentas.length} />
      {filasCuentas.length === 0 ? (
        <Text style={{ fontSize: 8, color: GRIS, fontStyle: "italic", padding: 6 }}>Al día: ninguna cuenta con seguimiento vencido ni para el día.</Text>
      ) : (
        <>
          <Th cols={[["#", "5%"], ["Cliente", "34%"], ["Línea", "15%"], ["Qué toca", "28%"], ["Fecha", "10%"], ["Atraso", "8%", "right"]]} />
          {filasCuentas.map((c, i) => {
            const primero = c.items.sort((a, b) => b.atraso - a.atraso)[0];
            const lineas = [...new Set(c.items.map((x) => x.linea))];
            return (
              <View key={c.cliente} wrap={false} style={fila(i)}>
                <Text style={{ width: "5%", color: GRIS }}>{i + 1}</Text>
                <Text style={{ width: "34%", paddingRight: 6 }}>
                  {corta(c.cliente, 60)}
                  {c.items.length > 1 ? <Text style={{ color: GRIS }}>{`  (${c.items.length} expedientes)`}</Text> : null}
                </Text>
                <View style={{ width: "15%", flexDirection: "row", alignItems: "center", paddingRight: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: COLOR_LINEA[primero.linea], marginRight: 3 }} />
                  <Text style={{ fontSize: 7, color: GRIS }}>{CORTO[primero.linea]}{lineas.length > 1 ? " +" : ""}</Text>
                </View>
                <Text style={{ width: "28%", color: GRIS, paddingRight: 4 }}>{corta(primero.accion ?? "Seguimiento", 60)}</Text>
                <Text style={{ width: "10%", color: GRIS }}>{fechaCorta(primero.fecha)}{primero.hora ? ` ${primero.hora}` : ""}</Text>
                <View style={{ width: "8%" }}>
                  <Atraso dias={c.atraso} />
                </View>
              </View>
            );
          })}
        </>
      )}

      <Cabecera titulo="PRESUPUESTOS QUE TODAVÍA NO SALEN" total={p.presupuestos.length} />
      {p.presupuestos.length === 0 ? (
        <Text style={{ fontSize: 8, color: GRIS, fontStyle: "italic", padding: 6 }}>Ninguno: todo lo que armó ya salió.</Text>
      ) : (
        <>
          <Th cols={[["N°", "14%"], ["Cliente", "40%"], ["Estado", "20%"], ["Armado", "9%"], ["Monto", "17%", "right"]]} />
          {p.presupuestos.map((c, i) => (
            <View key={i} wrap={false} style={fila(i)}>
              <Text style={{ width: "14%" }}>{c.codigo ?? "Sin número"}</Text>
              <Text style={{ width: "40%", paddingRight: 6 }}>{corta(c.cliente, 52)}</Text>
              <Text style={{ width: "20%", color: c.estado === "Observado por gerencia" ? GRANATE : GRIS }}>{c.estado}</Text>
              <Text style={{ width: "9%", color: GRIS }}>{c.armado}</Text>
              <Text style={{ width: "17%", textAlign: "right" }}>{c.monto}</Text>
            </View>
          ))}
        </>
      )}

      {p.anotados.length > 0 && (
        <>
          <Cabecera titulo="LO QUE ANOTÓ A MANO (IMPORTACIÓN, STOCK, CIERRE…)" total={p.anotados.length} />
          <Th cols={[["Tipo", "20%"], ["Qué es", "55%"], ["Para el", "13%"], ["Atraso", "12%", "right"]]} />
          {p.anotados.map((a, i) => (
            <View key={i} wrap={false} style={fila(i)}>
              <Text style={{ width: "20%", fontFamily: "Helvetica-Bold", fontSize: 7.5 }}>{a.tipo}</Text>
              <Text style={{ width: "55%", paddingRight: 6 }}>{corta(a.titulo, 110)}</Text>
              <Text style={{ width: "13%", color: GRIS }}>{fechaCorta(a.fecha)}{a.hora ? ` ${a.hora}` : ""}</Text>
              <View style={{ width: "12%" }}>
                <Atraso dias={a.atraso} />
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
