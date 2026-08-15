import { z } from "zod";

export const esquemaRegistroGasto = z
  .object({
    campaign_id: z.string().trim().min(1, "campaign_id es obligatorio"),
    nombre: z.string().trim().min(1, "nombre es obligatorio"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD"),
    // Google Ads reporta el costo en "micros" (millonésimas de la moneda).
    // Se acepta crudo (gasto_micros) para que el orquestador (Make) no tenga
    // que hacer la división. Todos los numéricos son opcionales con default
    // 0: Google (protobuf/JSON) suele OMITIR un campo por completo cuando su
    // valor es exactamente 0 (una campaña sin gasto/clics ese día es un dato
    // válido, no un error) — así que "ausente" y "cero" deben tratarse igual.
    gasto: z.number().nonnegative().optional(),
    gasto_micros: z.number().nonnegative().optional(),
    impresiones: z.number().int().nonnegative().default(0),
    clics: z.number().int().nonnegative().default(0),
    // Google puede reportar conversiones fraccionadas (atribución parcial);
    // se acepta decimal y se redondea acá, no en el orquestador.
    leads_reportados: z.number().nonnegative().default(0),
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
