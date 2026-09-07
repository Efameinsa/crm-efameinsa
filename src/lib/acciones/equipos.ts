"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * El alta de una máquina en el parque instalado (0181).
 *
 * Hasta hoy una máquina solo podía nacer al cerrar un pedido con su serie
 * escrita: 10 de 198 pedidos lo hicieron, y por eso 148 de los 205 clientes que
 * compraron este año no tienen ninguna máquina registrada. No existía ninguna
 * pantalla para fichar a mano lo que el cliente ya tiene en su lavandería.
 *
 * Esta es esa pantalla. Sirve para dos cosas que hoy se hacen a ciegas: fichar
 * lo que el cliente reporta por teléfono, y cargar las máquinas de las ventas
 * viejas a medida que aparezcan las guías de remisión.
 */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function registrarEquipo(datos: {
  cuentaId: string;
  serie?: string | null;
  modelo: string;
  fechaCompra?: string | null;
  garantiaMeses?: number | null;
  ubicacion?: string | null;
}): Promise<{ error: string | null; equipoId?: string }> {
  if (!datos.cuentaId) return { error: "Elija de qué cliente es la máquina" };
  if (datos.modelo.trim().length < 3) return { error: "Escriba el modelo de la máquina" };
  if (datos.fechaCompra && !RE_FECHA.test(datos.fechaCompra)) return { error: "La fecha de compra no es válida" };

  const meses = datos.garantiaMeses ?? 24;
  if (meses < 0 || meses > 120) return { error: "Los meses de garantía no son válidos" };

  const supabase = await createClient();

  // Una serie no se ficha dos veces. Se avisa DÓNDE está la que ya existe: sin
  // esto, el «ya existe» a secas obliga a salir a buscarla a mano.
  const serie = datos.serie?.trim() || null;
  if (serie) {
    const { data: repetida } = await supabase
      .from("equipos_instalados")
      .select("id, cuentas(razon_social)")
      .ilike("serie", serie)
      .maybeSingle();
    if (repetida) {
      const duenio = (repetida.cuentas as unknown as { razon_social: string } | null)?.razon_social;
      return {
        error: `La serie ${serie} ya está fichada${duenio ? ` a nombre de ${duenio}` : ""}`,
      };
    }
  }

  const { data, error } = await supabase.rpc("fichar_equipo", {
    p_cuenta: datos.cuentaId,
    p_serie: serie,
    p_modelo: datos.modelo.trim(),
    p_producto: null,
    p_fecha_compra: datos.fechaCompra || null,
    p_garantia_meses: meses,
    p_ubicacion: datos.ubicacion?.trim() || null,
    p_atencion: null,
    p_registrado_en: "parque",
  });
  if (error) return { error: error.message };

  revalidatePath("/postventa/equipos");
  revalidatePath("/comercial/parque");
  return { error: null, equipoId: data as string };
}
