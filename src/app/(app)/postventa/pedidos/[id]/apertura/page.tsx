import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { fechaHoraLima, fechaCalendario } from "@/lib/fechas";
import { esProvincia, puedeVerPrecios, seriesDeTexto, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { BotonImprimir } from "@/components/crm/boton-imprimir";

export const dynamic = "force-dynamic";

/**
 * LA APERTURA DE DESPACHO — el formato con el que almacén despacha sin
 * preguntar a nadie.
 *
 * Carlos, 01-09: «para que se despache el equipo generamos un formato que le
 * llamamos apertura (…) yo le digo al almacén: acá está la apertura de
 * despacho, y con eso sí o sí tengo que ejecutar mi despacho. No tiene que
 * preguntar a nadie, porque para llegar ahí la condicional es: Finanzas
 * aprobó, check; corroboraste tu dirección, check; pedido embalado, check;
 * plano, check.» Y: «esa apertura tenemos que entregarle urgente porque acá
 * te tiene que dar automáticamente; toda la data está en el sistema».
 *
 * Es una página imprimible (Ctrl+P / «Guardar como PDF»): la misma ruta que
 * usa la empresa para todos sus documentos (HTML → Edge → PDF). No lleva
 * montos: es un documento de almacén y de transporte, no de venta.
 */
export default async function AperturaDespachoPage({ params }: { params: Promise<{ id: string }> }) {
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
          .select("codigo, serie, cliente_nombre, cliente_doc, orden_compra, entrega_direccion, contacto_despacho, modalidad_pago, forma_pago")
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
        [s.apertura_despacho_por, (s as { pago_confirmado_por?: string | null }).pago_confirmado_por, (s as { prueba_lista_por?: string | null }).prueba_lista_por].filter(
          (x): x is string => !!x,
        ),
      ),
  ]);
  const nombreDe = (pid: string | null | undefined) => (perfiles ?? []).find((p) => p.id === pid)?.nombre ?? null;

  const series = seriesDeTexto(s.equipo);
  const empresa = informe?.serie === "OPEN" ? "OPEN INVESTMENTS S.A.C." : "CORPORACIÓN EFAMEINSA S.A.";
  const cliente = cuenta?.razon_social ?? informe?.cliente_nombre ?? s.cliente_texto ?? "Cliente sin nombre";
  const ruc = cuenta?.num_doc ?? informe?.cliente_doc ?? null;
  const contacto = (informe?.contacto_despacho ?? null) as { nombre?: string; telefono?: string } | null;
  const recibe = s.recibe_nombre ?? contacto?.nombre ?? "—";
  const telefono = s.recibe_telefono ?? contacto?.telefono ?? "—";
  const direccion = s.direccion_entrega ?? informe?.entrega_direccion ?? s.ubicacion ?? "—";
  const modalidadPago = Array.isArray(informe?.modalidad_pago) ? (informe?.modalidad_pago as string[]).join(" · ") : null;

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

      <div className="hoja rounded-xl border border-border bg-white p-8 text-[13px] text-black shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b-2 border-[#7E1210] pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#7E1210]">{empresa}</p>
            <h1 className="mt-1 text-xl font-bold">Apertura de despacho</h1>
            <p className="text-[11px] text-neutral-600">
              Con este documento almacén ejecuta el despacho. Todas las condiciones abajo fueron verificadas en el
              sistema.
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

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
          <Campo etiqueta="Cliente">
            {cliente}
            {ruc && <span className="block text-neutral-600">RUC {ruc}</span>}
          </Campo>
          <Campo etiqueta="Modalidad">
            {s.modalidad ? s.modalidad.charAt(0).toUpperCase() + s.modalidad.slice(1) : "—"}
            {modalidadPago && <span className="block text-neutral-600">Pago: {modalidadPago}</span>}
          </Campo>
          <Campo etiqueta="Equipo(s)" ancho>
            {s.equipo ?? "—"}
            {series.length > 0 && (
              <span className="mt-1 block font-mono text-[12px]">
                {series.map((x) => (
                  <span key={x} className="mr-2 inline-block rounded border border-neutral-300 px-1.5">
                    serie {x}
                  </span>
                ))}
              </span>
            )}
          </Campo>
          <Campo etiqueta="Dirección de entrega (verificada)" ancho>
            {direccion}
          </Campo>
          <Campo etiqueta="Recibe">
            {recibe}
            {s.recibe_doc && <span className="block text-neutral-600">DNI {s.recibe_doc}</span>}
          </Campo>
          <Campo etiqueta="Teléfono de quien recibe">{telefono}</Campo>
          <Campo etiqueta="Fecha programada de despacho">
            {s.fecha_despacho ? fechaCalendario(s.fecha_despacho) : "Por programar"}
            {s.despacho_nota && <span className="block text-neutral-600">{s.despacho_nota}</span>}
          </Campo>
          <Campo etiqueta="Transportista / agencia">{s.transportista ?? "—"}</Campo>
        </div>

        <h2 className="mt-5 border-b border-neutral-300 pb-1 text-[11px] font-bold uppercase tracking-wide">
          Condiciones verificadas
        </h2>
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
    </div>
  );
}

function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{etiqueta}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
