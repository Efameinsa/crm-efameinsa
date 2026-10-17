import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { casoDelCliente, identificarCliente, mensajeParaPortal, pedidoDelCliente } from "@/lib/portal/cliente";
import { avisarAlEquipo, sinDocumento } from "@/lib/portal/avisos";
import { LimiteDeTasa } from "@/lib/campo-osmand";
import { leerPeticionPortal, noEncontrado, rechazo, soloPost, texto } from "@/lib/portal/peticion";

/**
 * EL CLIENTE ESCRIBE DESDE MI CUENTA (contrato «Experiencia del cliente», 17-10; tabla de la 0526).
 *
 * Cuerpo: { email?, telefono?, texto (1..2000), pedido_id?, caso_id? }.
 * Guarda el mensaje en `portal_mensajes` y avisa al comercial dueño de la
 * ficha (y a postventa si va ligado a un pedido o un caso). Devuelve el
 * mensaje con la forma de la lista de Mi cuenta.
 */

export const dynamic = "force-dynamic";

/** Un chat, no una cola: 20 mensajes por minuto por cliente sobra. */
const porCliente = new LimiteDeTasa(20, 60_000);

export async function POST(request: NextRequest) {
  const leida = await leerPeticionPortal(request);
  if ("respuesta" in leida) return leida.respuesta;
  const { cuerpo } = leida;

  const escrito = (texto(cuerpo.texto) ?? "").trim();
  if (escrito.length < 1 || escrito.length > 2000) return rechazo(400, "El mensaje tiene que tener entre 1 y 2000 caracteres");

  const admin = createAdminClient();
  const cli = await identificarCliente(admin, { email: texto(cuerpo.email), telefono: texto(cuerpo.telefono) });
  if (!cli) return noEncontrado();

  const clave = [...cli.cuentas.map((c) => c.id), ...cli.pedidosComoReceptor].sort().join(",");
  if (!porCliente.permitir(clave)) return rechazo(429, "Demasiados mensajes seguidos");

  let cuentaId: string | null = null;
  let servicioId: string | null = null;
  let atencionId: string | null = null;
  let esPrueba = false;
  let detalle: string | null = null;

  const pedidoPedido = texto(cuerpo.pedido_id);
  const casoPedido = texto(cuerpo.caso_id);
  if (pedidoPedido) {
    const p = await pedidoDelCliente(admin, cli, pedidoPedido);
    if (!p) return noEncontrado();
    cuentaId = p.cuenta_id;
    servicioId = p.id;
    esPrueba = p.es_prueba;
    detalle = (p.equipo ?? "").split(/\r?\n/)[0]?.trim() || null;
  }
  if (casoPedido) {
    const a = await casoDelCliente(admin, cli, casoPedido);
    if (!a) return noEncontrado();
    cuentaId = cuentaId ?? a.cuenta_id;
    atencionId = a.id;
    esPrueba = esPrueba || a.es_prueba;
  }
  if (!cuentaId) {
    // Sin pedido ni caso: a la ficha que tiene dueño (la primera, si ninguna tiene).
    cuentaId = (cli.cuentas.find((c) => c.comercial_id) ?? cli.cuentas[0])?.id ?? null;
  }
  if (!cuentaId && cli.pedidosComoReceptor[0]) {
    // Solo figura como quien recibe un pedido: el mensaje va a la ficha de ese pedido.
    const p = await pedidoDelCliente(admin, cli, cli.pedidosComoReceptor[0]);
    cuentaId = p?.cuenta_id ?? null;
    servicioId = servicioId ?? p?.id ?? null;
    esPrueba = esPrueba || Boolean(p?.es_prueba);
  }
  if (!cuentaId) return noEncontrado();

  const { data, error } = await admin
    .from("portal_mensajes")
    .insert({
      cuenta_id: cuentaId,
      autor: "cliente",
      autor_id: null,
      autor_nombre: cli.nombre.slice(0, 200),
      texto: escrito,
      servicio_id: servicioId,
      atencion_id: atencionId,
    })
    .select("id, autor, autor_nombre, texto, created_at, servicio_id, atencion_id")
    .single();
  if (error || !data) {
    console.error("[portal] mensaje: guardar", error?.message);
    return rechazo(500, "No se pudo guardar el mensaje");
  }

  const empresa = cli.cuentas.find((c) => c.id === cuentaId)?.razon_social ?? null;
  await avisarAlEquipo({
    cuentaId,
    conPostventa: Boolean(servicioId || atencionId),
    esPrueba,
    titulo: `Mensaje de ${cli.nombre}${empresa ? ` (${sinDocumento(empresa)})` : ""} en Mi cuenta`,
    cuerpo: [detalle ? `Sobre: ${detalle}` : null, escrito.length > 160 ? `${escrito.slice(0, 157)}…` : escrito].filter(Boolean).join(" · "),
    urlPostventa: servicioId ? `/postventa/pedidos/${servicioId}` : atencionId ? `/postventa/atenciones/${atencionId}` : undefined,
  });

  return NextResponse.json({ ok: true, mensaje: mensajeParaPortal(data as Parameters<typeof mensajeParaPortal>[0]) }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = soloPost;
export const PUT = soloPost;
export const PATCH = soloPost;
export const DELETE = soloPost;
