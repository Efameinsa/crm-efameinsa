"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarFinanzas } from "@/lib/notificaciones";
import { avisarFinanzasSiFaltaVistoBueno } from "@/lib/aviso-visto-bueno";
import type { FotoAlmacen } from "@/lib/postventa";
import type { Chequeo } from "@/lib/protocolo-checklist";
import { esAccesorioDelPedido, faltaParaProbar, type MaquinaParaProbar } from "@/lib/protocolo-completo";

/**
 * Lo que el almacén marca del pedido (0246), en el orden en que pasa:
 * probado y embalado (con el protocolo) → listo para el despacho programado
 * → la salida (5 fotos y video) → la guía en la agencia. Cada paso avisa a
 * postventa, que es quien sigue el circuito; el doble check final es suyo.
 *
 * Todas las reglas viven en la base (quién puede, qué falta): acá solo se
 * pide y se traduce la respuesta.
 */
const limpiar = (e: string) => e.replace(/^[A-Z0-9]{5}:\s*/, "");

function ok(servicioId: string) {
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath("/almacen");
  revalidatePath("/almacen/pedidos");
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/control");
  return { error: null as string | null };
}

type Foto = FotoAlmacen;

/** Avisa a toda el área de postventa (sin las cuentas de práctica, salvo que quien avisa sea de práctica). */
async function avisarPostventa(titulo: string, cuerpo: string, url: string) {
  const supabase = await createClient();
  const perfil = await requerirPerfil();
  const { data } = await supabase
    .from("perfiles")
    .select("id")
    .eq("es_postventa", true)
    .eq("activo", true)
    // La cuenta que solo vende preventivo no abre pedidos (layout de
    // postventa): el aviso la rebotaba (auditoría de avisos, 25-09).
    .eq("solo_preventivo", false)
    .is("espejo_de", null)
    .eq("es_prueba", perfil.es_prueba === true);
  await Promise.all((data ?? []).map((p) => notificar({ userId: p.id, tipo: "almacen", titulo, cuerpo, url })));
}

export async function marcarProbado(servicioId: string, datos: { protocoloRef?: string; fotos?: Foto[]; nota?: string; cliente: string }) {
  const supabase = await createClient();
  // El pedido sin lista de máquinas tampoco se marca sin protocolo ni fotos
  // (Santos, 13-10); el repuesto no se prueba, pero lleva su foto.
  const { data: s } = await supabase.from("servicios_postventa").select("tipo_pedido").eq("id", servicioId).maybeSingle();
  const repuesto = ["repuesto", "accesorio", "embalaje"].includes(s?.tipo_pedido ?? "");
  const falta = [!(datos.fotos ?? []).length && (repuesto ? "la foto" : "el protocolo o las fotos de la prueba")].filter(Boolean);
  if (falta.length > 0) return { error: `Todavía no se puede marcar ${repuesto ? "preparado" : "probado"} y embalado. Falta: ${falta.join(" y ")}.` };
  const { error } = await supabase.rpc("almacen_marcar_probado", {
    p_servicio: servicioId,
    p_protocolo_ref: datos.protocoloRef?.trim() || null,
    p_fotos: datos.fotos ?? [],
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Probado y embalado · ${datos.cliente}`,
    `El almacén ya probó y embaló el equipo${datos.protocoloRef ? ` (protocolo ${datos.protocoloRef})` : ""}. Se puede programar el despacho.`,
    `/postventa/pedidos/${servicioId}`,
  );
  await avisarFinanzasSiFaltaVistoBueno(servicioId, "listo");
  return ok(servicioId);
}

/**
 * Una máquina probada, con su protocolo (0260). Cuando con esta ya están
 * todas las que van en el despacho, el pedido queda probado y embalado y
 * postventa se entera; si faltan, solo se guarda.
 */
export async function probarEquipoDelPedido(
  itemId: string,
  servicioId: string,
  datos: {
    protocoloRef?: string;
    fotos?: Foto[];
    nota?: string;
    cliente: string;
    equipo: string;
    /** La otra máquina de la torre (0389, Lesly 03-10): su protocolo, sus fotos y su informe. */
    partes?: { id: string; protocoloRef?: string; fotos?: Foto[] }[];
    /** El día en que de verdad se hizo el protocolo (0416); vacío = hoy. */
    fecha?: string | null;
  },
): Promise<{ error: string | null; pedidoListo?: boolean }> {
  const supabase = await createClient();
  // Sin el protocolo completo no se marca (Santos, 13-10, COFACO): la ficha,
  // las fotos, el PDF y la hoja de chequeo de cada máquina de la unidad.
  const columnas = "id, descripcion, serie, sin_serie, parte_nombre, protocolo_ref, protocolo_fotos, protocolo_datos, protocolo_chequeo";
  const [{ data: item }, { data: partes }, { data: servicio }, { data: filas }] = await Promise.all([
    supabase.from("pedido_equipos").select(columnas).eq("id", itemId).maybeSingle(),
    supabase.from("pedido_equipos").select(columnas).eq("parte_de", itemId).order("orden"),
    supabase.from("servicios_postventa").select("tipo_pedido").eq("id", servicioId).maybeSingle(),
    supabase.from("pedido_equipos").select("id, descripcion").eq("servicio_id", servicioId).is("parte_de", null),
  ]);
  if (!item) return { error: "Ese equipo no está en el pedido" };
  const falta = faltaParaProbar(item as MaquinaParaProbar, (partes ?? []) as MaquinaParaProbar[], {
    repuesto: servicio?.tipo_pedido === "repuesto",
    // El accesorio de la máquina principal solo pide fotos (Almacén, 21-10, VITALIAN).
    accesorio: esAccesorioDelPedido(item as MaquinaParaProbar, (filas ?? []) as MaquinaParaProbar[]),
    clic: {
      protocoloRef: datos.protocoloRef,
      principal: datos.fotos ?? [],
      partes: Object.fromEntries((datos.partes ?? []).map((p) => [p.id, p.fotos ?? []])),
    },
  });
  if (falta.length > 0) {
    return { error: `Todavía no se puede marcar probada y embalada. Falta: ${falta.join(" · ")}. Lo de la ficha y la hoja de chequeo se llena en «Ver el informe de prueba y embalaje».` };
  }
  const { data, error } = await supabase.rpc("almacen_probar_equipo", {
    p_item: itemId,
    p_protocolo_ref: datos.protocoloRef?.trim() || null,
    p_fotos: datos.fotos ?? [],
    p_nota: datos.nota?.trim() || null,
    p_partes: (datos.partes ?? []).map((p) => ({ id: p.id, protocolo_ref: p.protocoloRef?.trim() || null, fotos: p.fotos ?? [] })),
  });
  if (error) return { error: limpiar(error.message) };
  if (datos.fecha) {
    for (const id of [itemId, ...(datos.partes ?? []).map((p) => p.id)]) {
      const r = await supabase.rpc("fecha_del_protocolo", { p_item: id, p_fecha: datos.fecha });
      if (r.error) return { error: `Quedó probada, pero no se guardó la fecha: ${limpiar(r.error.message)}` };
    }
  }
  const pedidoListo = data === true;
  if (pedidoListo) {
    await avisarPostventa(
      `Probado y embalado · ${datos.cliente}`,
      `El almacén ya probó y embaló todo lo que va en este despacho${datos.protocoloRef ? ` (último protocolo ${datos.protocoloRef})` : ""}. Se puede programar el despacho.`,
      `/postventa/pedidos/${servicioId}`,
    );
    await avisarFinanzasSiFaltaVistoBueno(servicioId, "listo");
  }
  return { ...ok(servicioId), pedidoListo };
}

/**
 * EL KIT COMPLETO DE UNA VEZ (0517; Ariana, almacén, 16-10, LINO ESPIRITU
 * PED-0032-2026: «que el protocolo salga como kit completo y no como foto
 * detallada de cada repuesto»). En un pedido de repuestos las piezas se
 * prueban y embalan juntas: unas fotos del kit y un técnico marcan todas las
 * que van en este despacho. Lo subido con el clic queda en la primera pieza.
 */
export async function probarKitDelPedido(
  servicioId: string,
  datos: { protocoloRef?: string; fotos?: Foto[]; nota?: string; cliente: string; fecha?: string | null },
): Promise<{ error: string | null; pedidoListo?: boolean }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("almacen_probar_kit", {
    p_servicio: servicioId,
    p_protocolo_ref: datos.protocoloRef?.trim() || null,
    p_fotos: datos.fotos ?? [],
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  if (datos.fecha) {
    const { data: piezas } = await supabase.from("pedido_equipos").select("id").eq("servicio_id", servicioId).is("parte_de", null);
    for (const p of piezas ?? []) {
      const r = await supabase.rpc("fecha_del_protocolo", { p_item: p.id, p_fecha: datos.fecha });
      if (r.error) return { error: `Quedó probado, pero no se guardó la fecha: ${limpiar(r.error.message)}` };
    }
  }
  const pedidoListo = data === true;
  if (pedidoListo) {
    await avisarPostventa(
      `Probado y embalado · ${datos.cliente}`,
      `El almacén ya probó y embaló el kit completo de repuestos${datos.protocoloRef ? ` (protocolo ${datos.protocoloRef})` : ""}. Se puede programar el despacho.`,
      `/postventa/pedidos/${servicioId}`,
    );
    await avisarFinanzasSiFaltaVistoBueno(servicioId, "listo");
  }
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  return { ...ok(servicioId), pedidoListo };
}

export async function confirmarListo(servicioId: string, datos: { nota?: string; cliente: string; fecha: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_confirmar_listo", { p_servicio: servicioId, p_nota: datos.nota?.trim() || null });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Almacén listo para despachar · ${datos.cliente}`,
    `${datos.fecha ? `Para el ${datos.fecha}. ` : ""}${datos.nota?.trim() ?? ""}`.trim() || "Almacén confirmó que el despacho programado está listo.",
    `/postventa/pedidos/${servicioId}`,
  );
  return ok(servicioId);
}

/**
 * LA SALIDA CON SALDO PENDIENTE SE AUTORIZA (0297; Santos, 24-09: «no debería
 * poder hasta que alguien autorice la salida de la máquina cuando aún hay un
 * saldo pendiente»). Con el código de gerencia u operaciones y el motivo;
 * postventa se entera.
 */
export async function autorizarSalidaConSaldo(servicioId: string, pin: string, motivo: string, cliente: string) {
  await requerirPerfil();
  if (motivo.trim().length < 5) return { error: "Diga por qué sale con saldo pendiente" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("autorizar_salida_con_saldo", { p_servicio: servicioId, p_pin: pin, p_motivo: motivo.trim() });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Salida autorizada con saldo · ${cliente}`,
    `Se autorizó con código que la máquina salga del almacén con saldo pendiente: ${motivo.trim()}.`,
    `/postventa/pedidos/${servicioId}`,
  );
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * Sumar fotos y documentos a una máquina del pedido, también después de
 * probada (0297; Santos, 24-09: «almacén tendría que ingresar un informe por
 * cada equipo… subir varias fotos y varios PDF por serie»).
 */
export async function agregarArchivosDelEquipo(itemId: string, servicioId: string, archivos: FotoAlmacen[]) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("agregar_archivos_del_equipo", { p_item: itemId, p_archivos: archivos });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * Quitar una foto o documento subido por error a la máquina (0504; Ariana,
 * 15-10, OPEN 060-2026). Si ya está probada y embalada pide el código (0450).
 */
export async function quitarArchivoDelEquipo(itemId: string, servicioId: string, path: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_archivo_del_equipo", { p_item: itemId, p_path: path });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  return { error: null };
}

/**
 * LA FECHA REAL DEL PROTOCOLO (0416; Ariana, 07-10: «colocar la fecha en la que
 * realmente se efectuó, especialmente cuando el protocolo fue realizado
 * anteriormente al registro en el CRM»). Se corrige desde el informe.
 */
export async function fechaDelProtocolo(itemId: string, servicioId: string, fecha: string | null) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fecha_del_protocolo", { p_item: itemId, p_fecha: fecha || null });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * LOS DATOS DE LA HOJA DE PROTOCOLO DE CADA MÁQUINA (0417; Ariana, 07-10: el
 * informe como el modelo): equipo y capacidad, modelo de placa, serie,
 * técnico a cargo, quién lo elaboró y las fechas. «secadora» es la de una
 * torre sin renglón propio.
 */
export async function datosDelProtocolo(
  itemId: string,
  servicioId: string,
  maquina: "principal" | "secadora",
  datos: Record<string, string>,
) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("datos_del_protocolo", { p_item: itemId, p_maquina: maquina, p_datos: datos });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * LA HOJA DE CHEQUEO DEL PROTOCOLO (0452; Ariana, 13-10: el papel «PROTOCOLO
 * DE LAVADORA» con casillas para marcar desde la tablet). Va al final del
 * informe de la máquina.
 */
export async function chequeoDelProtocolo(itemId: string, servicioId: string, maquina: "principal" | "secadora", chequeo: Chequeo) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("chequeo_del_protocolo", { p_item: itemId, p_maquina: maquina, p_chequeo: chequeo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  return { error: null };
}

/**
 * EL PROTOCOLO GUARDADO SE CORRIGE CON CÓDIGO (0450; Ariana, 13-10: «el
 * sistema deberá solicitar un PIN de autorización proporcionado por Lesly»).
 * Con el código de operaciones y el motivo, el informe del pedido queda
 * abierto 30 minutos.
 */
export async function abrirProtocoloConCodigo(servicioId: string, pin: string, motivo: string) {
  await requerirPerfil();
  if (motivo.trim().length < 5) return { error: "Diga qué hay que corregir" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_protocolo_con_codigo", { p_servicio: servicioId, p_pin: pin, p_motivo: motivo.trim() });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * EL TÉCNICO Y LA FECHA DE LA PRUEBA AL SUBIR EL PROTOCOLO (Lesly, 09-10:
 * «técnico que realizó la prueba y fecha de prueba del equipo, ya que muchas
 * veces no es la fecha que se sube el protocolo o se ejecuta el informe»).
 * Van a la hoja de cada máquina (0417) sin pisar lo demás que ya tenga.
 */
export async function tecnicoYFechaDeLaPrueba(
  servicioId: string,
  maquinas: { id: string; maquina: "principal" | "secadora" }[],
  datos: { tecnico: string; fecha: string },
) {
  const tecnico = datos.tecnico.trim();
  const fecha = datos.fecha.trim();
  if (!tecnico && !fecha) return { error: null };
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedido_equipos")
    .select("id, protocolo_datos")
    .in("id", [...new Set(maquinas.map((m) => m.id))]);
  const guardados = new Map((data ?? []).map((x) => [x.id as string, (x.protocolo_datos ?? {}) as Record<string, Record<string, string>>]));
  for (const m of maquinas) {
    const antes = guardados.get(m.id)?.[m.maquina] ?? {};
    const nuevos = { ...antes, ...(tecnico ? { tecnico } : {}), ...(fecha ? { fecha_ejecucion: fecha } : {}) };
    const { error } = await supabase.rpc("datos_del_protocolo", { p_item: m.id, p_maquina: m.maquina, p_datos: nuevos });
    if (error) return { error: limpiar(error.message) };
  }
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  return { error: null };
}

export async function registrarSalida(servicioId: string, datos: { fecha: string; fotos: Foto[]; nota?: string; cliente: string }) {
  const supabase = await createClient();
  // Si postventa ya había registrado la salida (con la guía), esto solo suma
  // la evidencia de la carga: el aviso no debe decir que falta la guía cuando
  // ya está (23-09, Titan 676-26).
  const { data: antes } = await supabase
    .from("servicios_postventa")
    .select("despachado_at, guia, agencia_at, tipo_pedido")
    .eq("id", servicioId)
    .maybeSingle();
  const { error } = await supabase.rpc("almacen_registrar_salida", {
    p_servicio: servicioId,
    p_fecha: datos.fecha,
    p_fotos: datos.fotos,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  // En un servicio sale el técnico, no una máquina (Lesly, 09-10).
  if (!antes?.despachado_at && (antes?.tipo_pedido === "revision" || antes?.tipo_pedido === "mantenimiento")) {
    await avisarPostventa(
      `Salió el técnico · ${datos.cliente}`,
      `El ${datos.fecha}${datos.fotos.length ? `, con ${datos.fotos.length} foto${datos.fotos.length === 1 ? "" : "s"} de lo que lleva` : ""}. El servicio se cierra con el informe del técnico.`,
      `/postventa/pedidos/${servicioId}`,
    );
  } else if (antes?.despachado_at) {
    await avisarPostventa(
      `Fotos de la carga · ${datos.cliente}`,
      `El almacén subió ${datos.fotos.length} fotos/video de la máquina cargada en el transporte${antes.guia ? ` (guía ${antes.guia})` : ""}.`,
      `/postventa/pedidos/${servicioId}`,
    );
  } else {
    await avisarPostventa(
      `Salió del almacén · ${datos.cliente}`,
      `El ${datos.fecha}, con ${datos.fotos.length} fotos/video. Falta la guía de la agencia y su doble check.`,
      `/postventa/pedidos/${servicioId}`,
    );
  }
  return ok(servicioId);
}

export async function registrarAgencia(
  servicioId: string,
  datos: { transportista?: string; guia: string; fotos: Foto[]; recibe?: string; cliente: string; enCliente?: boolean; enPlanta?: boolean },
) {
  const supabase = await createClient();
  // En Lima se entrega en la casa o el local del cliente, sin agencia (Lesly, 10-10).
  // O lo recoge el cliente en nuestras instalaciones con su transporte (Ariana, 10-10; 0434).
  const transportista = datos.transportista?.trim() || (datos.enPlanta ? "Transporte del cliente" : datos.enCliente ? "Entrega directa al cliente" : "");
  const { error } = await supabase.rpc("almacen_registrar_agencia", {
    p_servicio: servicioId,
    p_transportista: transportista || null,
    p_guia: datos.guia.trim(),
    p_fotos: datos.fotos,
    p_recibe: datos.recibe?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    datos.enPlanta ? `Recogido en nuestras instalaciones · ${datos.cliente}` : datos.enCliente ? `Entregado en el local del cliente · ${datos.cliente}` : `Entregado en agencia · ${datos.cliente}`,
    datos.enCliente
      ? `${transportista} · guía ${datos.guia}${datos.recibe?.trim() ? ` · recibió ${datos.recibe.trim()}` : ""}, con ${datos.fotos.length} fotos. Verifique la entrega.`
      : `${transportista ? `${transportista} · ` : ""}guía ${datos.guia}. Verifique el envío y mándele la guía al cliente.`,
    `/postventa/pedidos/${servicioId}`,
  );
  return ok(servicioId);
}

/**
 * Corregir la entrega ya registrada (0538, buzón del almacén 19-10): agencia,
 * N.º de guía, quién recibió y las fotos (cada foto nueva reemplaza a la de su
 * mismo tipo). Postventa recibe el aviso con la guía anterior y la nueva.
 */
export async function corregirAgencia(
  servicioId: string,
  datos: { transportista?: string; guia: string; guiaAnterior: string | null; fotos: Foto[]; recibe?: string; cliente: string },
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_corregir_agencia", {
    p_servicio: servicioId,
    p_transportista: datos.transportista?.trim() || null,
    p_guia: datos.guia.trim(),
    p_fotos: datos.fotos,
    p_recibe: datos.recibe?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  const guia = datos.guia.trim();
  const cambios = [
    datos.guiaAnterior && datos.guiaAnterior !== guia ? `guía ${datos.guiaAnterior} → ${guia}` : `guía ${guia}`,
    datos.fotos.length ? `${datos.fotos.length} ${datos.fotos.length === 1 ? "foto nueva" : "fotos nuevas"}` : "",
  ].filter(Boolean);
  await avisarPostventa(`El almacén corrigió la entrega · ${datos.cliente}`, `${cambios.join(" · ")}. Revise la entrega.`, `/postventa/pedidos/${servicioId}`);
  return ok(servicioId);
}

/** El doble check de postventa (0246). */
export async function verificarDespacho(servicioId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verificar_despacho", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  return ok(servicioId);
}

// ── Los informes del almacén (0252) ──────────────────────────────────────

/** El check que sube el informe a postventa: avisa a cada persona del área y deja la marca. */
export async function elevarInformeAPostventa(informeId: string): Promise<{ error: string | null; avisados?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("elevar_informe_a_postventa", { p_informe: informeId });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/almacen/informes");
  revalidatePath("/almacen");
  revalidatePath("/postventa/informes");
  revalidatePath(`/postventa/informes/${informeId}`);
  return { error: null, avisados: Number((data as { avisados?: number } | null)?.avisados ?? 0) };
}

export interface PedidoParaInforme {
  id: string;
  cliente: string;
  equipo: string | null;
  fecha: string | null;
  cuentaId: string | null;
}
export interface AtencionParaInforme {
  id: string;
  cliente: string;
  tipo: string;
  equipo: string | null;
  cuentaId: string | null;
  equipoId: string | null;
}

/** De qué puede ser el informe: los pedidos despachados o por despachar (puesta en marcha) y las atenciones abiertas (soporte, mtto en planta). */
export async function deQuePuedeSerElInforme(): Promise<{ pedidos: PedidoParaInforme[]; atenciones: AtencionParaInforme[] }> {
  const supabase = await createClient();
  const [{ data: pedidos }, { data: atenciones }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, fecha_despacho, despachado_at, cuenta_id")
      .eq("completado", false)
      .is("cerrado_at", null)
      .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
      .order("despachado_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("atenciones")
      .select("id, tipo, cliente_texto, equipo_texto, cuenta_id, equipo_id, cuentas(razon_social)")
      .is("cerrado_at", null)
      .order("solicitado_at", { ascending: false })
      .limit(200),
  ]);
  const limpiarCliente = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
  return {
    pedidos: (pedidos ?? []).map((p) => ({ id: p.id, cliente: limpiarCliente(p.cliente_texto), equipo: p.equipo, fecha: (p.despachado_at ?? p.fecha_despacho ?? null) as string | null, cuentaId: p.cuenta_id })),
    atenciones: ((atenciones ?? []) as unknown as { id: string; tipo: string; cliente_texto: string | null; equipo_texto: string | null; cuenta_id: string | null; equipo_id: string | null; cuentas: { razon_social: string } | null }[]).map((a) => ({
      id: a.id,
      cliente: a.cuentas?.razon_social ?? limpiarCliente(a.cliente_texto),
      tipo: a.tipo,
      equipo: a.equipo_texto,
      cuentaId: a.cuenta_id,
      equipoId: a.equipo_id,
    })),
  };
}

/**
 * LAS LETRAS QUE VIAJAN CON EL EQUIPO (0470). Primero el almacén confirma que
 * las tiene (sin eso no se registra la salida); después, quien las entrega
 * dice a quién. Finanzas y postventa se enteran de cada paso.
 */
export async function recibiLetras(servicioId: string, cliente: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_recibio_letras", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  const perfil = await requerirPerfil();
  await notificarFinanzas({
    titulo: `El almacén recogió las letras · ${cliente}`,
    cuerpo: "Las letras de crédito ya están con el almacén y van con el equipo.",
    url: `/finanzas/pedidos/${servicioId}`,
    esPrueba: perfil.es_prueba === true,
  });
  return ok(servicioId);
}

export async function entregarLetras(servicioId: string, datos: { recibio: string; fotos: Foto[]; nota?: string; cliente: string }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("letras_entregadas_al_cliente", {
    p_servicio: servicioId,
    p_recibio: datos.recibio.trim(),
    p_fotos: datos.fotos,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  const perfil = await requerirPerfil();
  const cuerpo = `Las recibió ${datos.recibio.trim()}${datos.fotos.length ? ", con foto del cargo" : ""}. Postventa: ya puede verificar el despacho.`;
  await Promise.all([
    notificarFinanzas({ titulo: `Letras entregadas al cliente · ${datos.cliente}`, cuerpo, url: `/finanzas/pedidos/${servicioId}`, esPrueba: perfil.es_prueba === true }),
    avisarPostventa(`Letras entregadas al cliente · ${datos.cliente}`, cuerpo, `/postventa/pedidos/${servicioId}`),
  ]);
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath("/finanzas");
  return ok(servicioId);
}
