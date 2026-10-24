import type { createClient } from "@/lib/supabase/server";
import { notificar, notificarCentral } from "@/lib/notificaciones";
import { enlaceCierreDelPedido } from "@/lib/enlace-cierre-central";

/**
 * LLEGÓ LA MÁQUINA QUE UN PEDIDO ESPERABA (Lesly y Santos, 23-10, Sonesta Cusco).
 *
 * Central cierra la venta con «no hay stock» y el pedido se queda quieto hasta
 * que Importaciones trae la máquina; nadie se enteraba de que llegó: «la central
 * no sabe que la máquina ya llegó… ¿cómo le digo que ya tengo la serie para que
 * haga toda su gestión?». Cuando el almacén marca que llegó o le pone la serie a
 * una línea que estaba sin stock o por importar, Central y TODA postventa
 * reciben el aviso con la serie y el enlace al pedido. Santos (23-10): «cualquiera
 * de postventa debe recibir el aviso al momento para gestionar», no una persona.
 * Sin circuito nuevo.
 */
export async function avisarQueLlegoLaMaquina(
  supabase: Awaited<ReturnType<typeof createClient>>,
  datos: { servicioId: string; descripcion: string | null; serie: string | null },
): Promise<void> {
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select("cliente_texto, es_prueba, informe_cierre_id, series_pedidas_at")
    .eq("id", datos.servicioId)
    .maybeSingle();
  if (!s) return;
  const cliente = (s.cliente_texto ?? "").replace(/^\d{8,11}\s*-\s*/, "") || "cliente";
  const que = (datos.descripcion ?? "la máquina").split(/\n|,/)[0].trim().slice(0, 90);
  const conSerie = datos.serie ? ` Serie ${datos.serie}, ya puesta en el pedido.` : " Falta ponerle la serie.";
  const titulo = `Llegó la máquina · ${cliente}`;
  const enlacePedido = `/nuevo/pedido/${datos.servicioId}`;
  // El área de postventa, como en los demás avisos del almacén (sin la cuenta que solo vende preventivo).
  const { data: postventa } = await supabase
    .from("perfiles")
    .select("id")
    .eq("es_postventa", true)
    .eq("activo", true)
    .eq("solo_preventivo", false)
    .is("espejo_de", null)
    .eq("es_prueba", s.es_prueba === true);
  const cuerpoPostventa = `${que}: el almacén avisa que ya está en planta.${conSerie} Ya se puede seguir con la prueba y la apertura.`;
  await Promise.all([
    notificarCentral({
      titulo,
      cuerpo: `${que}: el almacén avisa que ya está en planta.${conSerie} Actualice el pedido${s.series_pedidas_at || !s.informe_cierre_id ? "" : " y pídale las series al almacén"} para que siga a postventa.`,
      url: s.informe_cierre_id ? await enlaceCierreDelPedido(supabase, datos.servicioId) : enlacePedido,
      esPrueba: s.es_prueba === true,
    }),
    ...(postventa ?? []).map((p) => notificar({ userId: p.id, tipo: "almacen", titulo, cuerpo: cuerpoPostventa, url: enlacePedido })),
  ]);
}
