/**
 * DE DÓNDE VINO UN CONTACTO, para que el circuito quede bien marcado.
 *
 * Santos, 11-09: hay que distinguir tres cosas que hasta hoy se veían igual
 * («Formulario web»):
 *
 *   · FORMULARIO DE GOOGLE ADS — el cliente llenó el formulario nativo del
 *     anuncio y Google lo mandó al webhook. `fuente = google_ads`.
 *   · LANDING DE CAMPAÑA — el anuncio mandó tráfico a una landing de
 *     efameinsa.com y el cliente se registró ahí. La web lo manda con
 *     `fuente = «web · landing · …»` (o «web · campaña …», que fue lo
 *     primero que se acordó) y con gclid/fbclid/utm.
 *   · WEB ORGÁNICA — se registró en efameinsa.com sin venir de un anuncio:
 *     `fuente = «web · sitio · …»` y sin gclid, fbclid ni medio pagado.
 *
 * Y el caso intermedio: entró a la web normal viniendo de un anuncio (trae
 * gclid pero no es landing) → «Web · vino de campaña».
 *
 * Lo que registra Central por teléfono o WhatsApp no lleva origen de estos:
 * su canal ya lo dice.
 *
 * Misma regla que `leads_por_origen` (0227) y `conversiones_de_campana`
 * (0226): lo que se marca acá es lo que después se cuenta y se reporta.
 */
export interface Campana {
  plataforma: "google" | "meta" | "otra";
  etiqueta: string;
}

const MEDIOS_PAGADOS = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social"]);
const FUENTES_META = new Set(["facebook", "meta", "instagram", "fb", "ig"]);

interface LeadOrigen {
  canal?: string | null;
  gclid?: string | null;
  /** El clic de Google en iPhone, cuando Safari no entrega el gclid (0228). */
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  fuente?: string | null;
  /**
   * WhatsApp de campañas, fase 1 sin API (14-09): el código del mensaje
   * prellenado del anuncio y la plataforma, denormalizados en el lead al
   * registrarlo. No hay gclid ni fbclid en este caso — el clic pasó por
   * WhatsApp, no por la web.
   */
  codigo_campania_wa?: string | null;
  plataforma_campania_wa?: "meta" | "google" | "otro" | null;
}

/** La campaña pagada que trajo el clic, si la hubo. */
export function campanaDe(lead: LeadOrigen): Campana | null {
  const fuente = (lead.fuente ?? "").toLowerCase();
  const medio = (lead.utm_medium ?? "").toLowerCase();
  const origen = (lead.utm_source ?? "").toLowerCase();
  const clicGoogle = Boolean(lead.gclid || lead.gbraid || lead.wbraid);
  const esCampana =
    clicGoogle ||
    Boolean(lead.fbclid) ||
    MEDIOS_PAGADOS.has(medio) ||
    fuente === "google_ads" ||
    fuente === "meta_ads" ||
    fuente.startsWith("web · campaña") ||
    fuente.startsWith("web · landing");
  if (!esCampana) return null;
  if (clicGoogle || origen === "google" || fuente === "google_ads") return { plataforma: "google", etiqueta: "Google Ads" };
  if (lead.fbclid || FUENTES_META.has(origen) || fuente === "meta_ads") return { plataforma: "meta", etiqueta: "Meta" };
  return { plataforma: "otra", etiqueta: "campaña pagada" };
}

export type ClaveOrigen = "ads_form" | "landing" | "web_campana" | "web_organico" | "whatsapp_campana" | "whatsapp_web";

export interface Origen {
  clave: ClaveOrigen;
  /** Lo que dice el chip: «Formulario de Google Ads», «Landing · Google Ads», «Web · orgánico»… */
  etiqueta: string;
  plataforma: "google" | "meta" | "otra" | null;
  /** El clic costó plata: se atiende primero. */
  urgente: boolean;
}

const ETIQUETA_PLATAFORMA_WA: Record<"meta" | "google" | "otro", string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  otro: "campaña",
};

export function origenDe(lead: LeadOrigen): Origen | null {
  const fuente = (lead.fuente ?? "").toLowerCase();
  // WhatsApp de campañas, fase 1 (14-09): se decide ANTES que todo lo demás
  // porque estos contactos no traen fuente/utm — el canal ya es "whatsapp" y
  // lo único que dice de qué campaña vino es este código.
  if (lead.canal === "whatsapp" && lead.codigo_campania_wa) {
    const plat = lead.plataforma_campania_wa ?? "otro";
    // El botón de WhatsApp de la web (0254) firma el mensaje con W-<página>
    // cuando la visita no vino de un anuncio: es orgánico, como un formulario
    // del sitio. Con G-/M- el clic sí costó y se trata como campaña.
    if (/^W-/i.test(lead.codigo_campania_wa)) {
      return { clave: "whatsapp_web", etiqueta: "WhatsApp desde la web", plataforma: null, urgente: false };
    }
    const desdeLaWeb = /^[GM]-/i.test(lead.codigo_campania_wa);
    return {
      clave: "whatsapp_campana",
      etiqueta: `WhatsApp ${desdeLaWeb ? "desde la web" : "de campaña"} · ${ETIQUETA_PLATAFORMA_WA[plat]}`,
      plataforma: plat === "otro" ? "otra" : plat,
      urgente: true,
    };
  }
  const campana = campanaDe(lead);
  if (fuente === "google_ads") return { clave: "ads_form", etiqueta: "Formulario de Google Ads", plataforma: "google", urgente: true };
  if (fuente === "meta_ads") return { clave: "ads_form", etiqueta: "Formulario de Meta", plataforma: "meta", urgente: true };
  const esWeb = fuente.startsWith("web") || lead.canal === "formulario_web";
  const esLanding = fuente.startsWith("web · landing") || fuente.startsWith("web · campaña");
  if (esLanding) {
    return { clave: "landing", etiqueta: `Landing de campaña${campana ? ` · ${campana.etiqueta}` : ""}`, plataforma: campana?.plataforma ?? "otra", urgente: true };
  }
  if (campana) {
    return { clave: "web_campana", etiqueta: `${esWeb ? "Web · vino de " : "Vino de "}${campana.etiqueta}`, plataforma: campana.plataforma, urgente: true };
  }
  if (esWeb) return { clave: "web_organico", etiqueta: "Web · orgánico", plataforma: null, urgente: false };
  return null;
}

/** La campaña con nombre; el id numérico de Google no le dice nada a nadie. */
export function nombreDeCampana(utmCampaign: string | null | undefined): string | null {
  const c = (utmCampaign ?? "").trim();
  if (!c || /^\d+$/.test(c)) return null;
  return c;
}

/**
 * La fuente legible de la web, sin el prefijo de clasificación: de
 * «web · landing · industrial · hotel · 30 kg» queda «industrial · hotel · 30 kg».
 * Las claves internas (google_ads, meta_ads) no se muestran.
 */
export function fuenteLegible(fuente: string | null | undefined): string | null {
  const f = (fuente ?? "").trim();
  if (!f || f === "google_ads" || f === "meta_ads") return null;
  return f.replace(/^web\s*·\s*(landing|sitio|campaña|orgánico)\s*(·\s*)?/i, "").trim() || null;
}

/** «google.com» de «https://www.google.com/» — el referente sin ruido. */
function sitioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * El recorrido del contacto en la web (0254), en una línea que el comercial
 * lee de un vistazo: «Entró por /secadoras-comerciales… desde google.com ·
 * escribió desde /calculadora». Vacío si la web no mandó nada (contactos de
 * Central, formularios de Google Ads).
 */
export function recorridoDe(lead: { pagina_entrada?: string | null; pagina_envio?: string | null; referente?: string | null }): string | null {
  const partes: string[] = [];
  if (lead.pagina_entrada) partes.push(`Entró por ${lead.pagina_entrada}${lead.referente ? ` desde ${sitioDe(lead.referente)}` : ""}`);
  else if (lead.referente) partes.push(`Vino de ${sitioDe(lead.referente)}`);
  if (lead.pagina_envio && lead.pagina_envio !== lead.pagina_entrada) partes.push(`escribió desde ${lead.pagina_envio}`);
  return partes.length ? partes.join(" · ") : null;
}
