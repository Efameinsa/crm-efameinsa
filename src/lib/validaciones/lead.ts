import { z } from "zod";

export const esquemaCaptura = z.object({
  canal: z.enum(
    [
      "whatsapp",
      "llamada",
      "formulario_web",
      "facebook",
      "instagram",
      "email",
      "presencial",
      "referido",
      "otro",
    ],
    // El campo arranca vacío a propósito: es el dato con el que después se
    // pide la evidencia, así que tiene que ser una respuesta. Si no lo
    // eligieron, el aviso dice qué falta y por qué importa.
    { message: "Elija por dónde llegó el contacto: es lo que después permite pedir la evidencia." },
  ),
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
  // WhatsApp de campañas, fase 1 (14-09-2026): el código del mensaje
  // prellenado del anuncio («Hola, vi su anuncio… [M1-A]»), elegido de una
  // lista, no tipeado. Solo tiene sentido con canal=whatsapp; con cualquier
  // otro canal se ignora en el servidor.
  codigo_campania_wa: z.string().trim().optional().or(z.literal("")),
});

export type DatosCaptura = z.infer<typeof esquemaCaptura>;

// Metadatos de los archivos que Central adjunta al registrar (la foto o el PDF
// que el prospecto mandó por WhatsApp). Los archivos ya están en el bucket
// privado 'adjuntos' cuando llegan aquí; esto solo valida que el formulario
// mande rutas del prefijo de leads y no de otra cosa.
export const esquemaAdjuntosLead = z
  .array(
    z.object({
      path: z.string().startsWith("leads/").max(300),
      nombre: z.string().trim().min(1).max(200),
      tipo: z.string().max(120),
      tamano: z.number().int().nonnegative(),
    }),
  )
  .max(5);

export type AdjuntoLead = z.infer<typeof esquemaAdjuntosLead>[number];
