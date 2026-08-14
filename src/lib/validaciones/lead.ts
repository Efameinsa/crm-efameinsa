import { z } from "zod";

export const esquemaCaptura = z.object({
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
  area_destino: z.enum([
    "comercial",
    "servicio_tecnico",
    "postventa",
    "rrhh",
    "proveedores",
    "administracion",
    "otros",
  ]),
  nombre_contacto: z.string().trim().min(1, "El nombre es obligatorio"),
  telefono: z.string().trim().optional().or(z.literal("")),
  num_doc: z.string().trim().optional().or(z.literal("")),
  razon_social: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  mensaje: z.string().trim().optional().or(z.literal("")),
});

export type DatosCaptura = z.infer<typeof esquemaCaptura>;
