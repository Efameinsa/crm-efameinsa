/**
 * EL AVISO DE «LE ESCRIBIERON POR WHATSAPP» (comerciales, 02-10-2026).
 *
 * Hasta hoy la campana solo sonaba por el PRIMER mensaje de un chat nuevo
 * (lead derivado) o por un botón de ficha. Lo que el cliente escribía después
 * —la respuesta a la cotización, «¿me puede llamar?»— entraba mudo: el
 * comercial, haciendo otra gestión, no se enteraba hasta abrir la bandeja.
 *
 * Reglas, como en WhatsApp:
 *  · Lo primero que se lee es QUIÉN escribe; debajo, QUÉ dijo (el último
 *    mensaje, corto). Así se decide sin abrir si es para ya.
 *  · UN aviso por conversación: si el cliente manda cinco mensajes seguidos,
 *    la campana no muestra cinco filas; muestra una, «5 mensajes», con el
 *    último texto. El webhook borra el aviso pendiente anterior de ese chat y
 *    crea uno nuevo (la campana solo escucha altas).
 */

/** Cuánto del mensaje entra en el aviso: lo que se lee de un vistazo. */
const LARGO_VISTAZO = 90;

export function vistazoDelMensaje(tipo: string, texto: string | null): string {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (limpio) return limpio.length > LARGO_VISTAZO ? `${limpio.slice(0, LARGO_VISTAZO - 1).trimEnd()}…` : limpio;
  switch (tipo) {
    case "image":
      return "📷 Foto";
    case "audio":
      return "🎤 Audio";
    case "video":
      return "🎥 Video";
    case "document":
      return "📄 Documento";
    case "sticker":
      return "Sticker";
    case "location":
      return "📍 Ubicación";
    default:
      return "Mensaje nuevo";
  }
}

export function avisoDeMensajeWhatsapp(datos: {
  quien: string;
  tipo: string;
  texto: string | null;
  /** Mensajes del cliente desde la última respuesta nuestra (incluido este). */
  sinResponder: number;
}): { titulo: string; cuerpo: string } {
  const vistazo = vistazoDelMensaje(datos.tipo, datos.texto);
  const cuantos = Math.max(1, datos.sinResponder);
  return {
    titulo: datos.quien,
    cuerpo: cuantos > 1 ? `${cuantos} mensajes sin responder · «${vistazo}»` : `«${vistazo}»`,
  };
}

/**
 * El título de la pestaña mientras haya chats esperando, como WhatsApp Web:
 * lo que asoma en una pestaña angosta son las primeras letras, así que van el
 * número y el nombre.
 */
export function tituloDePestanaWhatsapp(chats: { titulo: string }[]): string {
  // El primero es el más reciente: es el que acaba de sonar.
  const quien = chats.length === 1 ? `${chats[0].titulo} le escribió` : `${chats[0].titulo} y ${chats.length - 1} más`;
  return `💬 (${chats.length}) ${quien}`;
}
