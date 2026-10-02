import { z } from "zod";
import { VERSION_CONSENTIMIENTO } from "@/lib/campo-consentimiento";

/**
 * Lo que manda la app de Android para vincularse sola (POST /api/campo/dispositivo).
 *
 * La app genera un `instalacion_id` al instalarse (un UUID) y lo reusa siempre: así,
 * si la persona cierra y abre la app o el servidor reintenta, no se crea un celular
 * nuevo cada vez. `consentimiento` es lo que aceptó en la pantalla de la app: sin
 * aceptación expresa y de la versión VIGENTE del texto no se vincula nada (Ley 29733).
 */
export const VinculacionSchema = z.object({
  instalacion_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "instalación no válida"),
  modelo: z.string().trim().max(80).optional(),
  version_app: z.string().regex(/^[\w.-]{1,20}$/).optional(),
  // Solo viene cuando la persona acaba de aceptar en la pantalla. Si ya había aceptado la
  // versión vigente (reinstalar, reabrir), no viaja y el CRM comprueba su aceptación anterior.
  consentimiento: z
    .object({
      version: z.string().max(30),
      aceptado: z.literal(true),
    })
    .optional(),
});

export type Vinculacion = z.infer<typeof VinculacionSchema>;

export type ResultadoValidacion =
  | { ok: true; datos: Vinculacion }
  | { ok: false; estado: 400 | 409; error: "datos" | "consentimiento"; detalle: string };

export function validarVinculacion(cuerpo: unknown): ResultadoValidacion {
  const r = VinculacionSchema.safeParse(cuerpo);
  if (!r.success) {
    // «aceptado: false» o un consentimiento mal formado: se dice con su nombre, la app muestra la pantalla.
    const faltaAceptar = r.error.issues.some((i) => i.path[0] === "consentimiento");
    return faltaAceptar
      ? { ok: false, estado: 409, error: "consentimiento", detalle: "La persona tiene que aceptar el registro de su ubicación." }
      : { ok: false, estado: 400, error: "datos", detalle: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  if (r.data.consentimiento && r.data.consentimiento.version !== VERSION_CONSENTIMIENTO) {
    return { ok: false, estado: 409, error: "consentimiento", detalle: `El texto de consentimiento cambió (vigente ${VERSION_CONSENTIMIENTO}).` };
  }
  return { ok: true, datos: r.data };
}

/** El nombre con el que el celular aparece en «Trabajo de campo» (gerencia). */
export function nombreDelCelular(persona: string | null | undefined, modelo?: string): string {
  const base = `App de ${persona?.trim() || "campo"}`;
  return modelo?.trim() ? `${base} · ${modelo.trim()}` : base;
}
