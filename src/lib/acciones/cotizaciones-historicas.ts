"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Suma al archivo una cotización de un año anterior que el import no alcanzó a
 * traer.
 *
 * DE DÓNDE SALE. Brenda, 25-08: su 1549-25 de SAYWA «no está en el sistema».
 * Esa en particular sí estaba —lo que faltaba era poder buscarla—, pero al
 * revisar la numeración aparecieron ~200 huecos reales entre 2025 y 2026:
 * documentos que existieron y que el parseo de las unidades S:/T: no leyó.
 *
 * NO ES PARA COTIZAR. Solo admite años anteriores al actual, y la base lo
 * vuelve a comprobar en la política de inserción: una cotización de este año se
 * hace en el CRM y lleva correlativo del CRM. Si se pudiera cargar «a mano» una
 * de 2026, la serie oficial dejaría de significar algo.
 */
export interface NuevaCotizacionHistorica {
  serie: "EFAMEINSA" | "OPEN";
  correlativo: number;
  anio: number;
  fecha: string | null;
  cliente: string;
  cuentaId: string | null;
  monto: number | null;
  equipos: string;
}

export async function agregarCotizacionHistorica(
  datos: NuevaCotizacionHistorica,
): Promise<{ error: string | null; codigo?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión vencida. Vuelva a entrar." };

  const anioActual = Number(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 4),
  );
  const cliente = datos.cliente.trim();
  if (!cliente) return { error: "Falta el nombre del cliente" };
  if (!Number.isInteger(datos.correlativo) || datos.correlativo <= 0) {
    return { error: "El número de la cotización no es válido" };
  }
  if (!Number.isInteger(datos.anio) || datos.anio < 2015 || datos.anio >= anioActual) {
    return {
      error: `Solo se pueden agregar cotizaciones de años anteriores a ${anioActual}. Las de este año se hacen en el CRM.`,
    };
  }
  // La fecha, si viene, tiene que caer dentro del año declarado: es lo que
  // después ubica el documento en los paneles por período.
  if (datos.fecha && !datos.fecha.startsWith(String(datos.anio))) {
    return { error: `La fecha tiene que ser del año ${datos.anio}` };
  }

  const yy = String(datos.anio).slice(-2);
  const codigo = `${datos.correlativo}-${yy}`;
  // Mismo patrón que los documentos reales del archivo: es lo que hace que el
  // índice único (serie, archivo) detecte solo el duplicado.
  const archivo = `Presu_${codigo}, ${cliente}`;

  const equipos = datos.equipos
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const { error } = await supabase.from("cotizaciones_historicas").insert({
    serie: datos.serie,
    correlativo: datos.correlativo,
    anio: datos.anio,
    codigo,
    fecha: datos.fecha,
    cliente,
    cuenta_id: datos.cuentaId,
    comercial_id: user.id,
    cargada_por: user.id,
    monto_sin_igv: datos.monto,
    fuente_monto: datos.monto != null ? "cargada_a_mano" : null,
    items: equipos,
    n_equipos: equipos.length || null,
    archivo,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `La ${codigo} de ese cliente ya está en el archivo. Búsquela por su número.` };
    }
    if (error.code === "42501") {
      return { error: "No puede agregar una cotización a nombre de otro comercial." };
    }
    return { error: error.message };
  }

  revalidatePath("/comercial/cotizaciones");
  return { error: null, codigo };
}
