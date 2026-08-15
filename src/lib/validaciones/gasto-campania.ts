import { z } from "zod";

export const esquemaRegistroGasto = z.object({
  campaign_id: z.string().trim().min(1, "campaign_id es obligatorio"),
  nombre: z.string().trim().min(1, "nombre es obligatorio"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD"),
  gasto: z.number().nonnegative(),
  impresiones: z.number().int().nonnegative(),
  clics: z.number().int().nonnegative(),
  leads_reportados: z.number().int().nonnegative().default(0),
  moneda: z.enum(["USD", "PEN"]).default("USD"),
});

export const esquemaGastoCampania = z.object({
  plataforma: z.enum(["google", "meta"]),
  registros: z.array(esquemaRegistroGasto).min(1, "Se necesita al menos un registro"),
});

export type RegistroGasto = z.infer<typeof esquemaRegistroGasto>;
export type GastoCampaniaPayload = z.infer<typeof esquemaGastoCampania>;
