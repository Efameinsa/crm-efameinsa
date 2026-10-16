import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { PROCESOS } from "@/lib/procesos";

// UN PROCESO EN DIAGRAMA, A PANTALLA COMPLETA (16-10). Es la misma página que publica el mapa
// (Archify, navegación tipo Miro), leída del disco de la VM: así el mapa y el CRM nunca se
// desfasan y el personal no necesita la contraseña del mapa. Solo con sesión del CRM.
export const dynamic = "force-dynamic";

const CARPETA = process.env.PROCESOS_DIR || "/srv/mapa";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proceso = PROCESOS.find((p) => p.id === id.toLowerCase());
  if (!proceso) return new Response("Ese proceso no existe.", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.redirect(new URL("/login", req.url), 303);

  try {
    const html = await readFile(join(CARPETA, `proc-${proceso.id}.html`), "utf8");
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, max-age=300",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>${proceso.titulo}</title><body style="font:16px/1.6 system-ui;padding:40px;max-width:640px;margin:auto"><h1>${proceso.titulo}</h1><p>Este diagrama vive en el servidor de la oficina y ahora no está disponible. Vuelva a intentarlo en unos minutos o avise a Sistemas.</p></body>`,
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
