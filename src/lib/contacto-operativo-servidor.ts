import { createClient } from "@/lib/supabase/server";
import { separarNombreYCelular, type OrigenContacto } from "@/lib/contacto-operativo";

/**
 * Suma a la ficha, como contacto operativo, a la persona que postventa o el
 * almacén escribieron a mano (0352; Carlos, 30-09: «tiene que sumar al
 * contacto… para que no quede en el limbo»). La base decide si ya estaba
 * (mismo celular, últimos 9 dígitos) y no la repite.
 *
 * Nunca tumba lo que se estaba guardando: la apertura o el despacho ya se
 * registraron; si esto falla, queda solo el aviso en el log.
 */
export async function sumarContactoOperativo(
  cuentaId: string | null | undefined,
  persona: { nombre?: string | null; telefono?: string | null; cargo?: string | null } | string | null | undefined,
  origen: OrigenContacto,
): Promise<string | null> {
  if (!cuentaId || !persona) return null;
  let nombre: string | null;
  let telefono: string | null;
  let cargo: string | null;
  if (typeof persona === "string") {
    const s = separarNombreYCelular(persona);
    if (!s) return null;
    ({ nombre, telefono, cargo } = s);
  } else {
    // El teléfono de quien recibe a veces trae el nombre pegado: se separa igual.
    const s = separarNombreYCelular(persona.telefono);
    if (!s) return null;
    nombre = persona.nombre?.trim() || s.nombre;
    telefono = s.telefono;
    cargo = persona.cargo?.trim() || s.cargo;
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sumar_contacto_operativo", {
      p_cuenta: cuentaId,
      p_nombre: nombre ?? "",
      p_telefono: telefono,
      p_origen: origen,
      p_cargo: cargo,
    });
    if (error) {
      console.warn("[contacto operativo]", origen, error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.warn("[contacto operativo]", origen, e);
    return null;
  }
}
