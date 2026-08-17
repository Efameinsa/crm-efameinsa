import { z } from "zod";

// Make arma el body como texto plano: un valor mapeado vacío en una posición
// numérica sin comillas ("gasto_micros": ,) rompe la sintaxis JSON antes de
// que el request salga siquiera. Por eso los numéricos se aceptan también
// como STRING (para que en Make baste con poner TODO entre comillas, sin
// funciones ni fórmulas) y se convierten a número acá; "" o ausente = 0.
function numeroFlexible() {
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return 0;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return v;
  }, z.number().nonnegative());
}

export const esquemaRegistroGasto = z
  .object({
    // Los IDs de campaña de Google Ads llegan como número; se aceptan ambos.
    campaign_id: z.preprocess(
      (v) => (v === null || v === undefined ? "" : String(v).trim()),
      z.string().min(1, "campaign_id es obligatorio"),
    ),
    nombre: z.string().trim().min(1, "nombre es obligatorio"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD"),
    // Google Ads reporta el costo en "micros" (millonésimas de la moneda).
    // Se acepta crudo (gasto_micros) para que el orquestador no tenga que
    // hacer la división. Google (protobuf/JSON) suele OMITIR un campo por
    // completo cuando su valor es exactamente 0 (una campaña sin gasto/clics
    // ese día es un dato válido, no un error) — "ausente" y "cero" se tratan
    // igual.
    gasto: numeroFlexible().optional(),
    gasto_micros: numeroFlexible().optional(),
    impresiones: numeroFlexible(),
    clics: numeroFlexible(),
    // Google puede reportar conversiones fraccionadas (atribución parcial);
    // se acepta decimal y se redondea acá, no en el orquestador.
    leads_reportados: numeroFlexible(),
    moneda: z.enum(["USD", "PEN"]).default("USD"),
  })
  .transform((r) => ({
    ...r,
    gasto: r.gasto ?? (r.gasto_micros ?? 0) / 1_000_000,
    leads_reportados: Math.round(r.leads_reportados),
  }));

export const esquemaGastoCampania = z.object({
  plataforma: z.enum(["google", "meta"]),
  registros: z.array(esquemaRegistroGasto).min(1, "Se necesita al menos un registro"),
});

export type RegistroGasto = z.infer<typeof esquemaRegistroGasto>;
export type GastoCampaniaPayload = z.infer<typeof esquemaGastoCampania>;
