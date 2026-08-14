import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTA_POR_ROL: Record<string, string> = {
  admin: "/admin",
  gerencia: "/gerencia",
  central: "/central",
  comercial: "/comercial",
};

export async function proxy(request: NextRequest) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaLogin = pathname === "/login";

  if (!user && !esRutaLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", user.id)
      .single();

    const home = perfil ? RUTA_POR_ROL[perfil.rol] : null;

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
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api/leads|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
