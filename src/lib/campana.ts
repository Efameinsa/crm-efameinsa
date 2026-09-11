/**
 * DE QUÉ CAMPAÑA VINO UN CONTACTO, para que la bandeja lo diga.
 *
 * Santos, 11-09: los contactos que llegan por publicidad pagada tienen que
 * distinguirse a la vista en la bandeja de triaje —de otro color— y
 * gestionarse a la brevedad, con la misma urgencia que un «PROSPECTO
 * CALIENTE» de la calculadora de la web. El clic ya costó plata, y el que
 * llenó el formulario se enfría en horas.
 *
 * Cómo se reconoce: trae el identificador del clic (gclid = Google, fbclid =
 * Meta), o el medio es pagado (utm_medium cpc/ppc/paid/paidsocial), o la
 * fuente lo dice («web · campaña …» de las landings; `google_ads` del
 * webhook). Misma regla que `conversiones_de_campana` (0226): lo que se
 * marca acá es lo que después se le reporta a la plataforma.
 */
export interface Campana {
  plataforma: "google" | "meta" | "otra";
  etiqueta: string;
}

const MEDIOS_PAGADOS = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social"]);
const FUENTES_META = new Set(["facebook", "meta", "instagram", "fb", "ig"]);

export function campanaDe(lead: {
  gclid?: string | null;
  fbclid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  fuente?: string | null;
}): Campana | null {
  const fuente = (lead.fuente ?? "").toLowerCase();
  const medio = (lead.utm_medium ?? "").toLowerCase();
  const origen = (lead.utm_source ?? "").toLowerCase();
  const esCampana =
    Boolean(lead.gclid) ||
    Boolean(lead.fbclid) ||
    MEDIOS_PAGADOS.has(medio) ||
    fuente === "google_ads" ||
    fuente === "meta_ads" ||
    fuente.startsWith("web · campaña");
  if (!esCampana) return null;
  if (lead.gclid || origen === "google" || fuente === "google_ads") return { plataforma: "google", etiqueta: "Campaña Google Ads" };
  if (lead.fbclid || FUENTES_META.has(origen) || fuente === "meta_ads") return { plataforma: "meta", etiqueta: "Campaña Meta" };
  return { plataforma: "otra", etiqueta: "Campaña pagada" };
}

/** La campaña con nombre; el id numérico de Google no le dice nada a nadie. */
export function nombreDeCampana(utmCampaign: string | null | undefined): string | null {
  const c = (utmCampaign ?? "").trim();
  if (!c || /^\d+$/.test(c)) return null;
  return c;
}

/** La fuente legible de la web («web · campaña industrial · hotel · 30 kg»); las claves internas no. */
export function fuenteLegible(fuente: string | null | undefined): string | null {
  const f = (fuente ?? "").trim();
  if (!f || f === "google_ads" || f === "meta_ads") return null;
  return f;
}
