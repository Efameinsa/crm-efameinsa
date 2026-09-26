import { AlertTriangle, ClipboardCheck, FileText, Truck } from "lucide-react";
import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { ETIQUETA_TIPO_PEDIDO, faltanFotosDeCarga, type ServicioPostventa, type TipoPedido } from "@/lib/postventa";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { Chips, FilaTrabajo, Grupo, Numero, Vacio, haceCuanto, type DatosFila, type Tono } from "@/components/propuesta/kit";

/**
 * LOS PEDIDOS DEL ALMACÉN, POR LO QUE HAY QUE HACER (propuesta v2, 23-09).
 *
 * La lista de siempre (almacen/pedidos) dice en qué está cada pedido; esta los
 * ordena por el trabajo que le toca al almacén: probar y embalar, preparar los
 * despachos con fecha, despachar lo que ya tiene apertura y subir la guía de
 * lo que salió. Lo atrasado arriba. Sin cifras: el almacén no ve precios.
 * Todo se hace en el pedido; acá solo se lee.
 */
type Cliente = Awaited<ReturnType<typeof createClient>>;
type Clave = "despachar" | "probar" | "fotos" | "guia" | "sinApertura" | "adelantar";

const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();
/** «03/06», o «10/12/2025» si no es de este año (hay fechas viejas del Excel). */
const ddmm = (f: string, hoy: string) => (f.slice(0, 4) === hoy.slice(0, 4) ? f.split("-").reverse().slice(0, 2).join("/") : f.split("-").reverse().join("/"));
const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
const POR_GRUPO = 6;

const GRUPOS: { clave: Clave; titulo: string; ayuda: string; tono: Tono }[] = [
  { clave: "despachar", titulo: "Por despachar", ayuda: "Tienen apertura de despacho: se pueden preparar y sacar. Lo atrasado y lo de hoy primero.", tono: "urgente" },
  { clave: "probar", titulo: "Probar y embalar", ayuda: "Postventa pidió la prueba: falta el protocolo y el check.", tono: "atencion" },
  // Auditoría 25-09: la lista de siempre lo avisaba y esta vista no.
  { clave: "fotos", titulo: "Salieron, faltan las fotos de la carga", ayuda: "Suba las fotos de la máquina puesta en el transporte.", tono: "atencion" },
  { clave: "guia", titulo: "Salieron, falta la guía", ayuda: "Suba la foto de la guía en la agencia.", tono: "atencion" },
  { clave: "sinApertura", titulo: "Con fecha, sin apertura", ayuda: "Postventa puso fecha pero no emitió la apertura: todavía no hay nada que preparar.", tono: "neutro" },
  { clave: "adelantar", titulo: "Para adelantar", ayuda: "Aprobados; postventa todavía no pidió la prueba.", tono: "neutro" },
];

const CAMPOS =
  "id, cliente_texto, equipo, fecha_despacho, despacho_hora, despachado_at, apertura_despacho_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, almacen_listo_at, agencia_at, guia, informe_cierre_id, pedido_ejecutado_at, aprobado_at, updated_at, salida_fotos, tipo_pedido, modalidad, entrega_en, guia_confirmada_at";

async function clasificar(supabase: Cliente): Promise<Record<Clave, DatosFila[]>> {
  const hoy = hoyLima();
  const { data } = await supabase
    .from("servicios_postventa")
    .select(CAMPOS)
    .eq("completado", false)
    .is("cerrado_at", null)
    .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
    .limit(2000);
  const vivos = (data ?? []) as unknown as ServicioPostventa[];
  // El mismo criterio que «Mi día» y la lista de siempre (auditoría 25-09: los conteos no coincidían).
  const probado = (s: ServicioPostventa) => s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
  // Qué es y a dónde va, como en la lista de siempre (auditoría 25-09): el
  // tipo de pedido y si es de provincia o se recoge en planta.
  const base = (s: ServicioPostventa) => {
    const tipo = s.tipo_pedido ? ETIQUETA_TIPO_PEDIDO[s.tipo_pedido as TipoPedido] : null;
    const destino = (s as { entrega_en?: string | null }).entrega_en === "planta" ? "recoge en planta" : s.modalidad === "provincia" ? "provincia" : null;
    return {
      titulo: sinRuc(s.cliente_texto),
      href: `/almacen/pedidos/${s.id}`,
      sub: [primeraLinea(s.equipo) || "Pedido", tipo, destino].filter(Boolean).join(" · "),
    };
  };
  const out: Record<Clave, (DatosFila & { orden: string })[]> = { despachar: [], probar: [], fotos: [], guia: [], sinApertura: [], adelantar: [] };

  for (const s of vivos) {
    const pedido = `/almacen/pedidos/${s.id}`;
    if (s.despachado_at) {
      if (faltanFotosDeCarga(s)) {
        out.fotos.push({ ...base(s), orden: s.despachado_at, estado: { texto: "Salió · faltan fotos de la carga", tono: "atencion" }, edad: `Salió ${haceCuanto(s.despachado_at)}`, tono: "atencion", accion: { etiqueta: "Subir las fotos", href: pedido } });
      }
      if (!s.guia && !s.agencia_at) {
        out.guia.push({ ...base(s), orden: s.despachado_at, estado: { texto: "Salió · falta la guía", tono: "atencion" }, edad: `Salió ${haceCuanto(s.despachado_at)}`, tono: "atencion", accion: { etiqueta: "Subir la guía", href: pedido } });
      }
      continue;
    }

    if (s.prueba_solicitada_at && !probado(s)) {
      const dias = diasEntre(diaLima(s.prueba_solicitada_at), hoy);
      const tono: Tono = dias >= 2 ? "urgente" : dias >= 1 ? "atencion" : "neutro";
      out.probar.push({
        ...base(s),
        orden: s.prueba_solicitada_at,
        estado: { texto: dias >= 2 ? "Atrasada" : "Por probar", tono: dias >= 2 ? "urgente" : "atencion" },
        espera: "Postventa espera la prueba",
        edad: `Pedida ${haceCuanto(s.prueba_solicitada_at)}`,
        edadTono: tono,
        tono,
        accion: { etiqueta: "Registrar la prueba", href: pedido },
      });
    }

    // EL DOBLE FILTRO (Carlos, 22-09): con fecha pero sin apertura, postventa
    // no ha cumplido y no hay nada que preparar: va aparte y abajo.
    const f = s.fecha_despacho;
    const hora = s.despacho_hora ? ` · ${String(s.despacho_hora).slice(0, 5)}` : "";
    if (s.apertura_despacho_at) {
      const estado = !f
        ? { texto: "Sin fecha todavía", tono: "info" as Tono }
        : f < hoy
          ? { texto: `Atrasado · era el ${ddmm(f, hoy)}`, tono: "urgente" as Tono }
          : f === hoy
            ? { texto: `Sale hoy${hora}`, tono: "atencion" as Tono }
            : { texto: `Para el ${ddmm(f, hoy)}${hora}`, tono: "neutro" as Tono };
      const listo = Boolean(s.almacen_listo_at);
      out.despachar.push({
        ...base(s),
        // Los que tienen fecha, por fecha; los sin fecha, al final.
        orden: f ? `${f}${hora}` : `9999${s.apertura_despacho_at}`,
        estado,
        dato: (
          <>
            {listo && <span className="text-[11px] font-semibold text-[#1E7F4F]">Listo para salir</span>}
            <span className={`text-[11px] font-medium ${(s as { guia_confirmada_at?: string | null }).guia_confirmada_at ? "text-[#1E7F4F]" : "text-amber-700"}`}>
              {(s as { guia_confirmada_at?: string | null }).guia_confirmada_at ? "Guía confirmada por Finanzas" : "Falta que Finanzas confirme la guía"}
            </span>
          </>
        ),
        edad: `Apertura ${haceCuanto(s.apertura_despacho_at)}`,
        tono: estado.tono === "neutro" || estado.tono === "info" ? (listo ? "ok" : "info") : estado.tono,
        accion: listo || !f ? { etiqueta: "Despachar", href: pedido } : { etiqueta: "Confirmar que está listo", href: pedido },
      });
    } else if (f) {
      out.sinApertura.push({
        ...base(s),
        orden: `${f}${hora}`,
        estado: { texto: f < hoy ? `Tenía fecha el ${ddmm(f, hoy)}` : f === hoy ? `Fecha: hoy${hora}` : `Para el ${ddmm(f, hoy)}${hora}`, tono: "neutro" },
        espera: "Esperando a postventa: falta la apertura de despacho",
        accion: { etiqueta: "Ver el pedido", href: pedido },
      });
    }

    if (s.aprobado_at && !s.prueba_solicitada_at && !probado(s) && s.informe_cierre_id) {
      out.adelantar.push({ ...base(s), orden: s.aprobado_at, estado: { texto: "Aprobado", tono: "neutro" }, espera: "Postventa todavía no pidió la prueba", edad: `Aprobado ${haceCuanto(s.aprobado_at)}`, accion: { etiqueta: "Ver el pedido", href: pedido } });
    }
  }
  // Lo más viejo (o la fecha más cercana) arriba.
  for (const k of Object.keys(out) as Clave[]) out[k].sort((a, b) => a.orden.localeCompare(b.orden));
  return out;
}

/** El número de la pestaña: lo que el almacén puede mover (despachar con apertura, probar, guía). */
export async function conteo(supabase: Cliente): Promise<number> {
  const g = await clasificar(supabase);
  return g.despachar.length + g.probar.length + g.guia.length;
}

export default async function AlmacenPedidos({ searchParams, base }: PropsVista) {
  const supabase = await createClient();
  const grupos = await clasificar(supabase);
  const ver = GRUPOS.some((g) => g.clave === searchParams.ver) ? (searchParams.ver as Clave) : null;
  const total = GRUPOS.reduce((n, g) => n + grupos[g.clave].length, 0);
  const url = (clave: Clave | null) => (clave ? `${base}?ver=${clave}` : base);
  const atrasados = grupos.despachar.filter((f) => f.estado?.tono === "urgente").length + grupos.probar.filter((f) => f.estado?.tono === "urgente").length;
  const deHoy = grupos.despachar.filter((f) => f.estado?.texto.startsWith("Sale hoy")).length;

  if (total === 0) {
    return (
      <Vacio
        titulo="El almacén no tiene pedidos pendientes"
        porque="Aparecen acá cuando postventa pide una prueba, pone fecha de despacho o emite la apertura. También los que salieron sin guía."
        accion={{ etiqueta: "Ver todos los pedidos", href: "/almacen/pedidos" }}
      />
    );
  }

  const visibles = ver ? GRUPOS.filter((g) => g.clave === ver) : GRUPOS;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero icono={AlertTriangle} etiqueta="Atrasados" valor={atrasados} sub="Despachos con apertura o pruebas fuera de fecha" tono="urgente" href={url(grupos.despachar.some((f) => f.estado?.tono === "urgente") ? "despachar" : "probar")} />
        <Numero icono={Truck} etiqueta="Salen hoy" valor={deHoy} sub="Con apertura y fecha de hoy" tono="atencion" href={url("despachar")} />
        <Numero icono={ClipboardCheck} etiqueta="Por probar" valor={grupos.probar.length} sub="Postventa pidió la prueba" tono="atencion" href={url("probar")} />
        <Numero icono={FileText} etiqueta="Falta la guía" valor={grupos.guia.length} sub="Ya salieron" tono="atencion" href={url("guia")} />
      </div>

      <Chips
        etiqueta="Qué mostrar"
        opciones={[
          { etiqueta: "Todo", href: url(null), activa: !ver, conteo: total },
          ...GRUPOS.map((g) => ({ etiqueta: g.titulo, href: url(g.clave), activa: ver === g.clave, conteo: grupos[g.clave].length })),
        ]}
      />

      {visibles.map((g) => {
        const lista = grupos[g.clave];
        if (lista.length === 0) {
          return ver ? (
            <Vacio key={g.clave} titulo={`Nada en «${g.titulo}»`} porque={g.ayuda} accion={{ etiqueta: "Ver todo", href: url(null) }} />
          ) : null;
        }
        const mostrar = ver ? lista : lista.slice(0, POR_GRUPO);
        return (
          <Grupo
            key={g.clave}
            titulo={g.titulo}
            ayuda={g.ayuda}
            conteo={lista.length}
            tono={g.tono}
            pie={
              lista.length > mostrar.length ? (
                <Link href={url(g.clave)} className="font-semibold text-primary hover:underline">
                  Ver los {lista.length} →
                </Link>
              ) : undefined
            }
          >
            {mostrar.map((f) => (
              <FilaTrabajo key={f.href} f={f} />
            ))}
          </Grupo>
        );
      })}
    </div>
  );
}
