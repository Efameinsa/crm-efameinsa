"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";

// FILES (0334): pedir el archivador físico de un cliente a Central y el cuaderno
// de cargos en el CRM. Todo pasa por funciones de la base, que controlan quién
// puede qué; acá solo se llaman y se refresca la pantalla.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

export interface ClienteParaFile {
  id: string;
  razonSocial: string;
  documento: string | null;
  cartera: string | null;
}

/**
 * Buscar clientes para pedir su file. Cualquier área pide files de cualquier
 * cliente (postventa revisa el expediente de ventas de otros), así que no se
 * limita a la cartera propia: solo devuelve nombre, documento y de quién es.
 */
export async function buscarClientesParaFile(q: string): Promise<ClienteParaFile[]> {
  await requerirPerfil();
  const texto = q.trim();
  if (texto.length < 3) return [];
  const patron = `%${texto.replace(/[%_,()]/g, " ")}%`;
  const { data } = await createAdminClient()
    .from("cuentas")
    .select("id, razon_social, num_doc, perfiles!cuentas_comercial_id_fkey(codigo_comercial)")
    .is("fusionada_en", null)
    .or(`razon_social.ilike.${patron},num_doc.ilike.${patron}`)
    .order("razon_social")
    .limit(12);
  return ((data ?? []) as unknown as { id: string; razon_social: string; num_doc: string | null; perfiles: { codigo_comercial: string | null } | null }[]).map((c) => ({
    id: c.id,
    razonSocial: c.razon_social,
    documento: c.num_doc,
    cartera: c.perfiles?.codigo_comercial ?? null,
  }));
}

async function llamar(fn: string, args: Record<string, unknown>) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/files");
  return { error: null };
}

/** De qué empresa del grupo es el archivador que se pide (0341). */
export type EmpresaFile = "open" | "efameinsa" | "ambos";

/** Cada cliente con su empresa, en el mismo orden. */
export async function solicitarFiles(pedidos: { cuenta: string; empresa: EmpresaFile }[], nota: string | null) {
  return llamar("files_solicitar", { p_cuentas: pedidos.map((p) => p.cuenta), p_nota: nota, p_empresas: pedidos.map((p) => p.empresa) });
}
export async function entregarFile(id: string) {
  return llamar("files_entregar", { p_id: id });
}
export async function confirmarFileRecibido(id: string) {
  return llamar("files_confirmar_recibido", { p_id: id });
}
export async function devolverFile(id: string) {
  return llamar("files_devolver", { p_id: id });
}
export async function anularPedidoFile(id: string, motivo: string | null) {
  return llamar("files_anular", { p_id: id, p_motivo: motivo });
}
/**
 * «Terminé, pueden recogerlo» (0350): avisa a Central que ya puede pasar por
 * el file. Con `todoElPedido`, marca todos los del mismo pedido que tenga en
 * su poder con un solo aviso. Pasados 30 minutos, la misma llamada es el
 * «Recordar a Central».
 */
export async function termineConElFile(id: string, todoElPedido: boolean) {
  return llamar("files_termine", { p_id: id, p_todo_el_pedido: todoElPedido });
}

/**
 * ENTREGA DIRECTA (0365). Carlos, reunión 01-10 11:05: al generar el pedido,
 * Central «agarra el expediente y físicamente se lo lleva a postventa… pero
 * esa entrega no está registrada… yo te entrego porque hemos generado un
 * pedido. Entonces no sé si lo enlazamos». Central lo registra sin que nadie
 * lo haya pedido; quien lo recibe firma «Recibí el file» y sigue el circuito
 * de siempre. Con `pedido`, queda enlazado al pedido recién generado.
 */
export async function entregarFileDirecto(datos: { cuenta: string; a: string; empresa: EmpresaFile; pedido?: string | null; nota?: string | null }) {
  const r = await llamar("files_entregar_directo", {
    p_cuenta: datos.cuenta,
    p_a: datos.a,
    p_empresa: datos.empresa,
    p_pedido: datos.pedido ?? null,
    p_nota: datos.nota?.trim() || null,
  });
  if (!r.error) revalidatePath("/central/cierres");
  return r;
}

export interface PersonaParaFile {
  id: string;
  nombre: string;
  codigo: string | null;
  postventa: boolean;
}

/**
 * A quién se le puede entregar el file: las personas activas del mismo mundo
 * (real o práctica) que quien entrega; postventa primero. `sugerida` es quien
 * tiene ese pedido en postventa o, si todavía nadie lo tomó, quien atendió el
 * último pedido de ese cliente en postventa.
 */
export async function personasParaRecibirFile(opciones: { servicioId?: string | null; cuentaId?: string | null } = {}): Promise<{
  personas: PersonaParaFile[];
  sugerida: string | null;
}> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial, es_postventa, es_prueba")
    .eq("activo", true)
    .neq("id", perfil.id)
    .order("nombre");
  const personas = ((data ?? []) as { id: string; nombre: string; codigo_comercial: string | null; es_postventa: boolean | null; es_prueba: boolean | null }[])
    .filter((p) => Boolean(p.es_prueba) === Boolean(perfil.es_prueba))
    .map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo_comercial, postventa: Boolean(p.es_postventa) }))
    .sort((a, b) => Number(b.postventa) - Number(a.postventa) || a.nombre.localeCompare(b.nombre, "es"));
  const dePostventa = new Set(personas.filter((p) => p.postventa).map((p) => p.id));

  let sugerida: string | null = null;
  if (opciones.servicioId) {
    const { data: s } = await supabase.from("servicios_postventa").select("responsable_id").eq("id", opciones.servicioId).maybeSingle();
    if (s?.responsable_id && dePostventa.has(s.responsable_id as string)) sugerida = s.responsable_id as string;
  }
  if (!sugerida && opciones.cuentaId) {
    const { data: previos } = await supabase
      .from("servicios_postventa")
      .select("responsable_id")
      .eq("cuenta_id", opciones.cuentaId)
      .not("responsable_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    sugerida = ((previos ?? []) as { responsable_id: string }[]).map((p) => p.responsable_id).find((id) => dePostventa.has(id)) ?? null;
  }
  return { personas, sugerida };
}
