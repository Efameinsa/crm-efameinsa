import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { CARBON, GRANATE, GRIS, Seccion, TIPO, Tarjeta, VERDE, corta, dinero, e } from "@/lib/pdf/reporte-diario-pdf";
import type { BloquePendientes, PresupuestoPropio, VentaPropia } from "@/lib/trabajo-propio";

// Reporte por fechas (buzón, Gabriela PV2, 12-10, con gerencia: «filtrar de
// un día a otro día, o de un mes», «sus presupuestos de la semana», «los
// cierres de la semana, los seguimientos realizados», «sus pendientes de ella,
// no de Rubí»).
//
// Es el reporte del día estirado al rango que se elija: cada fila con su día
// delante y, arriba, un cuadro día por día para ver de un vistazo qué día se
// llamó, cotizó y cerró. No reemplaza al «Compromiso semanal» —que es la
// declaración del sábado y queda congelada—: este se baja cuando se quiera.
// Usa los estilos del reporte del día para que se lean igual.

export interface DiaPeriodo {
  fecha: string; // YYYY-MM-DD
  etiqueta: string; // «lun 05/10»
  efectivos: number;
  sinContacto: number;
  cotizaciones: number;
  enviadas: number;
  ventas: number;
  montoUsd: number;
  /** Lunes a sábado: cuenta para la meta. */
  habil: boolean;
}

export interface ReportePeriodoProps {
  logoBuffer: Buffer;
  /** «Del lunes 5 de octubre al sábado 10 de octubre de 2026» */
  rango: string;
  comercial: { nombre: string; codigo: string | null };
  /** Postventa: presupuestos y ventas por quien los hizo, no por el dueño del cliente. */
  porAutor: boolean;
  metaDiaria: number;
  dias: DiaPeriodo[];
  seguimientos: {
    fecha: string;
    dia: string;
    hora: string | null;
    cliente: string;
    tipo: string;
    nota: string | null;
    resultado: string | null;
    efectivo: boolean;
  }[];
  presupuestos: (PresupuestoPropio & { dia: string })[];
  ventas: (VentaPropia & { dia: string })[];
  complementarias: { fecha: string; dia: string; hora: string | null; titulo: string }[];
  /** Lo pendiente HOY (no al final del rango): es lo que hay que trabajar. Null si no se pudo calcular. */
  pendientes: BloquePendientes[] | null;
  hoy: string;
}

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString("es-PE")}`;

export function ReportePeriodoPdf({
  logoBuffer, rango, comercial, porAutor, metaDiaria, dias, seguimientos, presupuestos, ventas, complementarias, pendientes, hoy,
}: ReportePeriodoProps) {
  const efectivos = seguimientos.filter((s) => s.efectivo).length;
  const sinContacto = seguimientos.length - efectivos;
  const enviados = presupuestos.filter((c) => c.enviada).length;
  const enGerencia = presupuestos.filter((c) => c.estado_texto === "En gerencia").length;
  const observados = presupuestos.filter((c) => c.estado_texto === "Observado por gerencia").length;
  const vendidoUsd = ventas.reduce((s, v) => s + v.monto_usd, 0);
  const habiles = dias.filter((d) => d.habil).length;
  const meta = metaDiaria * habiles;
  const pct = meta > 0 ? Math.min((efectivos / meta) * 100, 100) : 0;
  const cumple = meta > 0 && efectivos >= meta;
  const totalPendientes = pendientes?.reduce((t, b) => t + b.filas.length, 0) ?? 0;
  const unDia = dias.length <= 1;

  return (
    <Document title={`Reporte ${comercial.codigo ?? ""} ${dias[0]?.fecha ?? ""}`} author="CRM Efameinsa">
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
          <Image style={e.logo} src={logoBuffer} />
          <View style={e.tituloBloque}>
            <Text style={e.titulo}>REPORTE DE GESTIÓN POR FECHAS</Text>
            <Text style={e.subtitulo}>{rango}</Text>
            <Text style={e.comercial}>
              {comercial.codigo ? `${comercial.codigo} · ` : ""}
              {comercial.nombre}
            </Text>
          </View>
        </View>

        <View style={e.metaCaja}>
          <View style={e.metaFila}>
            <Text style={e.metaEtiqueta}>Seguimientos efectivos del período</Text>
            <Text style={[e.metaNumero, { color: cumple ? VERDE : GRANATE }]}>
              {efectivos}
              {meta > 0 ? ` / ${meta}` : ""}
            </Text>
          </View>
          {meta > 0 && (
            <View style={e.barraFondo}>
              <View style={[e.barraRelleno, { width: `${pct}%`, backgroundColor: cumple ? VERDE : GRANATE }]} />
            </View>
          )}
          <Text style={{ fontSize: 7, color: GRIS, marginTop: meta > 0 ? 10 : 0 }}>
            {meta > 0
              ? cumple
                ? "Meta del período cumplida."
                : `Faltan ${meta - efectivos} para la meta (${metaDiaria} por día × ${habiles} día${habiles === 1 ? "" : "s"} de lunes a sábado).`
              : "Sin meta diaria cargada."}
            {sinContacto > 0 ? `  Además, ${sinContacto} intento${sinContacto === 1 ? "" : "s"} sin contacto (no contestó).` : ""}
          </Text>
        </View>

        <View style={e.tarjetas}>
          <Tarjeta etiqueta="Seguimientos" valor={String(seguimientos.length)} sub={`${efectivos} efectivos · ${sinContacto} sin contacto`} />
          <Tarjeta
            etiqueta="Presupuestos"
            valor={String(presupuestos.length)}
            sub={`${enviados} enviado${enviados === 1 ? "" : "s"}${enGerencia ? ` · ${enGerencia} en gerencia` : ""}${observados ? ` · ${observados} observado${observados === 1 ? "" : "s"}` : ""}`}
          />
          <Tarjeta etiqueta="Ventas cerradas" valor={String(ventas.length)} sub={ventas.length > 0 ? usd(vendidoUsd) : "—"} />
          <Tarjeta etiqueta={`Pendientes al ${hoy}`} valor={pendientes ? String(totalPendientes) : "—"} sub="presupuestos sin salir y seguimientos" />
        </View>

        {!unDia && (
          <Seccion titulo="RESUMEN DÍA POR DÍA" total={`${dias.length} días`}>
            <View style={e.th}>
              <Text style={[e.thTexto, { width: "20%" }]}>Día</Text>
              <Text style={[e.thTexto, { width: "16%", textAlign: "right" }]}>Efectivos</Text>
              <Text style={[e.thTexto, { width: "16%", textAlign: "right" }]}>Sin contacto</Text>
              <Text style={[e.thTexto, { width: "16%", textAlign: "right" }]}>Presupuestos</Text>
              <Text style={[e.thTexto, { width: "12%", textAlign: "right" }]}>Ventas</Text>
              <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Vendido</Text>
            </View>
            {dias.map((d, i) => (
              <View key={d.fecha} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "20%" }}>{d.etiqueta}</Text>
                <Text style={{ width: "16%", textAlign: "right", color: metaDiaria > 0 && d.efectivos >= metaDiaria ? VERDE : CARBON }}>
                  {d.efectivos}
                  {metaDiaria > 0 && d.habil ? ` / ${metaDiaria}` : ""}
                </Text>
                <Text style={{ width: "16%", textAlign: "right", color: GRIS }}>{d.sinContacto}</Text>
                <Text style={{ width: "16%", textAlign: "right" }}>
                  {d.cotizaciones}
                  {d.cotizaciones > 0 ? ` (${d.enviadas} env.)` : ""}
                </Text>
                <Text style={{ width: "12%", textAlign: "right" }}>{d.ventas}</Text>
                <Text style={{ width: "20%", textAlign: "right", color: d.montoUsd > 0 ? VERDE : GRIS }}>{d.montoUsd > 0 ? usd(d.montoUsd) : "—"}</Text>
              </View>
            ))}
            <View wrap={false} style={[e.fila, { borderTopWidth: 1, borderTopColor: GRANATE }]}>
              <Text style={{ width: "20%", fontFamily: "Helvetica-Bold" }}>TOTAL</Text>
              <Text style={{ width: "16%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>{efectivos}{meta > 0 ? ` / ${meta}` : ""}</Text>
              <Text style={{ width: "16%", textAlign: "right", color: GRIS }}>{sinContacto}</Text>
              <Text style={{ width: "16%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>{presupuestos.length}{presupuestos.length > 0 ? ` (${enviados} env.)` : ""}</Text>
              <Text style={{ width: "12%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>{ventas.length}</Text>
              <Text style={{ width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold", color: VERDE }}>{vendidoUsd > 0 ? usd(vendidoUsd) : "—"}</Text>
            </View>
          </Seccion>
        )}

        <Seccion titulo="1. SEGUIMIENTOS REALIZADOS" total={seguimientos.length}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: "13%" }]}>{unDia ? "Hora" : "Día"}</Text>
            <Text style={[e.thTexto, { width: "24%" }]}>Cliente</Text>
            <Text style={[e.thTexto, { width: "9%" }]}>Vía</Text>
            <Text style={[e.thTexto, { width: "16%" }]}>Resultado</Text>
            <Text style={[e.thTexto, { width: "38%" }]}>Detalle</Text>
          </View>
          {seguimientos.length === 0 ? (
            <Text style={e.vacio}>Sin seguimientos registrados en estas fechas.</Text>
          ) : (
            seguimientos.map((s, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "13%" }}>{unDia ? s.hora ?? "—" : `${s.dia}${s.hora ? ` ${s.hora}` : ""}`}</Text>
                <Text style={{ width: "24%", paddingRight: 6 }}>{corta(s.cliente, 70)}</Text>
                <Text style={{ width: "9%" }}>{TIPO[s.tipo] ?? s.tipo}</Text>
                <Text style={{ width: "16%", color: s.efectivo ? CARBON : GRIS }}>{s.resultado ?? (s.efectivo ? "Contactado" : "No contestó")}</Text>
                <Text style={{ width: "38%", color: GRIS }}>{corta(s.nota, 400)}</Text>
              </View>
            ))
          )}
        </Seccion>

        <Seccion titulo="2. PRESUPUESTOS" total={`${presupuestos.length}  (enviados: ${enviados})`}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: "12%" }]}>Día</Text>
            <Text style={[e.thTexto, { width: "15%" }]}>N°</Text>
            <Text style={[e.thTexto, { width: "37%" }]}>Cliente</Text>
            <Text style={[e.thTexto, { width: "19%" }]}>Estado</Text>
            <Text style={[e.thTexto, { width: "17%", textAlign: "right" }]}>Monto</Text>
          </View>
          {presupuestos.length === 0 ? (
            <Text style={e.vacio}>Sin presupuestos en estas fechas.</Text>
          ) : (
            presupuestos.map((c, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "12%" }}>{c.dia}</Text>
                <Text style={{ width: "15%" }}>{c.codigo ?? "Borrador"}</Text>
                <Text style={{ width: "37%", paddingRight: 6 }}>{corta(c.cliente, 46)}</Text>
                <Text style={{ width: "19%", color: c.estado_texto === "Observado por gerencia" ? GRANATE : c.enviada ? CARBON : GRIS }}>{c.estado_texto}</Text>
                <Text style={{ width: "17%", textAlign: "right" }}>{dinero(c.total, c.moneda)}</Text>
              </View>
            ))
          )}
          {porAutor && (
            <Text style={{ fontSize: 6.5, color: GRIS, marginTop: 4 }}>
              Los presupuestos que armó, aunque el cliente sea de otra cartera. Los que ya salieron van por el día en que se enviaron; los
              demás, por el día en que se armaron.
            </Text>
          )}
        </Seccion>

        <Seccion titulo="3. VENTAS CERRADAS" total={ventas.length > 0 ? `${ventas.length} · ${usd(vendidoUsd)}` : 0}>
          {ventas.length === 0 ? (
            <Text style={e.vacio}>Sin ventas cerradas en estas fechas.</Text>
          ) : (
            <>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "12%" }]}>Día</Text>
                <Text style={[e.thTexto, { width: "50%" }]}>Cliente</Text>
                <Text style={[e.thTexto, { width: "18%" }]}>Presupuesto</Text>
                <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Monto</Text>
              </View>
              {ventas.map((v, i) => (
                <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "12%" }}>{v.dia}</Text>
                  <Text style={{ width: "50%", paddingRight: 6 }}>{corta(v.cliente, 60)}</Text>
                  <Text style={{ width: "18%", color: GRIS }}>{v.presupuesto ?? "—"}</Text>
                  <Text style={{ width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold", color: VERDE }}>{dinero(v.monto, v.moneda)}</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>

        <Seccion titulo="4. ACTIVIDADES COMPLEMENTARIAS" total={complementarias.length}>
          {complementarias.length === 0 ? (
            <Text style={e.vacio}>Sin tareas completadas ni otras gestiones anotadas en estas fechas.</Text>
          ) : (
            complementarias.map((c, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "16%" }}>{unDia ? c.hora ?? "—" : `${c.dia}${c.hora ? ` ${c.hora}` : ""}`}</Text>
                <Text style={{ width: "84%" }}>{corta(c.titulo, 300)}</Text>
              </View>
            ))
          )}
        </Seccion>

        <Seccion titulo={`5. PENDIENTES AL ${hoy.toUpperCase()}`} total={pendientes ? totalPendientes : "—"}>
          {!pendientes ? (
            <Text style={e.vacio}>No se pudieron calcular los pendientes; están en la agenda del CRM.</Text>
          ) : (
            pendientes.map((b) => (
              <View key={b.titulo} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: CARBON, marginTop: 4, marginBottom: 2 }}>{b.titulo}</Text>
                {b.filas.length === 0 ? (
                  <Text style={e.vacio}>Nada pendiente.</Text>
                ) : (
                  b.filas.map((f, i) => (
                    <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                      <Text style={{ width: "40%", paddingRight: 6 }}>{corta(f.cliente, 55)}</Text>
                      <Text style={{ width: "60%", color: GRIS }}>{corta(f.detalle, 160)}</Text>
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </Seccion>

        <View style={e.pie} fixed>
          <Text style={e.pieTexto}>Generado automáticamente por el CRM de Efameinsa</Text>
          <Text style={e.pieTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
