import { z } from "zod";

/**
 * Qué se puede corregir de un cierre EMITIDO y con qué forma (0153). La lista
 * blanca de la base es la que manda; esto solo evita mandar basura. Va en su
 * propio módulo porque un archivo "use server" solo puede exportar funciones.
 */
const esquemaContacto = z
  .object({
    area: z.string().trim().max(120).nullish(),
    nombre: z.string().trim().max(160).nullish(),
    telefono: z.string().trim().max(60).nullish(),
    correo: z.string().trim().max(160).nullish(),
  })
  .strict();

const esquemaItemInforme = z
  .object({
    tipo: z.enum(["equipo", "repuesto", "servicio"]).optional(),
    descripcion: z.string().trim().min(1, "Cada renglón necesita descripción").max(2000),
    cantidad: z.number().int().positive("La cantidad va en enteros positivos"),
    precio_unitario: z.number().min(0),
    bloque: z.enum(["venta", "gratuito"]).optional(),
  })
  .strict();

export const esquemaCorreccionInforme = z
  .object({
    cliente_nombre: z.string().trim().min(3).max(240).optional(),
    cliente_doc: z.string().trim().max(20).optional(),
    cliente_direccion: z.string().trim().max(400).optional(),
    cliente_correo: z.string().trim().max(160).optional(),
    referencia: z.string().trim().max(240).optional(),
    asunto: z.string().trim().min(3).max(240).optional(),
    presupuesto_ref: z.string().trim().max(80).optional(),
    orden_compra: z.string().trim().max(80).optional(),
    cliente_nuevo: z.boolean().optional(),
    urgente: z.boolean().optional(),
    modalidad_pago: z.array(z.string().trim().max(240)).max(12).optional(),
    forma_pago: z.enum(["transferencia", "deposito", ""]).optional(),
    comprobante: z.enum(["factura", "boleta_ruc", "boleta_dni", ""]).optional(),
    nota_condiciones: z.string().trim().max(1000).optional(),
    entrega_fecha: z.string().trim().max(60).optional(),
    entrega_hora: z.string().trim().max(60).optional(),
    entrega_lugar: z.string().trim().max(400).optional(),
    entrega_direccion: z.string().trim().max(400).optional(),
    nota_despacho: z.string().trim().max(1000).optional(),
    contacto_venta: esquemaContacto.optional(),
    contacto_contabilidad: esquemaContacto.optional(),
    contacto_despacho: esquemaContacto.optional(),
    items: z.array(esquemaItemInforme).min(1, "El cierre necesita al menos un renglón").max(40).optional(),
    incluye: z.array(z.string().trim().max(400)).max(20).optional(),
    gratis: z.string().trim().max(600).optional(),
    garantia: z.string().trim().max(400).optional(),
    nota_final: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CorreccionInforme = z.infer<typeof esquemaCorreccionInforme>;

