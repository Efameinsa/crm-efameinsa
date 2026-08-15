import { z } from "zod";

// Payload de ingesta automática de leads (formularios de Meta/Google Ads vía
// Make.com, y a futuro el formulario de la web). Más permisivo que
// esquemaCaptura (lead.ts) porque no todos los orígenes traen todos los
// campos — solo el nombre es obligatorio.
export const esquemaLeadExterno = z.object({
  canal: z.enum([
    "whatsapp",
    "llamada",
    "formulario_web",
    "facebook",
    "instagram",
    "email",
    "presencial",
    "referido",
    "otro",
  ]),
  area_destino: z
    .enum(["comercial", "servicio_tecnico", "postventa", "rrhh", "proveedores", "administracion", "otros"])
    .default("comercial"),
  nombre_contacto: z.string().trim().min(1, "El nombre es obligatorio"),
  telefono: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  num_doc: z.string().trim().optional().or(z.literal("")),
  razon_social: z.string().trim().optional().or(z.literal("")),
  mensaje: z.string().trim().optional().or(z.literal("")),
  // Atribución de marketing — distinta del canal (VIA por dónde llegó).
  fuente: z.string().trim().optional(),
  gclid: z.string().trim().optional(),
  fbclid: z.string().trim().optional(),
  utm_source: z.string().trim().optional(),
  utm_medium: z.string().trim().optional(),
  utm_campaign: z.string().trim().optional(),
  utm_content: z.string().trim().optional(),
});

export type LeadExterno = z.infer<typeof esquemaLeadExterno>;
