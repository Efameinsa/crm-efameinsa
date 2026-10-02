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
  /** Institución con sedes bajo un mismo RUC (0158) a la que pertenece, si es el caso. */
  familia: { id: string; nombre: string } | null;
  /** Es la ficha de la institución en general, no una sede. */
  esMadre: boolean;
}

type FilaCuenta = {
  id: string;
  razon_social: string;
  num_doc: string | null;
  sedes_por_ruc: boolean;
  cuenta_padre_id: string | null;
  perfiles: { codigo_comercial: string | null } | null;
};
const COLUMNAS = "id, razon_social, num_doc, sedes_por_ruc, cuenta_padre_id, perfiles!cuentas_comercial_id_fkey(codigo_comercial)";

/**
 * Buscar clientes para pedir su file. Cualquier área pide files de cualquier
 * cliente (postventa revisa el expediente de ventas de otros), así que no se
 * limita a la cartera propia: solo devuelve nombre, documento y de quién es.
 *
 * Instituciones con sedes bajo un mismo RUC (ESSALUD, Marina de Guerra, MINSA;
 * 0158): si el texto toca a la madre o a una sede, se devuelven la madre y
 * TODAS sus sedes (antes el tope de 12 las cortaba y no se distinguían), cada
 * una con su familia para que la pantalla ofrezca «Otra sede (nueva)».
 */
export async function buscarClientesParaFile(q: string): Promise<ClienteParaFile[]> {
  await requerirPerfil();
  const texto = q.trim();
  if (texto.length < 3) return [];
  const patron = `%${texto.replace(/[%_,()]/g, " ")}%`;
  const admin = createAdminClient();
  const { data } = await admin
    .from("cuentas")
    .select(COLUMNAS)
    .is("fusionada_en", null)
    .or(`razon_social.ilike.${patron},num_doc.ilike.${patron}`)
    .order("razon_social")
    .limit(12);
  const filas = (data ?? []) as unknown as FilaCuenta[];

  // Familias: la madre marcada, o la madre de la sede encontrada.
  const candidatas = new Set<string>();
  for (const f of filas) {
    if (f.sedes_por_ruc && !f.cuenta_padre_id) candidatas.add(f.id);
    else if (f.cuenta_padre_id) candidatas.add(f.cuenta_padre_id);
  }
  const madres = new Map<string, string>();
  if (candidatas.size > 0) {
    const { data: ms } = await admin
      .from("cuentas")
      .select("id, razon_social")
      .in("id", [...candidatas])
      .eq("sedes_por_ruc", true)
      .is("cuenta_padre_id", null);
    for (const m of (ms ?? []) as { id: string; razon_social: string }[]) madres.set(m.id, m.razon_social);
  }

  const porId = new Map<string, FilaCuenta>();
  if (madres.size > 0) {
    const ids = [...madres.keys()];
    const { data: fam } = await admin
      .from("cuentas")
      .select(COLUMNAS)
      .is("fusionada_en", null)
      .or(`id.in.(${ids.join(",")}),cuenta_padre_id.in.(${ids.join(",")})`)
      .order("razon_social")
      .limit(80);
    for (const f of (fam ?? []) as unknown as FilaCuenta[]) porId.set(f.id, f);
  }
  for (const f of filas) if (!porId.has(f.id)) porId.set(f.id, f);

  const todas = [...porId.values()].map((c): ClienteParaFile => {
    const famId = madres.has(c.id) ? c.id : c.cuenta_padre_id && madres.has(c.cuenta_padre_id) ? c.cuenta_padre_id : null;
    return {
      id: c.id,
      razonSocial: c.razon_social,
      documento: c.num_doc,
      cartera: c.perfiles?.codigo_comercial ?? null,
      familia: famId ? { id: famId, nombre: madres.get(famId)! } : null,
      esMadre: madres.has(c.id),
    };
  });
  // La institución primero, sus sedes juntas, y después el resto por nombre.
  return todas.sort((x, y) => {
    const fx = x.familia?.nombre ?? x.razonSocial;
    const fy = y.familia?.nombre ?? y.razonSocial;
    return fx.localeCompare(fy, "es") || Number(y.esMadre) - Number(x.esMadre) || x.razonSocial.localeCompare(y.razonSocial, "es");
  });
}

/**
 * «Otra sede (nueva)» (0369): quien pide el file escribe el nombre de la sede
 * (hospital, posta, base) y se crea colgada de la institución, con su RUC.
 * Si ya existía con ese nombre, devuelve esa.
 */
export async function crearSedeParaFile(madreId: string, nombre: string): Promise<{ error: string | null; cliente?: ClienteParaFile }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("crear_sede_para_file", { p_madre: madreId, p_nombre: nombre });
  if (error || !id) return { error: limpiar(error?.message ?? "No se pudo crear la sede") };
  const admin = createAdminClient();
  const { data: s } = await admin.from("cuentas").select("id, razon_social, num_doc, cuenta_padre_id").eq("id", id as string).single();
  const { data: m } = await admin.from("cuentas").select("razon_social").eq("id", madreId).single();
  if (!s) return { error: "La sede se creó pero no se pudo leer" };
  return {
    error: null,
    cliente: {
      id: s.id,
      razonSocial: s.razon_social,
      documento: s.num_doc,
      cartera: null,
      familia: { id: madreId, nombre: m?.razon_social ?? "" },
      esMadre: s.id === madreId,
    },
  };
}

async function llamar(fn: string, args: Record<string, unknown>) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/files");
  return { error: null };
}

/** Un file del inventario físico de Central (0372). */
export interface FileDelInventario {
  id: string;
  empresa: "efameinsa" | "open";
  tipo: "archivador" | "file";
  nombre: string;
  /** «Estante PRIMERO · SEGUNDO CAJÓN» */
  ubicacion: string | null;
  anio: number | null;
  documento: string | null;
}

type FilaInventario = { id: string; empresa: "efameinsa" | "open"; tipo: "archivador" | "file"; nombre: string; estante: string | null; cajon: string | null; anio: number | null; documento: string | null };

/**
 * INVENTARIO DE FILES (0372). Santos, 02-10: «en la búsqueda de solicitud de
 * files, solo tenga esta data de Efameinsa y Open Investments». Se busca en
 * el inventario que Central levantó al 23-09-2026, no en las fichas del CRM:
 * cada resultado ya dice de qué empresa es y dónde está.
 */
export async function buscarInventarioFiles(q: string): Promise<FileDelInventario[]> {
  await requerirPerfil();
  const texto = q.trim();
  if (texto.length < 3) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("buscar_inventario_files", { p_q: texto });
  return ((data ?? []) as FilaInventario[]).map((f) => ({
    id: f.id,
    empresa: f.empresa,
    tipo: f.tipo,
    nombre: f.nombre,
    ubicacion: [f.estante && `Estante ${f.estante}`, f.cajon].filter(Boolean).join(" · ") || null,
    anio: f.anio,
    documento: f.documento,
  }));
}

export async function solicitarFilesDelInventario(ids: string[], nota: string | null) {
  return llamar("files_solicitar_inventario", { p_items: ids, p_nota: nota });
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
