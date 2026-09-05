import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { fechaHoraLima } from "@/lib/fechas";
import { esProvincia, puedeVerPrecios, seriesDeTexto, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import {
  asuntoApertura,
  cuerpoApertura,
  faltantesApertura,
  filasApertura,
  horaAmPm,
  tipoSugerido,
  type DatosApertura,
  type TipoApertura,
} from "@/lib/apertura-servicio";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { AperturaServicioPanel } from "@/components/crm/apertura-servicio-panel";

export const dynamic = "force-dynamic";

/**
 * LA APERTURA DE SERVICIO — el documento con el que se cierra la coordinación.
 *
 * Lesly, 05-09: «una vez que postventa hace todos los pasos —confirmación de
 * finanzas, prueba de embalaje, coordinar con el cliente— y llena datos como
 * dirección a dónde llega, con qué agencia, la persona que recibe, teléfono y
 * DNI, todo eso va plasmado en una apertura de servicio (…) aquí se tienen los
 * tres formatos y todo se debe llenar en automático con todos los datos que ya
 * se tienen».
 *
 * Y Carlos, 01-09, sobre el mismo papel visto desde almacén: «yo le digo al
 * almacén: acá está la apertura, y con eso sí o sí tengo que ejecutar mi
 * despacho. No tiene que preguntar a nadie, porque para llegar ahí la
 * condicional es: Finanzas aprobó, check; corroboraste tu dirección, check;
 * pedido embalado, check; plano, check.»
 *
 * Son las dos caras de lo mismo, así que van en una sola hoja: arriba el
 * formato oficial de las nueve filas —el que sale por correo al equipo— y
 * abajo las condiciones verificadas, que es lo que le da autoridad al papel
 * frente a almacén.
 *
 * Es imprimible (Ctrl+P → «Guardar como PDF»), como todos los documentos de la
 * casa. No lleva montos: es un documento de coordinación, no de venta.
 */
export default async function AperturaServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data } = await supabase.from("servicios_postventa").select("*").eq("id", id).single();
  if (!data) notFound();
  const crudo = data as unknown as ServicioPostventa;
  const s = puedeVerPrecios(perfil) ? crudo : sinPrecios(crudo);

  const [{ data: informe }, { data: cuenta }, { data: perfiles }] = await Promise.all([
    s.informe_cierre_id
      ? supabase
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
        ].filter(
          (x): x is string => !!x,
        ),
      ),
  ]);
  const nombreDe = (pid: string | null | undefined) => (perfiles ?? []).find((p) => p.id === pid)?.nombre ?? null;

  // ── Con qué se arma el formato ───────────────────────────────────────────
  const esOpen = informe?.serie === "OPEN";
  // En el asunto del correo la empresa va corta, como la escribe Lesly.
  const empresaCorta = esOpen ? "OPEN INVESTMENTS" : "CORPORACION EFAMEINSA";
  const empresaLarga = esOpen ? "OPEN INVESTMENTS S.A.C." : "CORPORACIÓN EFAMEINSA S.A.";

  const contacto = (informe?.contacto_despacho ?? null) as { nombre?: string; telefono?: string } | null;
  // La serie va en su propia línea, salvo que la descripción ya la traiga
  // escrita: las del Excel suelen venir con «SERIE: ...» adentro.
  const series = seriesDeTexto(s.equipo);
  const serieAparte = /serie/i.test(s.equipo ?? "") ? null : series.join(" · ") || null;

  const tipo = ((s.apertura_tipo as TipoApertura | null) ?? tipoSugerido(s)) as TipoApertura;

  const d: DatosApertura = {
    tipo,
    empresa: empresaCorta,
    cliente: cuenta?.razon_social ?? informe?.cliente_nombre ?? s.cliente_texto ?? "Cliente sin nombre",
    ruc: cuenta?.num_doc ?? informe?.cliente_doc ?? null,
    equipo: s.equipo ?? null,
    serie: serieAparte,
    nota: s.apertura_nota ?? null,
    direccion: s.direccion_entrega ?? informe?.entrega_direccion ?? s.ubicacion ?? null,
    direccionFinal: s.direccion_final ?? null,
    // El día del servicio: el que se coordinó para la apertura y, si todavía
    // no se puso, el despacho ya programado.
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

  // ── Lo que le da autoridad al papel frente a almacén ─────────────────────
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
        : "Marcado en el Excel",
    },
    {
      texto: "Plano de preinstalación enviado",
      ok: s.plano_enviado_at != null || /^(si|sí|ok|listo|x)$/i.test((s.planos_preinstalacion ?? "").trim()),
      detalle: s.plano_enviado_at ? fechaHoraLima(s.plano_enviado_at) : "Marcado en el Excel",
    },
    ...(esProvincia(s)
      ? [
          {
            texto: "Preinstalación confirmada por el cliente",
            ok: s.preinstalacion_ok_at != null,
            detalle: s.preinstalacion_ok_at
              ? `${fechaHoraLima(s.preinstalacion_ok_at)}${s.preinstalacion_nota ? ` · ${s.preinstalacion_nota}` : ""}`
              : "Pendiente",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <style>{`
        @media print {
          .no-imprimir { display: none !important; }
          body { background: white !important; }
          .hoja { box-shadow: none !important; border: 0 !important; margin: 0 !important; }
        }
      `}</style>

      <div className="no-imprimir flex items-center justify-between">
        <Link
          href={`/postventa/pedidos/${s.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver al pedido
        </Link>
        <BotonImprimir>
          <Printer className="size-3.5" /> Imprimir o guardar en PDF
        </BotonImprimir>
      </div>

      {!s.apertura_despacho_at && (
        <p className="no-imprimir rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Esta apertura todavía NO fue emitida: lo que sigue es una vista previa. Se emite desde la ficha del pedido
          cuando las condiciones estén cumplidas.
        </p>
      )}

      {/* ── LA HOJA ───────────────────────────────────────────────────────── */}
      <div className="hoja rounded-xl border border-border bg-white p-8 text-[13px] text-black shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b-2 border-[#7E1210] pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#7E1210]">{empresaLarga}</p>
            <h1 className="mt-1 text-xl font-bold">Apertura de servicio</h1>
            <p className="text-[11px] text-neutral-600">
              En coordinación con el Ing. Carlos, queda en agenda el siguiente servicio.
            </p>
          </div>
          <div className="text-right text-[11px]">
            <p>
              <b>Emitida:</b> {s.apertura_despacho_at ? fechaHoraLima(s.apertura_despacho_at) : "— (vista previa)"}
            </p>
            {nombreDe(s.apertura_despacho_por) && (
              <p>
                <b>Por:</b> {nombreDe(s.apertura_despacho_por)} · Postventa
              </p>
            )}
            {informe?.codigo && (
              <p>
                <b>Cierre:</b> {informe.codigo}
              </p>
            )}
            {s.numero_pedido_erp && (
              <p>
                <b>Pedido ERP:</b> {s.numero_pedido_erp}
              </p>
            )}
            {informe?.orden_compra && (
              <p>
                <b>OC:</b> {informe.orden_compra}
              </p>
            )}
          </div>
        </div>

        {/* Las nueve filas, en el orden de siempre. */}
        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className="w-8 border border-neutral-400 px-2 py-1 font-bold">N°</th>
              <th className="w-56 border border-neutral-400 px-2 py-1 font-bold">DESCRIPCIÓN</th>
              <th className="border border-neutral-400 px-2 py-1 font-bold">INFORMACIÓN</th>
              <th className="w-24 border border-neutral-400 px-2 py-1 font-bold">OBSERVACIONES</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.n} className="align-top">
                <td className="border border-neutral-400 px-2 py-1.5 text-center">{f.n}</td>
                <td className="border border-neutral-400 px-2 py-1.5 font-semibold">{f.descripcion}</td>
                <td className="whitespace-pre-line border border-neutral-400 px-2 py-1.5">{f.informacion}</td>
                <td className="border border-neutral-400 px-2 py-1.5 text-center">{f.observaciones}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 border-b border-neutral-300 pb-1 text-[11px] font-bold uppercase tracking-wide">
          Condiciones verificadas · control interno
        </h2>
        <p className="mt-1 text-[11px] text-neutral-600">
          Con este documento almacén ejecuta el despacho sin preguntar a nadie: todo lo de abajo quedó verificado en
          el sistema, con su fecha y su responsable.
        </p>
        <ul className="mt-2 space-y-1.5">
          {condiciones.map((c) => (
            <li key={c.texto} className="flex items-start gap-2">
              <span
                className={
                  "mt-0.5 flex size-4 flex-none items-center justify-center rounded-sm border text-[11px] font-bold " +
                  (c.ok ? "border-black bg-black text-white" : "border-neutral-400 text-transparent")
                }
              >
                ✓
              </span>
              <span>
                <span className="font-semibold">{c.texto}</span>
                <span className="block text-[11px] text-neutral-600">{c.detalle}</span>
              </span>
            </li>
          ))}
        </ul>

        {s.observaciones && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-[11px] font-bold uppercase tracking-wide">
              Observaciones del pedido
            </h2>
            <p className="mt-2 whitespace-pre-line">{s.observaciones}</p>
          </>
        )}

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[11px]">
          {["Postventa", "Almacén", "Transportista / recibe"].map((f) => (
            <div key={f}>
              <div className="h-12 border-b border-neutral-500" />
              <p className="mt-1 font-semibold">{f}</p>
              <p className="text-neutral-600">Nombre, fecha y hora</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── LA MESA DE TRABAJO, que no se imprime ─────────────────────────── */}
      <AperturaServicioPanel
        servicioId={s.id}
        inicial={{
          tipo,
          fecha: s.apertura_fecha ?? s.fecha_despacho ?? null,
          hora: s.apertura_hora ?? null,
          tecnico: s.tecnico_asignado ?? null,
          transporte: s.transporte ?? s.transportista ?? null,
          nota: s.apertura_nota ?? null,
          direccionFinal: s.direccion_final ?? null,
        }}
        asunto={asuntoApertura(d)}
        cuerpo={cuerpoApertura(d)}
        faltantes={faltantes}
      />
    </div>
  );
}
