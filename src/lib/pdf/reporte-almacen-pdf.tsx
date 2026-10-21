import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { e, Seccion, Tarjeta, corta, CARBON, GRIS, GRANATE, VERDE } from "@/lib/pdf/reporte-diario-pdf";
import type { Hecho, IndicadorAlmacen } from "@/lib/almacen-dia";
import type { Tarea } from "@/lib/propuesta/cola-del-dia";

/**
 * EL REPORTE DEL DÍA DEL ALMACÉN (Santos, 21-10). Mismo papel que el de
 * postventa (logo, fecha, quién), con lo que el almacén responde al cierre:
 *   1. Los indicadores del área (meta cero) y cuánto se hizo.
 *   2. Lo que se hizo hoy, con hora y quién (lo registró el CRM solo).
 *   3. Otras gestiones anotadas a mano.
 *   4. Lo que quedó pendiente, en el orden de ataque, y por qué.
 *   5. Lo de mañana: despachos programados y pruebas en cola.
 * Es del ÁREA: sale lo de todo el almacén, con el nombre de quien hizo cada cosa.
 */
export interface ReporteAlmacenProps {
  logoBuffer: Buffer;
  /** «martes, 21 de octubre de 2026» */
  fecha: string;
  /** YYYY-MM-DD */
  fechaCorta: string;
  quien: { nombre: string; codigo: string | null };
  indicadores: IndicadorAlmacen[];
  resumen: { pruebas: number; series: number; salidas: number; agencias: number; listos: number; llamadas: number; recepciones: number; stock: number; anotados: number; total: number };
  hechos: Hecho[];
  grupos: { clave: string; titulo: string; tareas: Tarea[] }[];
  manana: { fecha: string; despachos: { cliente: string; equipo: string; estado: string }[]; pruebasEnCola: number; llamadas: { cliente: string; tipo: string; hora: string }[] };
}

const URGENCIA: Record<Tarea["urgencia"], string> = { atrasado: "Atrasado", hoy: "Hoy", semana: "Semana" };

export function ReporteAlmacenPdf({ logoBuffer, fecha, fechaCorta, quien, indicadores, resumen, hechos, grupos, manana }: ReporteAlmacenProps) {
  const alDia = indicadores.every((i) => i.numero === 0);
  const pendientes = grupos.reduce((n, g) => n + g.tareas.length, 0);
  const anotados = hechos.filter((h) => h.tipo === "anotado");
  const registrados = hechos.filter((h) => h.tipo !== "anotado");
  const fila = (i: number) => [e.fila, ...(i % 2 ? [e.filaAlterna] : [])];

  return (
    <Document title={`Reporte del almacén ${fechaCorta}`} author="CRM Efameinsa">
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
          <Image style={e.logo} src={logoBuffer} />
          <View style={e.tituloBloque}>
            <Text style={e.titulo}>REPORTE DEL DÍA · ALMACÉN</Text>
            <Text style={e.subtitulo}>{fecha}</Text>
            <Text style={e.comercial}>
              {quien.codigo ? `${quien.codigo} · ` : ""}
              {quien.nombre}
            </Text>
          </View>
        </View>

        {/* 1. La meta del almacén es cero colgados (Santos, 21-10). */}
        <View style={e.metaCaja}>
          <View style={e.metaFila}>
            <Text style={e.metaEtiqueta}>META DEL ÁREA: CERO COLGADOS</Text>
            <Text style={[e.metaNumero, { color: alDia ? VERDE : GRANATE }]}>{alDia ? "AL DÍA" : `${indicadores.reduce((n, i) => n + i.numero, 0)} POR RESOLVER`}</Text>
          </View>
          {indicadores.map((i) => (
            <View key={i.clave} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
              <Text style={{ fontSize: 9, color: CARBON }}>{i.titulo}</Text>
              <Text style={{ fontSize: 9, fontWeight: 700, color: i.numero === 0 ? VERDE : GRANATE }}>{i.numero === 0 ? "0 ✓" : String(i.numero)}</Text>
            </View>
          ))}
        </View>

        <View style={e.tarjetas}>
          <Tarjeta etiqueta="Pruebas y embalajes" valor={String(resumen.pruebas)} />
          <Tarjeta etiqueta="Series registradas" valor={String(resumen.series)} />
          <Tarjeta etiqueta="Salidas de planta" valor={String(resumen.salidas)} sub={resumen.agencias ? `${resumen.agencias} en agencia` : undefined} />
          <Tarjeta etiqueta="Llamadas atendidas" valor={String(resumen.llamadas)} />
          <Tarjeta etiqueta="Equipos recibidos" valor={String(resumen.recepciones)} sub={resumen.stock ? `${resumen.stock} de stock` : undefined} />
          <Tarjeta etiqueta="Pendientes al cierre" valor={String(pendientes)} />
        </View>

        {/* 2. Lo que se hizo, con hora y quién. */}
        <Seccion titulo="1. LO QUE HIZO EL ALMACÉN HOY" total={registrados.length}>
          {registrados.length === 0 ? (
            <Text style={e.vacio}>Nada registrado este día.</Text>
          ) : (
            <>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "8%" }]}>HORA</Text>
                <Text style={[e.thTexto, { width: "27%" }]}>QUÉ</Text>
                <Text style={[e.thTexto, { width: "27%" }]}>CLIENTE</Text>
                <Text style={[e.thTexto, { width: "24%" }]}>EQUIPO</Text>
                <Text style={[e.thTexto, { width: "14%" }]}>QUIÉN</Text>
              </View>
              {registrados.map((h, i) => (
                <View key={h.id} wrap={false} style={fila(i)}>
                  <Text style={{ width: "8%" }}>{h.hora ?? "—"}</Text>
                  <Text style={{ width: "27%", paddingRight: 4 }}>{h.que}</Text>
                  <Text style={{ width: "27%", paddingRight: 4 }}>{corta(h.cliente, 60)}</Text>
                  <Text style={{ width: "24%", paddingRight: 4, color: GRIS }}>{corta(h.detalle, 70)}</Text>
                  <Text style={{ width: "14%", color: GRIS }}>{corta(h.quien, 24)}</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>

        {/* 3. Lo anotado a mano (texto libre hasta mapearlo, Santos 21-10). */}
        <Seccion titulo="2. OTRAS GESTIONES DEL DÍA" total={anotados.length}>
          {anotados.length === 0 ? (
            <Text style={e.vacio}>Sin otras gestiones anotadas.</Text>
          ) : (
            anotados.map((h, i) => (
              <View key={h.id} wrap={false} style={fila(i)}>
                <Text style={{ width: "5%" }}>{i + 1}.</Text>
                <Text style={{ width: "75%" }}>{h.que}</Text>
                <Text style={{ width: "20%", color: GRIS }}>{corta(h.quien, 24)}</Text>
              </View>
            ))
          )}
        </Seccion>

        {/* 4. Lo pendiente, en el orden de ataque, y por qué. */}
        <Seccion titulo="3. LO QUE QUEDÓ PENDIENTE, EN ORDEN" total={pendientes}>
          {pendientes === 0 ? (
            <Text style={e.vacio}>Nada pendiente para el almacén.</Text>
          ) : (
            grupos.map((g, gi) => (
              <View key={g.clave} style={{ marginTop: gi ? 6 : 0 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: CARBON, marginBottom: 2 }}>
                  {gi + 1}. {g.titulo.toUpperCase()} · {g.tareas.length}
                </Text>
                {g.tareas.map((t, i) => (
                  <View key={t.id} wrap={false} style={fila(i)}>
                    <Text style={{ width: "10%", color: t.urgencia === "atrasado" ? GRANATE : GRIS }}>{URGENCIA[t.urgencia]}</Text>
                    <Text style={{ width: "28%", paddingRight: 4 }}>{corta(t.cliente, 60)}</Text>
                    <Text style={{ width: "27%", paddingRight: 4 }}>{corta(t.que, 70)}</Text>
                    <Text style={{ width: "35%", color: GRIS }}>{corta(t.porque, 140)}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </Seccion>

        {/* 5. Mañana. */}
        <Seccion titulo={`4. LO DE MAÑANA · ${manana.fecha}`} total={manana.despachos.length + manana.llamadas.length}>
          <Text style={{ fontSize: 9, color: CARBON, marginBottom: 3 }}>
            {manana.despachos.length} {manana.despachos.length === 1 ? "despacho programado" : "despachos programados"} · {manana.pruebasEnCola} {manana.pruebasEnCola === 1 ? "prueba en cola" : "pruebas en cola"} · {manana.llamadas.length} {manana.llamadas.length === 1 ? "llamada" : "llamadas"} de postventa
          </Text>
          {manana.despachos.map((d, i) => (
            <View key={`d${i}`} wrap={false} style={fila(i)}>
              <Text style={{ width: "12%" }}>Despacho</Text>
              <Text style={{ width: "33%", paddingRight: 4 }}>{corta(d.cliente, 60)}</Text>
              <Text style={{ width: "35%", paddingRight: 4, color: GRIS }}>{corta(d.equipo, 80)}</Text>
              <Text style={{ width: "20%", color: d.estado === "Listo" ? VERDE : GRANATE }}>{d.estado}</Text>
            </View>
          ))}
          {manana.llamadas.map((l, i) => (
            <View key={`l${i}`} wrap={false} style={fila(manana.despachos.length + i)}>
              <Text style={{ width: "12%" }}>{l.hora}</Text>
              <Text style={{ width: "33%", paddingRight: 4 }}>{corta(l.cliente, 60)}</Text>
              <Text style={{ width: "55%", color: GRIS }}>{l.tipo}</Text>
            </View>
          ))}
          {manana.despachos.length + manana.llamadas.length === 0 && <Text style={e.vacio}>Sin despachos ni llamadas con fecha para mañana.</Text>}
        </Seccion>

        <View style={e.pie} fixed>
          <Text style={e.pieTexto}>Generado automáticamente por el CRM de Efameinsa</Text>
          <Text style={e.pieTexto}>
            Almacén · {fechaCorta.slice(8, 10)}/{fechaCorta.slice(5, 7)}/{fechaCorta.slice(0, 4)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
