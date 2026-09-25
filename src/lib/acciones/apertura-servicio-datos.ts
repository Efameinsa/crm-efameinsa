import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaHoraLima } from "@/lib/fechas";
import { createAdminClient } from "@/lib/supabase/admin";
import { esProvincia, puedeVerPrecios, seriesDeTexto, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { faltantesApertura, filasApertura, horaAmPm, tipoSugerido, type DatosApertura, type FilaApertura, type TipoApertura } from "@/lib/apertura-servicio";

/**
 * Todo lo que necesita la hoja de la apertura de servicio, en un solo lugar.
 *
 * Antes vivía duplicado en la página (HTML, para imprimir) y hubiera vuelto a
 * duplicarse en el PDF descargable (ítem 8 de la reunión del 22-09): mismos
 * datos, dos maquetaciones. Un cambio en cómo se arma el equipo o la
 * dirección solo se hace acá.
 */
export interface DatosHojaApertura {
  servicio: ServicioPostventa;
  informe: {
    codigo: string | null;
    orden_compra: string | null;
  } | null;
  empresaLarga: string;
  emitidoPor: string | null;
  d: DatosApertura;
  filas: FilaApertura[];
  faltantes: string[];
  condiciones: { texto: string; ok: boolean; detalle: string }[];
  avisoPreinstalacion: string | null;
}

export async function cargarHojaApertura(
  supabase: SupabaseClient,
  servicioId: string,
  perfil: { rol: string; es_postventa?: boolean | null },
): Promise<DatosHojaApertura | null> {
  const { data } = await supabase.from("servicios_postventa").select("*").eq("id", servicioId).single();
  if (!data) return null;
  const crudo = data as unknown as ServicioPostventa;
  const s = puedeVerPrecios(perfil) ? crudo : sinPrecios(crudo);

  // LA EMPRESA DEL CIERRE, AUNQUE QUIEN MIRA NO LEA CIERRES (25-09). El
  // almacén no tiene permiso sobre informes_cierre: la consulta volvía vacía y
  // la hoja de un pedido Open salía como «CORPORACIÓN EFAMEINSA». Estos
  // campos no llevan precios (el pedido ya viene filtrado por puedeVerPrecios)
  // y quien llegó hasta acá ya lee el pedido: se leen con el cliente del
  // servidor.
  const lectorInforme = createAdminClient();
  const [{ data: informe }, { data: cuenta }, { data: perfiles }] = await Promise.all([
    s.informe_cierre_id
      ? lectorInforme
          .from("informes_cierre")
          .select("codigo, serie, cliente_nombre, cliente_doc, orden_compra, entrega_direccion, contacto_despacho, modalidad_pago")
          .eq("id", s.informe_cierre_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    s.cuenta_id
      ? supabase.from("cuentas").select("razon_social, num_doc").eq("id", s.cuenta_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("perfiles")
      .select("id, nombre")
      .in(
        "id",
        [
          s.apertura_despacho_por,
          (s as { pago_confirmado_por?: string | null }).pago_confirmado_por,
          (s as { prueba_lista_por?: string | null }).prueba_lista_por,
        ].filter((x): x is string => !!x),
      ),
  ]);
  const nombreDe = (pid: string | null | undefined) => (perfiles ?? []).find((p) => p.id === pid)?.nombre ?? null;

  const esOpen = informe?.serie === "OPEN";
  const empresaCorta = esOpen ? "OPEN INVESTMENTS" : "CORPORACION EFAMEINSA";
  const empresaLarga = esOpen ? "OPEN INVESTMENTS S.A.C." : "CORPORACIÓN EFAMEINSA S.A.";

  const contacto = (informe?.contacto_despacho ?? null) as { nombre?: string; telefono?: string } | null;
  const { data: equiposLista } = await supabase
    .from("pedido_equipos")
    .select("orden, descripcion, serie, en_este_despacho")
    .eq("servicio_id", s.id)
    .order("orden");
  const queVan = (equiposLista ?? []).filter((e) => e.en_este_despacho);
  const equipoTexto = queVan.length > 0 ? queVan.map((e) => e.descripcion.trim()).join("\n\n") : (s.equipo ?? null);
  const seriesLista = queVan.map((e) => e.serie).filter((x): x is string => Boolean(x));
  const series = seriesLista.length > 0 ? seriesLista : seriesDeTexto(s.equipo);
  const serieAparte = seriesLista.length === 0 && /serie/i.test(s.equipo ?? "") ? null : series.join(" · ") || null;

  const tipo = ((s.apertura_tipo as TipoApertura | null) ?? tipoSugerido(s)) as TipoApertura;

  const d: DatosApertura = {
    tipo,
    empresa: empresaCorta,
    cliente: cuenta?.razon_social ?? informe?.cliente_nombre ?? s.cliente_texto ?? "Cliente sin nombre",
    ruc: cuenta?.num_doc ?? informe?.cliente_doc ?? null,
    equipo: equipoTexto,
    serie: serieAparte,
    nota: s.apertura_nota ?? null,
    direccion: s.direccion_entrega ?? informe?.entrega_direccion ?? s.ubicacion ?? null,
    direccionFinal: s.direccion_final ?? null,
    entregaModo: s.entrega_modo ?? null,
    agenciaDestino: s.agencia_destino ?? null,
    fecha: s.apertura_fecha ?? s.fecha_despacho ?? null,
    hora: horaAmPm(s.apertura_hora),
    recibeNombre: s.recibe_nombre ?? contacto?.nombre ?? null,
    recibeDoc: s.recibe_doc ?? null,
    recibeTelefono: s.recibe_telefono ?? contacto?.telefono ?? null,
    tecnico: s.tecnico_asignado ?? null,
    transporte: s.transporte ?? s.transportista ?? null,
  };

  const filas = filasApertura(d);
  const faltantes = faltantesApertura(d);

  const condiciones = [
    {
      texto: "Finanzas confirmó el pago",
      ok: s.pago_confirmado_at != null,
      detalle: s.pago_confirmado_at
        ? `${fechaHoraLima(s.pago_confirmado_at)}${s.pago_confirmado_detalle ? ` · ${s.pago_confirmado_detalle}` : ""}`
        : s.despacho_sin_cancelar_motivo
          ? `Despacho con saldo autorizado: ${s.despacho_sin_cancelar_motivo}`
          : "Pendiente",
    },
    {
      texto: "Dirección y quién recibe, verificados con el cliente",
      ok: s.direccion_verificada_at != null,
      detalle: s.direccion_verificada_at
        ? `${fechaHoraLima(s.direccion_verificada_at)}${s.direccion_verificada_con ? ` · confirmó ${s.direccion_verificada_con}` : ""}`
        : "Pendiente",
    },
    {
      texto: "Equipo probado y embalado",
      ok: s.prueba_lista_at != null || /^(si|sí|ok|listo|x)$/i.test((s.prueba_embalaje ?? "").trim()),
      detalle: s.prueba_lista_at
        ? `${fechaHoraLima(s.prueba_lista_at)}${nombreDe((s as { prueba_lista_por?: string | null }).prueba_lista_por) ? ` · ${nombreDe((s as { prueba_lista_por?: string | null }).prueba_lista_por)}` : ""}${s.protocolo_prueba_ref ? ` · protocolo ${s.protocolo_prueba_ref}` : ""}`
        : /^(si|sí|ok|listo|x)$/i.test((s.prueba_embalaje ?? "").trim())
          ? "Marcado en el Excel"
          : "Pendiente",
    },
    {
      texto: "Plano de preinstalación enviado",
      ok: s.plano_enviado_at != null || /^(si|sí|ok|listo|x)$/i.test((s.planos_preinstalacion ?? "").trim()),
      detalle: s.plano_enviado_at
        ? fechaHoraLima(s.plano_enviado_at)
        : /^(si|sí|ok|listo|x)$/i.test((s.planos_preinstalacion ?? "").trim())
          ? "Marcado en el Excel"
          : "Pendiente",
    },
  ];
  const avisoPreinstalacion =
    esProvincia(s) && s.preinstalacion_ok_at == null
      ? "Es provincia y el cliente todavía no confirmó la preinstalación (agua, desagüe y energía)."
      : null;

  return {
    servicio: s,
    informe: informe ? { codigo: informe.codigo, orden_compra: informe.orden_compra } : null,
    empresaLarga,
    emitidoPor: nombreDe(s.apertura_despacho_por),
    d,
    filas,
    faltantes,
    condiciones,
    avisoPreinstalacion,
  };
}
