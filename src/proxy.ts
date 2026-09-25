import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ranuraDeHost } from "@/lib/auditoria";
import { esFalloDeAutenticacion } from "@/lib/fallo-autenticacion";
import { CABECERA_DEMO, COOKIE_DEMO, COOKIE_VISTA, CORREO_DEMO, MENSAJE_DEMO } from "@/lib/solo-lectura";
import { usaVistaNueva } from "@/lib/propuesta/regla-vista";

const RUTA_POR_ROL: Record<string, string> = {
  admin: "/admin",
  gerencia: "/gerencia",
  central: "/central",
  comercial: "/comercial",
  operaciones: "/operaciones",
  // 23-09: la cuenta de Finanzas (0279) entraba a «/» y veía solo el título
  // «CRM Efameinsa»: su rol no estaba en esta lista.
  finanzas: "/finanzas",
  facturacion: "/facturacion",
};

export async function proxy(request: NextRequest) {
  // AUDITORÍA (0160). En ver1…ver5.crm.efameinsa.com la sesión es de otra
  // persona y el CRM es SOLO LECTURA: cualquier escritura —las acciones de
  // servidor viajan por POST— se rechaza acá, antes de tocar nada. La única
  // excepción es la puerta por la que entra el token de un solo uso.
  const ranura = ranuraDeHost(request.headers.get("host"));
  // La puerta decide sola: en una ranura abre la sesión; fuera de una ranura
  // responde 404. No necesita sesión previa y no debe redirigir al login.
  if (request.nextUrl.pathname === "/auditoria/entrar") return NextResponse.next({ request });
  if (ranura) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return NextResponse.json(
        { error: "Sesión de auditoría de gerencia: solo lectura. Nada se registra a nombre de la persona auditada." },
        { status: 403 },
      );
    }
  }

  // La marca de demostración (0280) la pone SOLO este proxy: si llega desde
  // el navegador, se borra antes de todo.
  request.headers.delete(CABECERA_DEMO);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no quitar. getUser() valida el token contra Supabase Auth
  // (getSession() solo lee la cookie, sin validar) y además refresca la sesión.
  const { data: datosUsuario, error: errorSesion } = await supabase.auth.getUser();
  const user = datosUsuario.user;

  // Si quien pregunta TRAE su cookie de sesión y lo único que pasó es que no
  // se pudo verificar contra Supabase, no se le saca: se le deja pasar y en la
  // próxima navegación se vuelve a intentar. Sacarlo sería inventar un cierre
  // de sesión que nadie pidió (Santos, 07-09: «que nunca se cierre sesión por
  // defecto, solo si ellos le dan clic»).
  const traeCookieDeSesion = request.cookies.getAll().some((c) => /^sb-.+-auth-token(.d+)?$/.test(c.name));
  const soloNoSePudoVerificar =
    !user && Boolean(errorSesion) && !esFalloDeAutenticacion(errorSesion) && traeCookieDeSesion;

  const { pathname } = request.nextUrl;
  const esRutaLogin = pathname === "/login";

  // CUENTAS DE DEMOSTRACIÓN DE LA PROPUESTA (0280). Gerencia recorre la
  // navegación nueva con `…_test@efameinsa.com`: el servidor lee con la sesión
  // de la cuenta original (espejo.ts) y NADA se escribe. Primera barrera:
  // cualquier envío (las acciones viajan por POST) se rechaza acá.
  if (user?.email && CORREO_DEMO.test(user.email)) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return NextResponse.json({ error: MENSAJE_DEMO }, { status: 403 });
    }
    // Las cuentas _test ven la vista anterior (25-09): entran por la portada
    // de su cuenta espejo, que /demo/vista?v=actual resuelve.
    if (pathname === "/" || esRutaLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/demo/vista";
      url.search = "?v=actual";
      return NextResponse.redirect(url);
    }
    const cabeceras = new Headers(request.headers);
    cabeceras.set(CABECERA_DEMO, user.id);
    const conMarca = NextResponse.next({ request: { headers: cabeceras } });
    response.cookies.getAll().forEach((c) => conMarca.cookies.set(c));
    conMarca.cookies.set(COOKIE_DEMO, "1", { path: "/", sameSite: "lax" });
    return conMarca;
  }
  if (request.cookies.has(COOKIE_DEMO)) response.cookies.delete(COOKIE_DEMO);

  if (!user && !esRutaLogin && !soloNoSePudoVerificar) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // El perfil solo hace falta para decidir A DÓNDE CAE alguien al entrar:
  // en «/» y en «/login». En cualquier otra navegación esta consulta era una
  // ida y vuelta a la base de más por clic (Santos, 02-09: «pequeños
  // tirones»); el layout ya carga el perfil una sola vez por petición.
  if (user && (pathname === "/" || esRutaLogin)) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol, es_postventa, es_operaciones, es_almacen")
      .eq("id", user.id)
      .single();

    // A DÓNDE CAE CADA UNO AL ENTRAR. Por rol a secas, postventa y la cuenta
    // de operaciones aterrizaban en «Mi día» del comercial —una pantalla que
    // para ellas sale vacía y que ni siquiera figura en su menú—. Ahora cada
    // una entra por donde trabaja: operaciones por sus autorizaciones (0114) y
    // postventa por su día (no confundir con `hace_postventa`, el comercial
    // que además vende mantenimiento: ese sigue siendo comercial).
    const home = !perfil
      ? null
      : perfil.es_operaciones
        ? "/operaciones"
        : perfil.es_almacen
          ? "/almacen"
        : perfil.es_postventa && perfil.rol === "comercial"
          ? "/postventa/macro"
          : RUTA_POR_ROL[perfil.rol];

    // Con la vista nueva (25-09) todos entran por «Hoy».
    const conVistaNueva = usaVistaNueva(false, request.cookies.get(COOKIE_VISTA)?.value);
    if (conVistaNueva && home) {
      const url = request.nextUrl.clone();
      url.pathname = "/nuevo";
      return NextResponse.redirect(url);
    }

    if (esRutaLogin && home) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }

    if (pathname === "/" && home) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // sw.js: un service worker servido detrás de una redirección lo rechaza
    // el navegador ("script resource is behind a redirect") — nunca debe
    // pasar por el proxy de auth, se sirve directo desde /public.
    //
    // manifest.webmanifest: la misma trampa, por otro camino. El navegador
    // pide el manifiesto SIN cookies (crossorigin anónimo por defecto), así
    // que detrás del proxy siempre sería "sin sesión" y recibiría el HTML del
    // login en lugar del JSON — el botón «Instalar» nunca aparecería. Se
    // agregó el 31-08-2026 con la aplicación instalable; el aviso de que esto
    // iba a pasar estaba escrito desde agosto en las notas del bug de sw.js.
    //
    // offline: la página que el service worker guarda para mostrar sin
    // internet (plan 26). Se cachea en la instalación del SW, que pide SIN
    // sesión — detrás del proxy cachearía el login y eso es lo que saldría
    // en cada corte. No tiene ni un dato: solo dice «sin conexión» y reintenta.
    // api/marketing/catalogo-whatsapp: lo lee Meta con su propia clave (17-09).
    // api/version: solo dice qué commit sirve el servidor (la pastilla de
    // «hay versión nueva», 31-08). Sin un dato de negocio; pasar por el proxy
    // solo le sumaría latencia a un ping de cada 5 minutos.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline|api/version|api/leads|api/webhooks|api/gasto-campania|api/cron|api/alertas|api/marketing/catalogo-whatsapp|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
