import { asuntoApertura, filasApertura, queQuedaEnAgenda, type DatosApertura, type FilaApertura } from "@/lib/apertura-servicio";
import { armarCorreo, armarCorreoTexto, COLORES, escaparHtml, type EmpresaCorreo } from "@/lib/correo/plantilla";

/**
 * LA APERTURA DE SERVICIO, COMO CORREO (Santos, 07-10: que el CRM la mande en
 * vez de copiarla y pegarla en Outlook).
 *
 * Es el mismo formato que Lesly usa desde siempre —las filas numeradas con
 * N.º, descripción, información y observaciones— pero armado por el sistema
 * con lo que ya está en el pedido, y con la marca. La fila 7 lleva al técnico
 * con su DNI. NO LLEVA MONTOS: es un documento de coordinación.
 *
 * Es solo para el equipo (almacén, Finanzas, contabilidad): al cliente no se le
 * manda esto.
 */

const FUENTE = "Arial,Helvetica,sans-serif";
const celda = (contenido: string, extra = "") =>
  `<td valign="top" style="padding:6px 5px;word-wrap:break-word;word-break:break-word;border:1px solid #bdb7b7;font-family:${FUENTE};font-size:12px;line-height:16px;color:${COLORES.carbon};${extra}">${contenido}</td>`;

const lineas = (t: string) => escaparHtml(t).replace(/\r?\n/g, "<br>");

function filaHtml(f: FilaApertura): string {
  const informacion =
    lineas(f.informacion) +
    (f.notas?.length
      ? `<div style="margin-top:6px;padding-top:5px;border-top:1px dashed #bdb7b7"><b>NOTAS:</b>${f.notas.map((n) => `<br>${escaparHtml(n)}`).join("")}</div>`
      : "");
  const observaciones =
    (f.n === 1 && f.observaciones ? `<b>${lineas(f.observaciones)}</b>` : lineas(f.observaciones)) +
    (f.resaltado ? `<div style="margin-top:6px">NOTA:<br><b style="background-color:#ffee58">${escaparHtml(f.resaltado)}</b></div>` : "");
  return (
    `<tr>${celda(String(f.n), "text-align:center")}` +
    `${celda(`<b style="font-size:10px">${escaparHtml(f.descripcion)}</b>`)}` +
    `${celda(informacion)}` +
    `${celda(observaciones)}</tr>`
  );
}

export function tablaAperturaHtml(filas: FilaApertura[]): string {
  const th = (t: string, ancho: string, alinear = "left") =>
    `<th align="${alinear}" width="${ancho}" style="width:${ancho};padding:6px 5px;border:1px solid #bdb7b7;background-color:${COLORES.fondo};font-family:${FUENTE};font-size:10px;font-weight:700;color:${COLORES.gris};text-transform:uppercase">${t}</th>`;
  // Columnas en porcentajes y con ancho fijo: en el celular la tabla se achica
  // en vez de salirse de la pantalla.
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;table-layout:fixed">` +
    `<tr>${th("N.º", "7%", "center")}${th("Descripción", "33%")}${th("Información", "36%")}${th("Obs.", "24%")}</tr>` +
    filas.map(filaHtml).join("") +
    `</table>`
  );
}

export function empresaDeApertura(d: Pick<DatosApertura, "empresa">): EmpresaCorreo {
  return /open/i.test(d.empresa) ? "OPEN" : "EFAMEINSA";
}

/** Asunto, HTML y texto plano de la apertura, listos para n8n. */
export function correoDeApertura(d: DatosApertura, enlace?: string): { asunto: string; html: string; texto: string; empresa: EmpresaCorreo } {
  const empresa = empresaDeApertura(d);
  const intro = `En coordinación con el Ing. Carlos, se ha quedado en agenda el siguiente ${queQuedaEnAgenda(d.tipo)}:`;
  const datos = {
    empresa,
    pretitulo: "Apertura de servicio",
    titulo: d.cliente,
    parrafos: [intro],
    contenidoHtml: tablaAperturaHtml(filasApertura(d)),
    contenidoAncho: true,
    boton: enlace ? { texto: "Ver la apertura en el CRM", url: enlace } : undefined,
    preheader: `${asuntoApertura(d)} · ${d.fecha ?? "fecha por confirmar"}`,
    pie: "Este correo lo envió postventa desde el CRM. Responda a este mensaje para coordinar.",
  };
  const texto =
    armarCorreoTexto(datos) +
    "\n\n" +
    filasApertura(d)
      .map((f) => `${f.n}. ${f.descripcion}\n   ${f.informacion.replace(/\n/g, "\n   ")}${f.notas?.length ? `\n   NOTAS: ${f.notas.join(" / ")}` : ""}${f.observaciones ? `\n   Observaciones: ${f.observaciones.replace(/\n/g, " ")}` : ""}`)
      .join("\n\n");
  return { asunto: asuntoApertura(d), html: armarCorreo(datos), texto, empresa };
}
