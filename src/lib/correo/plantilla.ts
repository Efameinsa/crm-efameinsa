/**
 * EL ARMADOR DE CORREOS DEL CRM (Santos, 07-10: «correos profesionales con
 * plantillas»). Un solo sitio que devuelve el HTML de cualquier correo que
 * salga del sistema, con la marca, para que todos se vean igual en Gmail,
 * Outlook de escritorio y el celular.
 *
 * HTML DE CORREO, NO DE PÁGINA WEB: tablas y estilos en línea. Outlook de
 * escritorio dibuja con el motor de Word y no entiende flex, grid, variables
 * CSS ni, de forma fiable, un <style>. Por eso nada de eso aparece acá.
 *
 * Puro y sin dependencias del servidor: se usa igual en el envío y en las
 * pruebas.
 */

export type EmpresaCorreo = "EFAMEINSA" | "OPEN";

export interface DatosCorreo {
  empresa?: EmpresaCorreo;
  /** Línea chica sobre el título: el área o el tipo de aviso. */
  pretitulo?: string;
  titulo: string;
  parrafos?: string[];
  /** Datos del pedido, uno por fila. */
  tabla?: { etiqueta: string; valor: string }[];
  boton?: { texto: string; url: string };
  /** Recuadro gris con una aclaración. */
  nota?: string;
  /**
   * HTML ya armado y de confianza (lo escapa quien llama). Para los formatos que
   * la empresa ya usa tal cual, como la tabla de la visita a planta de Lesly:
   * se les pone la marca alrededor sin tocar su contenido.
   */
  contenidoHtml?: string;
  /** El contenido de confianza usa casi todo el ancho (tablas anchas que en el celular no caben con los márgenes normales). */
  contenidoAncho?: boolean;
  /** Texto de la firma; `null` la quita. Por defecto, la de la empresa. */
  firma?: string | null;
  /** Resumen que Gmail muestra junto al asunto en la lista. */
  preheader?: string;
  /** Letra chica de cierre. */
  pie?: string;
}

export const COLORES = { granate: "#7e1210", carbon: "#262830", fondo: "#f5f3f3", gris: "#6b6b6b", linea: "#e3dede", verde: "#1e7f4f" } as const;
export const LOGO_EFAMEINSA = { url: "https://crm.efameinsa.com/logo-efameinsa.png", ancho: 200, alto: 33 } as const;
export const FIRMA_POR_DEFECTO = "Corporación Efameinsa · (01) 504-1695 · www.efameinsa.com";

const FUENTE = "Arial,Helvetica,sans-serif";

export function escaparHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Un enlace solo se acepta con https: nada de javascript:, data: ni http. */
export function urlSegura(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}

const conSaltos = (t: string) => escaparHtml(t).replace(/\r?\n/g, "<br>");

function encabezado(empresa: EmpresaCorreo): string {
  if (empresa === "OPEN") {
    return `<td style="padding:24px 32px 8px 32px;font-family:${FUENTE};font-size:18px;font-weight:700;letter-spacing:1px;color:${COLORES.carbon}">OPEN INVESTMENTS S.A.C.</td>`;
  }
  return (
    `<td style="padding:24px 32px 8px 32px">` +
    `<img src="${LOGO_EFAMEINSA.url}" width="${LOGO_EFAMEINSA.ancho}" height="${LOGO_EFAMEINSA.alto}" alt="Corporación Efameinsa" ` +
    `style="display:block;border:0;outline:none;text-decoration:none;width:${LOGO_EFAMEINSA.ancho}px;height:${LOGO_EFAMEINSA.alto}px"></td>`
  );
}

function fila(contenido: string, relleno = "0 32px 16px 32px"): string {
  return `<tr><td style="padding:${relleno};font-family:${FUENTE};font-size:14px;line-height:21px;color:${COLORES.carbon}">${contenido}</td></tr>`;
}

export function armarCorreo(d: DatosCorreo): string {
  const empresa = d.empresa ?? "EFAMEINSA";
  const filas: string[] = [];

  if (d.pretitulo) {
    filas.push(
      fila(
        `<span style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${COLORES.granate}">${escaparHtml(d.pretitulo)}</span>`,
        "12px 32px 4px 32px",
      ),
    );
  }
  filas.push(
    fila(`<span style="font-size:20px;line-height:26px;font-weight:700;color:${COLORES.carbon}">${escaparHtml(d.titulo)}</span>`, `${d.pretitulo ? "0" : "12px"} 32px 12px 32px`),
  );
  for (const p of d.parrafos ?? []) if (p.trim()) filas.push(fila(`<p style="margin:0">${conSaltos(p)}</p>`, "0 32px 12px 32px"));

  if (d.tabla?.length) {
    const celdas = d.tabla
      .map(
        (f) =>
          `<tr><td width="34%" valign="top" style="padding:8px 10px;border-bottom:1px solid ${COLORES.linea};font-family:${FUENTE};font-size:12px;font-weight:700;color:${COLORES.gris}">${escaparHtml(f.etiqueta)}</td>` +
          `<td valign="top" style="padding:8px 10px;border-bottom:1px solid ${COLORES.linea};font-family:${FUENTE};font-size:14px;color:${COLORES.carbon}">${conSaltos(f.valor)}</td></tr>`,
      )
      .join("");
    filas.push(
      fila(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORES.linea};border-collapse:collapse">${celdas}</table>`,
        "4px 32px 16px 32px",
      ),
    );
  }

  if (d.contenidoHtml) filas.push(fila(d.contenidoHtml, d.contenidoAncho ? "0 12px 16px 12px" : "0 32px 16px 32px"));

  if (d.nota?.trim()) {
    filas.push(
      fila(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORES.fondo}" style="background-color:${COLORES.fondo};padding:12px 14px;border-left:3px solid ${COLORES.granate};font-family:${FUENTE};font-size:13px;line-height:19px;color:${COLORES.carbon}">${conSaltos(d.nota)}</td></tr></table>`,
      ),
    );
  }

  // EL «BOTÓN» ES UN ENLACE DE TEXTO (Santos, 07-10): el botón con fondo y
  // relleno llegaba a su correo sin estilos, como texto suelto, y nadie sabía
  // que era un enlace. Subrayado, en cursiva y en granate se entiende como
  // hipervínculo en cualquier cliente —Gmail, Outlook o el celular— porque no
  // depende de fondos ni de relleno, que son justo lo que algunos recortan.
  const url = urlSegura(d.boton?.url);
  if (d.boton && url) {
    filas.push(
      fila(
        `<a href="${escaparHtml(url)}" target="_blank" style="font-family:${FUENTE};font-size:15px;font-weight:700;font-style:italic;color:${COLORES.granate};text-decoration:underline">${escaparHtml(d.boton.texto)}</a>`,
        "4px 32px 20px 32px",
      ),
    );
  }

  const firma = d.firma === undefined ? FIRMA_POR_DEFECTO : d.firma;
  const pie = [firma, d.pie].filter((x): x is string => !!x?.trim());
  if (pie.length) {
    filas.push(
      `<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid ${COLORES.linea};font-family:${FUENTE};font-size:12px;line-height:18px;color:${COLORES.gris}">` +
        pie.map((x) => conSaltos(x)).join("<br>") +
        `</td></tr>`,
    );
  }

  // El texto oculto que Gmail muestra al lado del asunto. El relleno evita que
  // le pegue el principio del cuerpo.
  const oculto = d.preheader?.trim()
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLORES.fondo}">${escaparHtml(d.preheader)}${"&#8199;&zwnj;".repeat(40)}</div>`
    : "";

  return (
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting"><title>${escaparHtml(d.titulo)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${COLORES.fondo}">${oculto}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORES.fondo}" style="background-color:${COLORES.fondo}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px">` +
    `<tr><td height="4" style="height:4px;line-height:4px;font-size:4px;background-color:${COLORES.granate};border-radius:8px 8px 0 0">&nbsp;</td></tr>` +
    `<tr>${encabezado(empresa)}</tr>` +
    filas.join("") +
    `</table></td></tr></table></body></html>`
  );
}

/** La misma información en texto plano: mejora la entrega y la lee quien bloquea el HTML. */
export function armarCorreoTexto(d: DatosCorreo): string {
  const empresa = d.empresa === "OPEN" ? "OPEN INVESTMENTS S.A.C." : "CORPORACIÓN EFAMEINSA";
  const partes: string[] = [empresa, ""];
  if (d.pretitulo) partes.push(d.pretitulo.toUpperCase());
  partes.push(d.titulo, "");
  for (const p of d.parrafos ?? []) if (p.trim()) partes.push(p.trim(), "");
  if (d.tabla?.length) partes.push(...d.tabla.map((f) => `${f.etiqueta}: ${f.valor.replace(/\r?\n/g, " / ")}`), "");
  if (d.nota?.trim()) partes.push(d.nota.trim(), "");
  const url = urlSegura(d.boton?.url);
  if (d.boton && url) partes.push(`${d.boton.texto}: ${url}`, "");
  const firma = d.firma === undefined ? FIRMA_POR_DEFECTO : d.firma;
  if (firma) partes.push("--", firma);
  if (d.pie?.trim()) partes.push(d.pie.trim());
  return partes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
