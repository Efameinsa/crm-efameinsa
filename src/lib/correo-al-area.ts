import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoN8n } from "@/lib/avisos-n8n";
import { enlaceApp } from "@/lib/url-app";
import { correosDelArea, type AreaDeAviso, type Empresa, type FilaDirectorio } from "@/lib/directorio";

/** La empresa del pedido: la serie de su cierre. Sin cierre (apertura desde un caso), EFAMEINSA. */
export async function empresaDelServicio(servicioId: string): Promise<Empresa> {
  const admin = createAdminClient();
  const { data: s } = await admin.from("servicios_postventa").select("informe_cierre_id").eq("id", servicioId).maybeSingle();
  if (!s?.informe_cierre_id) return "EFAMEINSA";
  const { data: inf } = await admin.from("informes_cierre").select("serie").eq("id", s.informe_cierre_id).maybeSingle();
  return inf?.serie === "OPEN" ? "OPEN" : "EFAMEINSA";
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function htmlDelAviso(d: { titulo: string; cuerpo: string; url?: string; empresa: Empresa }): string {
  const marca = d.empresa === "OPEN" ? "OPEN INVESTMENTS" : "CORPORACIÓN EFAMEINSA";
  const boton = d.url
    ? `<p style="margin:20px 0"><a href="${enlaceApp(d.url)}" style="background:#7e1210;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Abrir en el CRM</a></p>`
    : "";
  return (
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">` +
    `<p style="font-size:11px;letter-spacing:.08em;color:#7e1210;font-weight:700;margin:0 0 6px">${marca} · AVISO DEL CRM</p>` +
    `<h2 style="font-size:17px;margin:0 0 10px">${escapar(d.titulo)}</h2>` +
    `<p style="line-height:1.5;margin:0">${escapar(d.cuerpo)}</p>` +
    boton +
    `<p style="font-size:11px;color:#888;margin-top:24px">Este correo lo manda el CRM con el mismo aviso que sonó en la campana. ` +
    `A quién le llega se ajusta en el Directorio del CRM.</p></div>`
  );
}

/**
 * EL AVISO TAMBIÉN LLEGA AL CORREO (reunión de gerencia 06-10 11:01: «para que
 * no solamente haya la excusa de: uy, no, mi campana no sonó»).
 *
 * A quién le llega sale del directorio (0410), no del código: cada persona
 * tiene marcadas las áreas cuyos avisos recibe, y gerencia u operaciones lo
 * cambian en /directorio. Y a qué correo: al de la empresa del pedido — «nació
 * en OPEN, correos OPEN; en EFAMEINSA, EFAMEINSA». Si a esa persona le falta el
 * de esa empresa, le llega al otro antes que quedarse sin aviso.
 *
 * Best-effort, como todo lo que sale por n8n: la campana ya sonó y el CRM es la
 * fuente de verdad. Lo de la serie de práctica no le escribe a nadie.
 */
export async function correoAlArea(d: {
  areas: AreaDeAviso[];
  servicioId?: string | null;
  empresa?: Empresa;
  titulo: string;
  cuerpo: string;
  url?: string;
  esPrueba?: boolean;
}): Promise<void> {
  if (d.esPrueba) return;
  try {
    const admin = createAdminClient();
    const empresa = d.empresa ?? (d.servicioId ? await empresaDelServicio(d.servicioId) : "EFAMEINSA");
    const { data } = await admin.from("directorio").select("nombre, correo_efameinsa, correo_open, avisos, activo").eq("activo", true);
    const para = correosDelArea((data ?? []) as FilaDirectorio[], d.areas, empresa);
    if (!para.length) return;
    const r = await enviarCorreoN8n({
      para: para.join(", "),
      asunto: `${empresa === "OPEN" ? "OPEN" : "EFAMEINSA"} // ${d.titulo}`,
      html: htmlDelAviso({ titulo: d.titulo, cuerpo: d.cuerpo, url: d.url, empresa }),
    });
    if (r.error) console.error("correoAlArea:", r.error);
  } catch (e) {
    console.error("correoAlArea: no se pudo mandar el aviso por correo:", e instanceof Error ? e.message : e);
  }
}
