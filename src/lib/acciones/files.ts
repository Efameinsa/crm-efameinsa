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
