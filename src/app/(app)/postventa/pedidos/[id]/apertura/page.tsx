import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { fechaHoraLima } from "@/lib/fechas";
import { asuntoApertura, cuerpoApertura } from "@/lib/apertura-servicio";
import { cargarHojaApertura } from "@/lib/acciones/apertura-servicio-datos";
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

  const hoja = await cargarHojaApertura(supabase, id, perfil);
  if (!hoja) notFound();
  const { servicio: s, informe, empresaLarga, emitidoPor, d, filas, faltantes, condiciones, avisoPreinstalacion } = hoja;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <style>{`
        @media print {
          /* Solo la hoja: sin el menú ni la cabecera del CRM, que se comían
             media página y aplastaban la tabla (queja de postventa, 22-09).
             Mismo recurso que el informe imprimible. */
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden !important; }
          .hoja, .hoja * { visibility: visible !important; }
          .hoja { position: absolute; inset: 0 0 auto 0; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; }
          .hoja th:nth-child(2) { width: 9.5rem; }
          .hoja tr { break-inside: avoid; }
          .hoja { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-imprimir { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-imprimir flex items-center justify-between">
        <Link
          href={`/postventa/pedidos/${s.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver al pedido
        </Link>
        <span className="flex items-center gap-2">
          {/* Carlos, 22-09: «lo tomas y lo envías» — un PDF descargable, igual
              que el del cierre, en vez de depender del «Guardar como PDF»
              del navegador. */}
          <a
            href={`/api/postventa/pedidos/${s.id}/apertura/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Download className="size-3.5" /> Descargar PDF
          </a>
          <BotonImprimir>
            <Printer className="size-3.5" /> Imprimir o guardar en PDF
          </BotonImprimir>
        </span>
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
            {emitidoPor && (
              <p>
                <b>Por:</b> {emitidoPor} · Postventa
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

        {avisoPreinstalacion && (
          <p className="mt-3 border border-neutral-400 p-2 text-[11px]">
            <b>Aviso:</b> {avisoPreinstalacion} No impide el despacho, pero conviene tenerla confirmada antes de que
            salga el camión: es lo que hace posible la puesta en marcha al llegar.
          </p>
        )}

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
          tipo: d.tipo,
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
        enviadaAlmacenAt={s.apertura_enviada_almacen_at ?? null}
        enviadaClienteAt={s.apertura_enviada_cliente_at ?? null}
      />
    </div>
  );
}
