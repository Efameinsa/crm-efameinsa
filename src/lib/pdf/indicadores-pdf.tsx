import { View, Text } from "@react-pdf/renderer";
import type { EstadoIndicador, Evaluacion, IndicadoresDocumento } from "@/lib/indicadores-comerciales";

/**
 * Los indicadores del comercial en los documentos (ing. Carlos, 30-09: «esos
 * dos puntos tienen que estar en su reporte diario, reporte semanal, reporte
 * mensual, todo»). Un mismo bloque en los tres PDF: WhatsApp de campaña,
 * visitas y videollamadas, cada uno con su número, su meta, su barra y el
 * estado ESCRITO —el papel se imprime en blanco y negro y el color solo no
 * dice nada—.
 */

const GRIS = "#6B6B6B";
const BORDE = "#D8D4D3";

const COLOR_ESTADO: Record<EstadoIndicador, string> = {
  en_meta: "#1E7F4F",
  en_camino: "#B7791F",
  atrasado: "#7E1210",
  en_medicion: GRIS,
  sin_meta: GRIS,
};

function TarjetaIndicador({
  etiqueta,
  valor,
  meta,
  estado,
  sub,
}: {
  etiqueta: string;
  valor: number;
  meta: number | null;
  estado: Evaluacion | null;
  sub?: string;
}) {
  const pct = meta && meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  const color = estado ? COLOR_ESTADO[estado.estado] : GRIS;
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 7 }}>
      <Text style={{ fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 }}>{etiqueta}</Text>
      <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 }}>
        {String(valor)}
        {meta !== null ? <Text style={{ fontSize: 8, fontFamily: "Helvetica", color: GRIS }}>{`  de ${meta}`}</Text> : null}
      </Text>
      {meta !== null && meta > 0 ? (
        <View style={{ height: 4, backgroundColor: "#E8E5E4", borderRadius: 2, marginTop: 3 }}>
          <View style={{ height: 4, width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
        </View>
      ) : null}
      {sub ? <Text style={{ fontSize: 6.5, color: GRIS, marginTop: 3 }}>{sub}</Text> : null}
      {estado ? <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color, marginTop: 3 }}>{estado.texto}</Text> : null}
    </View>
  );
}

export function BloqueIndicadoresPdf({
  ind,
  rotuloWhatsapp,
  rotuloPeriodo,
  anterior,
  conHoy = true,
}: {
  ind: IndicadoresDocumento;
  rotuloWhatsapp: string;
  /** «semana», «mes»… */
  rotuloPeriodo: string;
  /** «la semana pasada», «el mes anterior». */
  anterior: string;
  /** Mostrar «N hoy» (solo tiene sentido en el reporte del día). */
  conHoy?: boolean;
}) {
  const w = ind.whatsapp;
  const subWhatsapp =
    w.chats === 0
      ? "Sin chats de anuncio: no hay nada que medir."
      : `chats de anuncio · ${w.calificadosMismoDia} calificados el mismo día (meta ${ind.metas.calificadosPct} %)` +
        (w.medianaRespuestaMin !== null ? ` · responde en ${w.medianaRespuestaMin} min (meta ${ind.metas.respuestaMin})` : "") +
        (w.sinResponder > 0 ? ` · ${w.sinResponder} sin responder` : "") +
        (w.interesados ? ` · ${w.interesados} interesados, ${w.cotizados} cotizados` : "");
  const sub = (c: { hoy: number; anterior: number }) => `${conHoy ? `${c.hoy} hoy · ` : ""}${c.anterior} ${anterior}`;
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }} wrap={false}>
      <TarjetaIndicador etiqueta={rotuloWhatsapp} valor={w.chats} meta={null} estado={ind.whatsappEstado} sub={subWhatsapp} />
      <TarjetaIndicador
        etiqueta={`Visitas · ${rotuloPeriodo}`}
        valor={ind.visitas.hecho}
        meta={ind.visitas.meta}
        estado={ind.visitas.estado}
        sub={sub(ind.visitas)}
      />
      <TarjetaIndicador
        etiqueta={`Videollamadas · ${rotuloPeriodo}`}
        valor={ind.videollamadas.hecho}
        meta={ind.videollamadas.meta}
        estado={ind.videollamadas.estado}
        sub={sub(ind.videollamadas)}
      />
    </View>
  );
}
