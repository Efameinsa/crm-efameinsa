import Link from "@/components/enlace";
import { CheckCircle2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ConfirmarGuiaBoton } from "@/components/crm/confirmar-guia-boton";
import {
  formatoMonto,
  pedidosPorId,
  type PedidoFinanzas,
} from "@/lib/pagos-finanzas";
import { fechaHoraLima } from "@/lib/fechas";
import { faltaVistoBuenoFinanzas, pideVistoBuenoFinanzas, motivoGuiaSugerido, textoComprobante, textoMotivoGuia, type EstadoLetras, type TipoPedido } from "@/lib/postventa";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";
import { VistoBuenoSalida } from "@/components/crm/visto-bueno-salida";
import { ValidarCreditoApertura } from "@/components/crm/validar-credito-apertura";

export const dynamic = "force-dynamic";

type FilaAp = {
  id: string;
  apertura_despacho_at: string | null;
  apertura_enviada_almacen_at: string | null;
  fecha_despacho: string | null;
  guia_confirmada_at: string | null;
  guia_confirmada_nota: string | null;
  guia_comprobante_tipo: string | null;
  guia_comprobante_numero: string | null;
  guia_motivo: string | null;
  guia_motivo_detalle: string | null;
  despachado_at: string | null;
  forma_pago: string | null;
  pct_antes_despacho: number | null;
  origen: string | null;
  tipo_pedido: TipoPedido | null;
  letras_cantidad: number | null;
  confirmacion_abono: string | null;
  informe_cierre_id: string | null;
  pago_confirmado_at: string | null;
  finanzas_vb_at: string | null;
  finanzas_vb_por: string | null;
  finanzas_vb_nota: string | null;
  finanzas_vb_comision: number | null;
  letras_estado: EstadoLetras | null;
  letras_firmadas_at: string | null;
  salida_autorizada_at: string | null;
  salida_autorizada_motivo: string | null;
  moneda: string | null;
};

/**
 * APERTURAS POR CONFIRMAR (0308, audio de gerencia 25-09 14:20).
 *
 * Postventa emite la apertura de despacho y la envía: al almacén para que
 * prepare, a Finanzas para que verifique y confirme que el almacén puede
 * emitir la guía de salida. Antes eso viajaba por correo; ahora llega el
 * aviso y se confirma acá, con la hoja y el estado del pago a la vista.
 */
export default async function AperturasPorConfirmarPage() {
  const perfil = await requerirPerfil();
  // Contabilidad (la cuenta de Facturación) no entra a /finanzas: ve la hoja y
  // el pago acá mismo, sin el enlace al pedido de Finanzas (buzón, Jhon 12-10).
  const conPedido = perfil.rol !== "facturacion";
  const supabase = await createClient();
  const columnas =
    "id, apertura_despacho_at, apertura_enviada_almacen_at, fecha_despacho, guia_confirmada_at, guia_confirmada_nota, guia_comprobante_tipo, guia_comprobante_numero, guia_motivo, guia_motivo_detalle, despachado_at, forma_pago, pct_antes_despacho, origen, tipo_pedido, letras_cantidad, confirmacion_abono, informe_cierre_id, pago_confirmado_at, finanzas_vb_at, finanzas_vb_por, finanzas_vb_nota, finanzas_vb_comision, letras_estado, letras_firmadas_at, salida_autorizada_at, salida_autorizada_motivo, moneda";
  const [{ data }, { data: sinEmitir }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select(columnas)
      .not("apertura_despacho_at", "is", null)
      .is("cerrado_at", null)
      .order("apertura_despacho_at", { ascending: false })
      .limit(150),
    // La apertura que postventa ya mandó al almacén pero que la base no dejó
    // emitir porque falta el visto bueno del crédito (0469): el aviso «Apertura
    // por confirmar» trae a Finanzas acá y tiene que encontrarla (Jhon 14-10,
    // Beneficencia de Huancayo).
    supabase
      .from("servicios_postventa")
      .select(columnas)
      .is("apertura_despacho_at", null)
      .not("apertura_enviada_almacen_at", "is", null)
      .is("guia_confirmada_at", null)
      .is("despachado_at", null)
      .is("cerrado_at", null)
      .order("apertura_enviada_almacen_at", { ascending: false })
      .limit(50),
  ]);
  const filas = [...((sinEmitir ?? []) as FilaAp[]), ...((data ?? []) as FilaAp[])];
  const porConfirmar = filas.filter(
    (f) => !f.guia_confirmada_at && !f.despachado_at,
  );
  const confirmadas = filas.filter((f) => f.guia_confirmada_at).slice(0, 30);
  const pedidos = new Map(
    (
      await pedidosPorId(
        supabase,
        [...porConfirmar, ...confirmadas].map((f) => f.id),
      )
    ).map((p) => [p.id, p]),
  );
  // Quién validó el crédito, para la segunda revisión (buzón, Jhon 14-10).
  const idsVb = [...new Set([...porConfirmar, ...confirmadas].map((f) => f.finanzas_vb_por).filter((x): x is string => Boolean(x)))];
  const nombres = new Map<string, string>(
    idsVb.length
      ? ((await createAdminClient().from("perfiles").select("id, nombre").in("id", idsVb)).data ?? []).map((x) => [x.id as string, String(x.nombre ?? "")])
      : [],
  );
  const puedeValidar = ["finanzas", "gerencia", "admin"].includes(perfil.rol);
  const fila = (f: FilaAp) => (
    <FilaApertura
      key={f.id}
      f={f}
      p={pedidos.get(f.id)}
      conPedido={conPedido}
      puedeValidar={puedeValidar}
      vbPorNombre={f.finanzas_vb_por ? (nombres.get(f.finanzas_vb_por) ?? null) : null}
    />
  );

  return (
    <div className="space-y-4">
      <SeccionPanel titulo={`Aperturas por confirmar · ${porConfirmar.length}`}>
        <p className="mb-2 text-xs text-muted-foreground">
          Postventa emitió la apertura de despacho. Revise la hoja y el pago y
          confirme: el almacén recibe el aviso y emite la guía de salida. La
          autoriza Contabilidad; si Contabilidad no está, Finanzas.
        </p>
        {porConfirmar.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No hay aperturas esperando su confirmación.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {porConfirmar.map(fila)}
          </ul>
        )}
      </SeccionPanel>
      {confirmadas.length > 0 && (
        <SeccionPanel titulo={`Confirmadas · ${confirmadas.length}`}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {confirmadas.map(fila)}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}

function FilaApertura({
  f,
  p,
  conPedido,
  puedeValidar,
  vbPorNombre,
}: {
  f: FilaAp;
  p: PedidoFinanzas | undefined;
  conPedido: boolean;
  puedeValidar: boolean;
  vbPorNombre: string | null;
}) {
  const falta = p ? (p.despachadoAt ? p.saldo : p.falta) : 0;
  const pide = pideVistoBuenoFinanzas(f);
  const faltaVb = faltaVistoBuenoFinanzas(f);
  // El segundo botón (buzón, Jhon 14-10): validar el crédito ahí mismo o, ya validado, volver a verlo.
  const conValidacion = pide && (Boolean(f.finanzas_vb_at) || (faltaVb && puedeValidar));
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {p?.cliente ?? "Pedido"}
        </p>
        <p className="text-xs text-muted-foreground">
          {p?.numeroErp ? `Pedido ${p.numeroErp} · ` : ""}
          {f.apertura_despacho_at
            ? `Apertura del ${fechaHoraLima(f.apertura_despacho_at)}`
            : `Enviada al almacén el ${fechaHoraLima(f.apertura_enviada_almacen_at)}; postventa todavía no la emite`}
          {f.fecha_despacho ? ` · sale el ${f.fecha_despacho}` : ""}
        </p>
        {p && p.total != null && (
          <p className="mt-0.5 text-xs">
            Total {formatoMonto(p.moneda, p.total)} · confirmado{" "}
            {formatoMonto(p.moneda, p.pagado)} ·{" "}
            {falta > 0 ? (
              <b className="text-destructive">
                falta {formatoMonto(p.moneda, falta)} antes del despacho
              </b>
            ) : (
              <b className="text-[#1E7F4F]">pago cubierto</b>
            )}
          </p>
        )}
        {pide && f.finanzas_vb_at && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#1E7F4F]">
            <CheckCircle2 className="size-3.5" /> Crédito validado por Finanzas el {fechaHoraLima(f.finanzas_vb_at)}
            {vbPorNombre ? ` por ${vbPorNombre}` : ""}
          </p>
        )}
        {f.guia_confirmada_at && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#1E7F4F]">
            <CheckCircle2 className="size-3.5" /> Guía confirmada el{" "}
            {fechaHoraLima(f.guia_confirmada_at)}
            {f.guia_comprobante_tipo ? ` · ${textoComprobante(f.guia_comprobante_tipo, f.guia_comprobante_numero)}` : ""}
            {textoMotivoGuia(f.guia_motivo, f.guia_motivo_detalle) ? ` · ${textoMotivoGuia(f.guia_motivo, f.guia_motivo_detalle)}` : ""}
            {f.guia_confirmada_nota ? ` · ${f.guia_confirmada_nota}` : ""}
          </p>
        )}
      </div>
      <a
        href={`/api/postventa/pedidos/${f.id}/apertura/pdf`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        <FileText className="size-3.5" /> Ver la apertura
      </a>
      {conPedido && (
        <Link
          href={`/finanzas/pedidos/${f.id}`}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          El pedido
        </Link>
      )}
      {/* Venta a crédito sin el visto bueno de Finanzas (0469, COFACO 14-10): la base no deja autorizar la guía. */}
      {!f.guia_confirmada_at && faltaVb && (
        <p className="w-full rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] font-semibold text-destructive">
          Falta el visto bueno de Finanzas{f.forma_pago ? ` (forma de pago: ${f.forma_pago})` : ""}: crédito o pago sin confirmar. No se autoriza la guía hasta que lo dé
          {puedeValidar ? ": pulse «Validar el crédito»." : "."}
        </p>
      )}
      {conValidacion && (
        <ValidarCreditoApertura validado={Boolean(f.finanzas_vb_at)}>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">El expediente</p>
            <p className="mt-1 font-semibold text-foreground">
              {p?.cliente ?? "Pedido"}
              {p?.clienteDoc ? ` · ${p.clienteDoc}` : ""}
            </p>
            <p className="text-muted-foreground">
              {[p?.codigoCierre ? `Cierre ${p.codigoCierre}` : null, p?.numeroErp ? `Pedido ${p.numeroErp}` : null, p?.comercialNombre ?? null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {p?.equipo && <p className="mt-0.5 text-muted-foreground">{p.equipo.replace(/\s+/g, " ")}</p>}
            <p className="mt-1">
              Forma de pago: <b>{f.forma_pago ?? "sin dato"}</b>
              {p?.condicion ? ` · antes del despacho: ${p.condicion}` : ""}
            </p>
            {p && p.total != null && (
              <p className="mt-0.5">
                Total {formatoMonto(p.moneda, p.total)} · confirmado {formatoMonto(p.moneda, p.pagado)} · antes del despacho{" "}
                {formatoMonto(p.moneda, p.requerido)} · saldo {formatoMonto(p.moneda, p.saldo)}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p?.informeId && p.codigoCierre && (
                <ExpedienteCierre
                  informeId={p.informeId}
                  codigo={p.codigoCierre}
                  cliente={p.cliente}
                  clienteDoc={p.clienteDoc}
                  clienteCorreo={p.clienteCorreo}
                  numeroOperacion={p.numeroOperacion}
                  serie={p.serie ?? "EFAMEINSA"}
                  monto={p.total ?? 0}
                  moneda={p.moneda}
                  modalidadPago={p.modalidadPago}
                  entregaLugar={p.entregaLugar}
                  entregaFecha={p.entregaFecha}
                  adjuntos={p.adjuntos}
                  compendio={null}
                  pedidoId={f.id}
                  soloLectura
                />
              )}
              {conPedido && (
                <Link href={`/finanzas/pedidos/${f.id}`} className="text-[11px] font-semibold text-primary hover:underline">
                  Abrir el pedido completo (abonos y liquidaciones)
                </Link>
              )}
            </div>
          </div>
          <VistoBuenoSalida
            d={{
              servicioId: f.id,
              formaPago: f.forma_pago,
              pide,
              vbAt: f.finanzas_vb_at,
              vbPorNombre,
              vbNota: f.finanzas_vb_nota,
              vbComision: f.finanzas_vb_comision == null ? null : Number(f.finanzas_vb_comision),
              letrasEstado: f.letras_estado,
              letrasCantidad: f.letras_cantidad,
              letrasFirmadasAt: f.letras_firmadas_at,
              salidaAutorizadaAt: f.salida_autorizada_at,
              salidaAutorizadaMotivo: f.salida_autorizada_motivo,
              despachadoAt: f.despachado_at,
              guiaConfirmadaAt: f.guia_confirmada_at,
              guiaComprobanteTipo: f.guia_comprobante_tipo,
              guiaComprobanteNumero: f.guia_comprobante_numero,
              moneda: f.moneda,
            }}
          />
        </ValidarCreditoApertura>
      )}
      {!f.guia_confirmada_at && !faltaVb && f.apertura_despacho_at && (
        <ConfirmarGuiaBoton
          servicioId={f.id}
          cliente={p?.cliente ?? "Pedido"}
          conSaldo={falta > 0}
          motivoSugerido={motivoGuiaSugerido(f)}
          aCredito={falta > 0 || Number(f.pct_antes_despacho ?? 100) < 100}
        />
      )}
    </li>
  );
}
