/**
 * LAS CUENTAS DE DEMOSTRACIÓN DE LA PROPUESTA (0280).
 *
 * Santos, 23-09: gerencia recorre la propuesta de navegación con cuentas
 * `…_test@efameinsa.com` que muestran los datos REALES de una cuenta original
 * (central_test ve lo de Central, comercial_test lo de Katerine…), en solo
 * lectura. Para eso el servidor lee con la sesión de la cuenta original (ver
 * `espejo.ts`), y este archivo es el candado que impide escribir: todo pedido
 * que no sea una lectura se responde acá mismo, sin llegar a la base.
 *
 * Es LISTA BLANCA a propósito. Una función de la base que no está en
 * `RPC_DE_LECTURA` se bloquea aunque solo lea: el costo de olvidar una es
 * que una pantalla de demostración muestre un aviso; el de dejar pasar una
 * escritura, que la demostración cambie un pedido real. `mi_pin_supervisor`
 * queda fuera aunque solo lea: es el código de autorización vigente.
 */

export const CORREO_DEMO = /_test@efameinsa\.com$/i;
/** La pone el proxy con el id de la cuenta de demostración; la quita si viene de afuera. */
export const CABECERA_DEMO = "x-crm-demo";
/** Visible para el navegador: activa el candado también en el cliente. */
export const COOKIE_DEMO = "crm-demo";
/** «actual» muestra el CRM como es hoy; cualquier otro valor, la propuesta. */
export const COOKIE_VISTA = "crm-vista";

const RPC_DE_LECTURA = new Set([
  "bitacora_autorizaciones",
  "bitacora_correcciones",
  "cartera_de_documento",
  "cartera_en_juego",
  "cierre_en_juego",
  "comunicado_pendiente",
  "contar_oportunidades_por_etapa",
  "conversiones_de_campana",
  "correccion_abierta",
  "correccion_informe_abierta",
  "cuentas_por_celular",
  "cuentas_por_rubro",
  "expediente_para_seguimiento",
  "experimento_web",
  "finanzas_marketing",
  "frenos_correccion_cotizacion",
  "garantia_del_equipo",
  "grupo_economico",
  "historial_cuenta_para_postventa",
  "informe_central",
  "leads_por_origen",
  "listar_clientes",
  "listar_oportunidades",
  "reporte_diario_comercial",
  "resumen_gerencia",
  "sedes_de_documento",
  "stock_por_producto",
  "supervision_diaria",
  "ultima_gestion_de_cuentas",
  "ultima_gestion_de_oportunidades",
  "uso_de_listas",
  "ventas_para_el_parque",
]);

export const MENSAJE_DEMO = "Modo demostración: solo lectura. Nada de lo que se haga aquí se guarda.";

/** ¿Este pedido a Supabase es una lectura? */
export function pedidoPermitido(url: string, metodo: string): boolean {
  const m = (metodo || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const p = u.pathname;
  if (p.startsWith("/rest/v1/rpc/")) return RPC_DE_LECTURA.has(p.slice("/rest/v1/rpc/".length));
  // Enlaces firmados y listados de archivos: leen, no escriben.
  if (p.startsWith("/storage/v1/object/sign/") || p.startsWith("/storage/v1/object/list/")) return true;
  // Renovar el token de la sesión espejo. El cierre de sesión NO pasa: cerraría
  // la sesión de la persona real (el signOut de Supabase es global).
  if (p === "/auth/v1/token" && u.searchParams.get("grant_type") === "refresh_token") return true;
  return false;
}

/** Un `fetch` que responde 403 a todo lo que no sea lectura, con la forma de error de PostgREST. */
export function fetchSoloLectura(base: typeof fetch = fetch): typeof fetch {
  return async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = init?.method ?? (typeof entrada === "object" && "method" in entrada ? entrada.method : "GET");
    if (!pedidoPermitido(url, metodo)) {
      return new Response(JSON.stringify({ code: "DEMO", message: MENSAJE_DEMO, details: null, hint: null }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return base(entrada, init);
  };
}
