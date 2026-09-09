import { NextRequest, NextResponse } from "next/server";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaceFirmado, listarCarpetaServidor, servidorDeArchivosActivo } from "@/lib/archivos-servidor";

/**
 * Lista una carpeta de archivos del cliente y devuelve, por cada archivo, un
 * enlace firmado que el navegador puede cargar directo del servidor.
 *
 * POR QUÉ ESTA RUTA (Santos, 09-09). Antes «Documentos del servidor» abría una
 * pestaña nueva a otro dominio. Desde la app instalada (PWA) el gerente no veía
 * nada: la pestaña salía de la aplicación. Ahora el CRM pide acá el listado
 * —firma y consulta al servidor desde el propio CRM, sin CORS ni secreto en el
 * navegador— y muestra las fotos DENTRO de la app, en una galería.
 *
 * QUIÉN PUEDE VER QUÉ no lo decide esta ruta: la carpeta base sale de
 * `cuentas.carpetas_servidor` leída con la sesión del usuario, así que la RLS ya
 * filtró. El comercial solo abre las de su cartera; gerencia, todas. Acá solo
 * se impide salirse de esa carpeta con «..».
 */
export async function GET(req: NextRequest) {
  await requerirPerfil(); // exige sesión; la RLS hace el resto
  if (!servidorDeArchivosActivo()) {
    return NextResponse.json({ error: "El archivo del servidor no está disponible." }, { status: 503 });
  }

  const p = req.nextUrl.searchParams;
  const cuentaId = p.get("cuentaId") ?? "";
  const clase = p.get("clase") ?? "";
  const sub = (p.get("sub") ?? "").replace(/^\/+|\/+$/g, "");

  if (!cuentaId || !["fotos", "informes", "videos", "fichas"].includes(clase)) {
    return NextResponse.json({ error: "Pedido incompleto." }, { status: 400 });
  }
  // «..» nunca: ni suelto ni como segmento.
  if (sub.split(/[\\/]/).some((s) => s === "..")) {
    return NextResponse.json({ error: "Ruta no permitida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("carpetas_servidor")
    .eq("id", cuentaId)
    .maybeSingle();

  const mapa = (cuenta?.carpetas_servidor ?? null) as Record<string, string> | null;
  const base = mapa?.[clase];
  if (!base) {
    return NextResponse.json({ error: "Este cliente no tiene esa carpeta." }, { status: 404 });
  }

  // El servidor de archivos es Linux: las rutas van con «/».
  const carpeta = sub ? `${base}/${sub}` : base;
  const listado = await listarCarpetaServidor(carpeta, 4000);
  if (!listado) {
    return NextResponse.json({ error: "No se pudo leer la carpeta. ¿El servidor está encendido?" }, { status: 502 });
  }

  const elementos = listado.elementos.map((e) => {
    if (e.tipo === "carpeta") {
      return { nombre: e.nombre, tipo: "carpeta" as const, sub: sub ? `${sub}/${e.nombre}` : e.nombre };
    }
    return {
      nombre: e.nombre,
      tipo: "archivo" as const,
      ext: e.ext ?? "",
      peso: e.peso ?? null,
      modificado: e.modificado ?? null,
      url: enlaceFirmado(`${carpeta}/${e.nombre}`),
    };
  });

  return NextResponse.json({ ruta: carpeta, sub, elementos, truncado: listado.truncado });
}
