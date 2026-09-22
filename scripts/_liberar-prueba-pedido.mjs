/**
 * Deja «sin probar» un pedido para que el almacén rehaga las fotos de prueba
 * y embalaje — el caso real (22-09): Santos, viendo que las fotos subidas
 * eran de prueba: «hay que liberarlo, sí. De Herrera y de Rivera. […] Vamos a
 * dejar eso como que falta, para subir nuevamente».
 *
 * NO toca `salida_fotos` (las fotos del DESPACHO) ni `despachado_at`: son un
 * paso distinto y, si el pedido ya salió, esas fotos se quedan.
 *
 * CORREGIDO EL 22-09 (mismo día, tras la queja de Rubí): el primer intento
 * dejaba `prueba_embalaje` (el campo de texto "SI"/"NO" que también escribe
 * `marcarPaso` al marcar la prueba) sin tocar. `bloquesPedido` mira los DOS
 * campos —`prueba_lista_at != null || marcadoEnExcel(prueba_embalaje)`— así
 * que el paso seguía en verde aunque `prueba_lista_at` ya estuviera en null.
 * Herrera y Rivera quedaron "liberados" en la base pero el circuito seguía
 * mostrándose completo hasta que se limpió también este campo.
 *
 * Uso: ID=<servicio_id> node --env-file=.env.local scripts/_liberar-prueba-pedido.mjs
 */
import { createClient } from "@supabase/supabase-js";

const id = process.env.ID;
if (!id) {
  console.error("Falta ID=<servicio_id>");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: antes, error: eAntes } = await supabase
  .from("servicios_postventa")
  .select("id, cliente_texto, despachado_at, prueba_lista_at, prueba_embalaje, protocolo_prueba_ref, protocolo_fotos")
  .eq("id", id)
  .maybeSingle();
if (eAntes || !antes) {
  console.error("No se encontró el pedido:", eAntes?.message ?? id);
  process.exit(1);
}
console.log("Antes:", JSON.stringify(antes, null, 2));

const { error: e1 } = await supabase
  .from("servicios_postventa")
  .update({ protocolo_fotos: [], prueba_lista_at: null, prueba_lista_por: null, protocolo_prueba_ref: null, prueba_embalaje: null })
  .eq("id", id);
if (e1) {
  console.error("Error al actualizar servicios_postventa:", e1.message);
  process.exit(1);
}

const { error: e2 } = await supabase
  .from("pedido_equipos")
  .update({ prueba_lista_at: null, protocolo_fotos: [] })
  .eq("servicio_id", id);
if (e2) {
  console.error("Error al actualizar pedido_equipos:", e2.message);
  process.exit(1);
}

console.log(`Liberado: ${antes.cliente_texto} (${id}). El almacén lo vuelve a ver como pendiente de probar y embalar.`);
