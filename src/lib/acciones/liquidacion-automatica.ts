"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { notificar, notificarCentral, notificarFacturacion } from "@/lib/notificaciones";
import { enlaceCierreDelPedido } from "@/lib/enlace-cierre-central";
import { calcularLiquidacion, cargarBaseLiquidacion, type BaseLiquidacion, type Complementos } from "@/lib/liquidacion-automatica";
import { pdfDeLiquidacion } from "@/lib/pdf/liquidacion-servidor";
import { textoParaNombreArchivo } from "@/lib/nombre-archivo";

// LA LIQUIDACIÓN SE GENERA SOLA (0534, reunión 17-10 con Jhon). Finanzas
// completa lo que falta, mira la vista previa y valida: queda en el historial
// como la N.º siguiente y avisa a Central (para seguir el pedido) y, si hay un
// abono sin factura, a Contabilidad.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");
const sinRuc = (s: string) => s.replace(/^\d{8,11}\s*-\s*/, "");

function revisar(c: Complementos): string | null {
  if (c.retenido && !(c.retenido.monto > 0)) return "Escriba el monto de la detracción o retención (o quite la marca).";
  if (c.letras && !(c.letras.cantidad >= 1 && c.letras.cantidad <= 36)) return "Las letras van de 1 a 36.";
  if (c.letras && !/^\d{4}-\d{2}-\d{2}$/.test(c.letras.giro)) return "Falta la fecha de giro de las letras.";
  return null;
}

/** Lo que el diálogo necesita al abrirse: el pedido ya leído y la fecha de hoy. */
export async function prepararLiquidacion(servicioId: string): Promise<{ error: string | null; base?: BaseLiquidacion; hoy?: string }> {
  const perfil = await requerirPerfil();
  const base = await cargarBaseLiquidacion(await createClient(), servicioId, perfil.id);
  if (!base) return { error: "No se encontró el pedido." };
  return { error: null, base, hoy: hoyLima() };
}

/** La vista previa, sin guardar nada: el PDF en base64. */
export async function vistaPreviaLiquidacion(servicioId: string, c: Complementos): Promise<{ error: string | null; pdf?: string }> {
  const perfil = await requerirPerfil();
  const problema = revisar(c);
  if (problema) return { error: problema };
  const supabase = await createClient();
  const base = await cargarBaseLiquidacion(supabase, servicioId, perfil.id);
  if (!base) return { error: "No se encontró el pedido." };
  const pdf = await pdfDeLiquidacion(calcularLiquidacion(base, c, hoyLima()), true);
  return { error: null, pdf: Buffer.from(pdf).toString("base64") };
}

/** Finanzas valida: se guarda el PDF, se registra y se avisa. */
export async function validarLiquidacion(servicioId: string, c: Complementos): Promise<{ error: string | null; numero?: number }> {
  const perfil = await requerirPerfil();
  const problema = revisar(c);
  if (problema) return { error: problema };
  const supabase = await createClient();
  const base = await cargarBaseLiquidacion(supabase, servicioId, perfil.id);
  if (!base) return { error: "No se encontró el pedido." };
  const l = calcularLiquidacion(base, c, hoyLima());
  const pdf = await pdfDeLiquidacion(l, false);

  const nombre = `Liquidacion ${l.numero} ${textoParaNombreArchivo(base.pedido)} ${textoParaNombreArchivo(base.cliente)}`.slice(0, 110) + ".pdf";
  const path = `liquidaciones/${servicioId}/${crypto.randomUUID()}-${nombre.replace(/[^\w.\-]+/g, "_")}`;
  const { error: eSubir } = await supabase.storage.from("adjuntos").upload(path, pdf, { contentType: "application/pdf" });
  if (eSubir) return { error: `No se pudo guardar el PDF: ${eSubir.message}. Vuelva a intentarlo.` };

  const { data: antes } = await supabase.from("servicios_postventa").select("liquidacion_at").eq("id", servicioId).maybeSingle();
  const { data: numero, error } = await supabase.rpc("finanzas_registrar_liquidacion_generada", {
    p_servicio: servicioId,
    p_path: path,
    p_nombre: nombre,
    p_estado_pago: l.estado,
    p_factura: l.facturaVigente,
    p_nota: [l.rotulo, c.nota.trim()].filter(Boolean).join(" · "),
    p_datos: c,
    p_retenido_tipo: c.retenido?.tipo ?? null,
    p_retenido_monto: c.retenido?.monto ?? null,
    p_retenido_cobrado: c.retenido?.cobrado ?? false,
  });
  if (error) return { error: limpiar(error.message) };

  const quien = sinRuc(base.cliente);
  const pedido = ` del pedido ${base.pedido}`;
  const esPrueba = perfil.es_prueba === true;
  const alPedido = await enlaceCierreDelPedido(supabase, servicioId);
  const m = (n: number) => `${base.moneda === "PEN" ? "S/" : "US$"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const avisos: Promise<void>[] = [
    notificarCentral({
      titulo: `Liquidación ${numero} lista · ${quien}`,
      cuerpo: antes?.liquidacion_at
        ? `Finanzas validó la liquidación ${numero}${pedido} (${l.rotulo.toLowerCase()}). Imprímala para el expediente.`
        : `Finanzas validó la liquidación${pedido} (${l.rotulo.toLowerCase()}): ya puede seguir con el pedido.`,
      url: alPedido,
      esPrueba,
    }),
  ];
  if (!l.facturaVigente) {
    avisos.push(
      notificarFacturacion({
        titulo: base.facturas.length ? `Nuevo anticipo por facturar · ${quien}` : `Por facturar · ${quien}`,
        cuerpo: `Finanzas validó la liquidación ${numero}${pedido} con un abono pendiente de factura. Facture y regístrela: Finanzas recibe el aviso para actualizar la liquidación.`,
        url: "/facturacion",
        esPrueba,
      }),
    );
  }
  // La comisión que falta la cobra el comercial; postventa solo se entera
  // (gerencia 17-10: «no lo hace postventa, pero postventa recibe»).
  if (l.comisionPendiente > 0) {
    const { data: s } = await supabase
      .from("servicios_postventa")
      .select("informes_cierre!servicios_postventa_informe_cierre_id_fkey(creado_por)")
      .eq("id", servicioId)
      .maybeSingle();
    const comercial = (s?.informes_cierre as unknown as { creado_por: string | null } | null)?.creado_por ?? null;
    if (comercial) {
      avisos.push(
        notificar({
          userId: comercial,
          tipo: "finanzas",
          titulo: `Falta cobrar la comisión · ${quien}`,
          cuerpo: `Liquidación ${numero}${pedido}: el banco descontó ${m(l.comisionPendiente)} y el saldo es ${m(l.saldo)}. Cóbrelo al cliente y suba el voucher en Pagos del pedido.`,
          url: `/pedidos/${servicioId}/pagos`,
        }),
      );
    }
    const { data: pv } = await supabase
      .from("perfiles")
      .select("id")
      .eq("es_postventa", true)
      .eq("activo", true)
      .eq("solo_preventivo", false)
      .is("espejo_de", null)
      .eq("es_prueba", esPrueba);
    for (const p of pv ?? []) {
      avisos.push(
        notificar({
          userId: p.id as string,
          tipo: "finanzas",
          titulo: `Saldo de comisión · ${quien}`,
          cuerpo: "Para que lo sepa: falta la comisión que descontó el banco y la está cobrando el comercial.",
          url: `/postventa/pedidos/${servicioId}`,
        }),
      );
    }
  }
  await Promise.all(avisos);

  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath("/finanzas/liquidar");
  revalidatePath("/facturacion");
  revalidatePath("/central/cierres");
  return { error: null, numero: Number(numero) };
}
