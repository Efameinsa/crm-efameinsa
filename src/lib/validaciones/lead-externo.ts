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
  // El clic de Google en iPhone, cuando Safari no entrega el gclid (0228).
  gbraid: z.string().trim().optional(),
  wbraid: z.string().trim().optional(),
  fbclid: z.string().trim().optional(),
  utm_source: z.string().trim().optional(),
  utm_medium: z.string().trim().optional(),
  utm_campaign: z.string().trim().optional(),
  utm_content: z.string().trim().optional(),
  /**
   * LO QUE EL CLIENTE VIO Y PIDIÓ, COMO DOCUMENTO (Carlos, 14-09): «¿no es más
   * conveniente que el gestor sepa qué es lo que has hecho, mediante un
   * documento, un PDF, que se adjunte automáticamente?». La web manda el PDF
   * del dimensionamiento (o de la cotización del carrito) en base64; el CRM
   * lo guarda como adjunto del contacto y viaja con él al expediente.
   */
  adjuntos: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(200),
        tipo: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
        contenido_base64: z.string().min(1).max(8_000_000), // ~6 MB
      }),
    )
    .max(3)
    .optional(),
});

export type LeadExterno = z.infer<typeof esquemaLeadExterno>;
