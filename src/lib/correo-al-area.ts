import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoN8n } from "@/lib/avisos-n8n";
import { enlaceApp } from "@/lib/url-app";
import { fechaCalendario } from "@/lib/fechas";
import { armarAviso } from "@/lib/correo/aviso";
import { correosDelArea, type AreaDeAviso, type Empresa, type FilaDirectorio } from "@/lib/directorio";

/** La empresa del pedido: la serie de su cierre. Sin cierre (apertura desde un caso), EFAMEINSA. */
export async function empresaDelServicio(servicioId: string): Promise<Empresa> {
  const admin = createAdminClient();
  const { data: s } = await admin.from("servicios_postventa").select("informe_cierre_id").eq("id", servicioId).maybeSingle();
  if (!s?.informe_cierre_id) return "EFAMEINSA";
  const { data: inf } = await admin.from("informes_cierre").select("serie").eq("id", s.informe_cierre_id).maybeSingle();
  return inf?.serie === "OPEN" ? "OPEN" : "EFAMEINSA";
}

const ETIQUETA_AREA: Record<AreaDeAviso, string> = { finanzas: "Finanzas", almacen: "Almacén", postventa: "Postventa", central: "Central" };

/**
 * LOS DATOS DEL PEDIDO que acompañan al aviso, en una tabla: quien lo lee en el
 * celular entiende de qué pedido se trata sin abrir el CRM. Salen del propio
 * pedido (lo que el almacén y Finanzas ya ven en pantalla) y nunca llevan montos.
 */
export async function datosDelPedido(servicioId: string): Promise<{ etiqueta: string; valor: string }[]> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("servicios_postventa")
    .select("cliente_texto, numero_pedido_erp, equipo, fecha_despacho, apertura_fecha, apertura_hora, tecnico_asignado")
    .eq("id", servicioId)
    .maybeSingle();
  if (!s) return [];
  const filas: { etiqueta: string; valor: string }[] = [];
  const cliente = (s.cliente_texto ?? "").replace(/^\d{8,11}\s*-\s*/, "").trim();
  if (cliente) filas.push({ etiqueta: "Cliente", valor: cliente });
  if (s.numero_pedido_erp) filas.push({ etiqueta: "Pedido", valor: String(s.numero_pedido_erp) });
  const equipo = (s.equipo ?? "").trim();
  if (equipo) filas.push({ etiqueta: "Equipo", valor: equipo.length > 400 ? `${equipo.slice(0, 400)}…` : equipo });
  const dia = s.fecha_despacho ?? s.apertura_fecha;
  const hora = s.apertura_hora ? ` · ${String(s.apertura_hora).slice(0, 5)}` : "";
  filas.push({ etiqueta: s.fecha_despacho ? "Despacho programado" : "Fecha programada", valor: dia ? `${fechaCalendario(dia)}${hora}` : "Falta programar el día" });
  const tecnico = (s.tecnico_asignado ?? "").trim();
  if (tecnico) filas.push({ etiqueta: "Técnico", valor: tecnico });
  return filas;
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
  /** Datos extra para la tabla; si hay `servicioId`, los del pedido van primero. */
  datos?: { etiqueta: string; valor: string }[];
}): Promise<void> {
  if (d.esPrueba) return;
  try {
    const admin = createAdminClient();
    const empresa = d.empresa ?? (d.servicioId ? await empresaDelServicio(d.servicioId) : "EFAMEINSA");
    const { data } = await admin.from("directorio").select("nombre, correo_efameinsa, correo_open, avisos, activo").eq("activo", true);
    const para = correosDelArea((data ?? []) as FilaDirectorio[], d.areas, empresa);
    if (!para.length) return;
    const tabla = [...(d.servicioId ? await datosDelPedido(d.servicioId) : []), ...(d.datos ?? [])];
    const marca = empresa === "OPEN" ? "OPEN INVESTMENTS" : "EFAMEINSA";
    const r = await enviarCorreoN8n({
      para: para.join(", "),
      asunto: `${empresa === "OPEN" ? "OPEN" : "EFAMEINSA"} // ${d.titulo}`,
      html: armarAviso({
        empresa,
        paraArea: d.areas.map((a) => ETIQUETA_AREA[a]).join(" y "),
        titulo: d.titulo,
        cuerpo: d.cuerpo,
        enlace: d.url ? enlaceApp(d.url) : undefined,
        tabla,
      }),
      deNombre: `${marca} · CRM`,
    });
    if (r.error) console.error("correoAlArea:", r.error);
  } catch (e) {
    console.error("correoAlArea: no se pudo mandar el aviso por correo:", e instanceof Error ? e.message : e);
  }
}
