import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { casilleroDelPedido } from "@/lib/dia-postventa";
import { ETIQUETA_TIPO_PEDIDO, circuitoDe, puedeVerPrecios, pruebaSinPedir, type ServicioPostventa, type TipoPedido } from "@/lib/postventa";
import { RegistrarSeguimientoBoton } from "@/components/crm/registrar-seguimiento-boton";
import { cn } from "@/lib/utils";
import { preventivosPorOfrecer } from "@/lib/agenda-postventa-datos";
import { DIAS_AVISO_PREVENTIVO, REGLA_PREVENTIVO } from "@/lib/preventivo";

export const dynamic = "force-dynamic";

/**
 * EL MACRO DEL ÁREA (Carlos, 15-09; 0239).
 *
 * «Quiero ver el macro, mejor dicho. Dime cuántos clientes tenemos por
 * despachar… tengo 10 atenciones técnicas pendientes, tengo 10 puestas en
 * marcha pendientes por calendarizar, tengo que derivar 20 llamadas. Aquí te
 * tiene que dar todo. Y se filtra, se filtra, se filtra». Y el porqué: «si
 * no, va a quedar en la memoria de cada uno de nosotros».
 *
 * Cada número es un enlace a la pantalla que ya lo trabaja, con el filtro
 * puesto. Abajo, la lista que pidió textual: los clientes antiguos
 * pendientes de despacho, para llamarlos.
 */
interface Cuadro {
  titulo: string;
  numero: number;
  ayuda: string;
  href: string;
  alerta?: boolean;
}

function Tarjeta({ c }: { c: Cuadro }) {
  return (
    <Link
      href={c.href}
      className={cn(
        "flex flex-col rounded-lg border p-3 transition-colors hover:bg-accent",
        c.alerta && c.numero > 0 ? "border-destructive/40 bg-destructive/5" : "border-border",
      )}
    >
      <span className={cn("text-2xl font-bold leading-none tabular-nums", c.alerta && c.numero > 0 ? "text-destructive" : "text-foreground")}>
        {c.numero}
      </span>
      <span className="mt-1.5 text-xs font-semibold text-foreground">{c.titulo}</span>
      <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.ayuda}</span>
    </Link>
  );
}

export default async function MacroPostventaPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = hoyLima();
  const enUnaSemana = new Date(new Date(hoy + "T12:00:00-05:00").getTime() + 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const [{ data: pedidos }, { data: atenciones }, { data: casos }, { data: visitas }, { data: sinLlamar }, preventivos, { data: aperturasData }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, cuenta_id, equipo, completado, cerrado_at, despachado_at, puesta_en_marcha, apertura_despacho_at, fecha_despacho, aprobado_at, informe_cierre_id, pedido_ejecutado_at, origen, tipo_pedido, entrega_en, con_instalacion, fecha_confirmacion, monto, moneda, despacho_nota, updated_at, prueba_lista_at, prueba_solicitada_at, prueba_embalaje")
      .eq("completado", false)
      .is("cerrado_at", null)
      .limit(2000),
    supabase
      .from("atenciones")
      .select("id, tipo, etapa, clasificacion, tomada_at, programada_at, cerrado_at, informe_servicio_id, solicitado_at")
      .is("cerrado_at", null)
      .limit(2000),
    supabase
      .from("oportunidades")
      .select("id, tipo_postventa, etapa, proxima_accion_at, cerrada_at")
      .not("tipo_postventa", "is", null)
      .is("cerrada_at", null)
      .not("etapa", "in", '("venta","rechazada","derivada","historico")')
      .limit(2000),
    supabase.from("visitas_planta").select("id, fecha").gte("fecha", hoy).lte("fecha", enUnaSemana).is("cancelada_at", null),
    // Los clientes antiguos por llamar: pedidos vivos sin fecha, con el
    // teléfono de la ficha a mano.
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, cuenta_id, equipo, fecha_confirmacion, despacho_nota, origen, informe_cierre_id, pedido_ejecutado_at, cuentas(razon_social, contactos(nombre, telefono, es_principal))")
      .eq("completado", false)
      .is("cerrado_at", null)
      .is("fecha_despacho", null)
      .is("despachado_at", null)
      .order("fecha_confirmacion", { ascending: true, nullsFirst: false })
      .limit(300),
    // Gerencia, 23-09: «Cada 3 meses se debe alertar para empezar el proceso
    // de envío de propuestas y concluir cierres antes de los 4 meses». La
    // misma lista que «Pendiente por tipo» de la agenda (sin caso abierto).
    preventivosPorOfrecer(supabase),
    // Las aperturas al almacén (0281): las que esperan la revisión de postventa.
    supabase.from("aperturas_llamada").select("id, tomada_at, informe_at, revisada_at, enviada_cliente_at").is("anulada_at", null).is("enviada_cliente_at", null).limit(500),
  ]);
  const aperturasAbiertas = (aperturasData ?? []) as { id: string; tomada_at: string | null; informe_at: string | null; revisada_at: string | null }[];

  // Lo que todavía no lanzó Central no es trabajo del área (0237).
  const vivos = ((pedidos ?? []) as unknown as ServicioPostventa[]).filter((s) => !s.informe_cierre_id || s.pedido_ejecutado_at);
  const porCasillero = (c: string) => vivos.filter((s) => casilleroDelPedido(s, hoy) === c);
  const atrasados = vivos.filter((s) => s.fecha_despacho && s.fecha_despacho < hoy && !s.despachado_at);
  const porAprobar = vivos.filter((s) => s.informe_cierre_id && !s.aprobado_at);
  const sinPedirPrueba = vivos.filter(pruebaSinPedir);
  const porTipo = (t: TipoPedido) => vivos.filter((s) => circuitoDe(s).tipo === t).length;

  const at = (atenciones ?? []) as unknown as { id: string; tipo: string; etapa: string; clasificacion: string | null; tomada_at: string | null; programada_at: string | null; informe_servicio_id: string | null; solicitado_at: string }[];
  const sinTomar = at.filter((a) => a.etapa === "registro" && !a.tomada_at);
  const enCentral = at.filter((a) => a.etapa === "solicitud");
  const porProgramar = at.filter((a) => ["registro", "diagnostico"].includes(a.etapa) && a.tomada_at && !a.programada_at);
  const programadas = at.filter((a) => a.etapa === "planificacion" || (a.programada_at && ["atencion"].includes(a.etapa)));
  const enCierre = at.filter((a) => ["pruebas", "conformidad", "cierre"].includes(a.etapa));
  const sinInforme = at.filter((a) => ["atencion", "pruebas", "conformidad", "cierre"].includes(a.etapa) && !a.informe_servicio_id);
  const puestas = at.filter((a) => a.tipo === "puesta_en_marcha");
  const garantias = at.filter((a) => a.clasificacion === "garantia");

  const cs = (casos ?? []) as unknown as { id: string; tipo_postventa: string; etapa: string; proxima_accion_at: string | null }[];
  const casosVencidos = cs.filter((c) => c.proxima_accion_at && c.proxima_accion_at < hoy);
  const casosSinFecha = cs.filter((c) => !c.proxima_accion_at);

  const pedidosCuadros: Cuadro[] = [
    { titulo: "Por aprobar", numero: porAprobar.length, ayuda: "Central los lanzó; el área todavía no los tomó.", href: "/postventa/control", alerta: true },
    { titulo: "Prueba y embalaje sin pedir", numero: sinPedirPrueba.length, ayuda: "Nadie se lo pidió al almacén. No espera al pago: se pide ya.", href: "/postventa/control?vista=paso&falta=prueba_sin_pedir", alerta: true },
    { titulo: "Sin apertura de despacho", numero: porCasillero("sin_apertura").length, ayuda: "Falta pago, prueba, plano o dirección.", href: "/postventa/control?vista=paso" },
    { titulo: "Listos, sin fecha", numero: porCasillero("listo_sin_fecha").length, ayuda: "Con apertura: solo falta decidir cuándo salen.", href: "/postventa/control?vista=despachos&estado=sin_fecha" },
    { titulo: "Despachos programados", numero: porCasillero("despacho_programado").length, ayuda: "Con día puesto y el camión sin salir.", href: "/postventa/control?vista=despachos" },
    { titulo: "Atrasados", numero: atrasados.length, ayuda: "Tenían fecha y no salieron.", href: "/postventa/control?vista=despachos&estado=atrasados", alerta: true },
    { titulo: "Despachados, falta la puesta en marcha", numero: porCasillero("puesta_pendiente").length, ayuda: "El equipo salió; el cliente aún no lo tiene andando.", href: "/postventa/control" },
  ];
  const atencionesCuadros: Cuadro[] = [
    { titulo: "Casos sin tomar", numero: sinTomar.length, ayuda: "Central los devolvió y nadie los tomó.", href: "/postventa/atenciones?filtro=sin_atender", alerta: true },
    { titulo: "Esperando a Central", numero: enCentral.length, ayuda: "Registrados y derivados; Central decide.", href: "/postventa/atenciones" },
    { titulo: "Por programar", numero: porProgramar.length, ayuda: "Tomados, sin día ni técnico.", href: "/postventa/atenciones?filtro=sin_programar" },
    { titulo: "Programadas", numero: programadas.length, ayuda: "Con día, hora y técnico. Están en la agenda.", href: "/postventa/agenda" },
    { titulo: "Puestas en marcha en curso", numero: puestas.length, ayuda: "Casos de puesta en marcha abiertos, en cualquier etapa.", href: "/postventa/atenciones" },
    { titulo: "Garantías en curso", numero: garantias.length, ayuda: "Atenciones clasificadas como garantía.", href: "/postventa/atenciones" },
    { titulo: "En pruebas, conformidad o cierre", numero: enCierre.length, ayuda: "El técnico ya fue; falta cerrar bien.", href: "/postventa/atenciones" },
    { titulo: "Sin informe técnico", numero: sinInforme.length, ayuda: "Atendidas y sin el informe subido.", href: "/postventa/atenciones", alerta: true },
    { titulo: "Aperturas: informe por revisar", numero: aperturasAbiertas.filter((a) => a.informe_at).length, ayuda: "El almacén ya hizo la llamada; falta la versión para el cliente.", href: "/postventa/aperturas", alerta: true },
    { titulo: "Aperturas que el almacén no tomó", numero: aperturasAbiertas.filter((a) => !a.tomada_at).length, ayuda: "Enviadas y sin el check del almacén.", href: "/postventa/aperturas" },
  ];
  const casosCuadros: Cuadro[] = [
    { titulo: "Ventas de servicio abiertas", numero: cs.length, ayuda: "Mantenimientos, repuestos y seguimientos en curso.", href: "/postventa/atenciones?ver=casos" },
    { titulo: "Con la fecha vencida", numero: casosVencidos.length, ayuda: "Tenían «qué sigue» y ya pasó.", href: "/postventa/atenciones?ver=casos", alerta: true },
    { titulo: "Sin qué sigue", numero: casosSinFecha.length, ayuda: "Abiertos sin próxima acción agendada.", href: "/postventa/atenciones?ver=casos" },
    {
      titulo: "Preventivos por ofrecer",
      numero: preventivos.length,
      ayuda: `Vencen en ${DIAS_AVISO_PREVENTIVO} días o ya vencieron, sin caso abierto. ${REGLA_PREVENTIVO}`,
      href: "/postventa/agenda",
      alerta: true,
    },
    { titulo: "Visitas a planta esta semana", numero: (visitas ?? []).length, ayuda: "Clientes que vienen; Central las imprime.", href: "/postventa/agenda" },
  ];

  const verPrecios = puedeVerPrecios(perfil);
  const porLlamar = ((sinLlamar ?? []) as unknown as {
    id: string; cliente_texto: string | null; cuenta_id: string | null; equipo: string | null; fecha_confirmacion: string | null; despacho_nota: string | null; origen: string; informe_cierre_id: string | null; pedido_ejecutado_at: string | null;
    cuentas: { razon_social: string; contactos: { nombre: string; telefono: string | null; es_principal: boolean }[] } | null;
  }[]).filter((s) => !s.informe_cierre_id || s.pedido_ejecutado_at);

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Pedidos en curso">
        <p className="mb-2 text-xs text-muted-foreground">
          {vivos.length} en total ·{" "}
          {(Object.keys(ETIQUETA_TIPO_PEDIDO) as TipoPedido[])
            .map((t) => `${porTipo(t)} de ${ETIQUETA_TIPO_PEDIDO[t].toLowerCase()}`)
            .join(" · ")}
          . Cada número abre la pantalla con ese filtro.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pedidosCuadros.map((c) => (
            <Tarjeta key={c.titulo} c={c} />
          ))}
        </div>
      </SeccionPanel>

      <SeccionPanel titulo="Atenciones técnicas">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {atencionesCuadros.map((c) => (
            <Tarjeta key={c.titulo} c={c} />
          ))}
        </div>
      </SeccionPanel>

      <SeccionPanel titulo="Ventas de servicio y visitas">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {casosCuadros.map((c) => (
            <Tarjeta key={c.titulo} c={c} />
          ))}
        </div>
      </SeccionPanel>

      <SeccionPanel titulo="Clientes con equipo pendiente de despacho, para llamar">
        <p className="mb-2 text-xs text-muted-foreground">
          Pedidos vivos sin fecha de despacho, del más antiguo al más nuevo, con el teléfono de la ficha. Carlos,
          15-09: «llamemos a los clientes antiguos que están pendientes por despacharle para poder comenzar la
          gestión». Lo que se hable se anota con «Registrar seguimiento».
        </p>
        {porLlamar.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay pedidos vivos sin fecha de despacho.</p>
        ) : (
          <ul className="divide-y divide-border">
            {porLlamar.map((s) => {
              const contacto = s.cuentas?.contactos?.find((c) => c.es_principal && c.telefono) ?? s.cuentas?.contactos?.find((c) => c.telefono) ?? null;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                  <span className="w-24 flex-none text-xs tabular-nums text-muted-foreground">{s.fecha_confirmacion ?? "sin fecha"}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/postventa/pedidos/${s.id}`} className="font-semibold text-foreground hover:underline">
                      {s.cuentas?.razon_social ?? s.cliente_texto ?? "Cliente sin nombre"}
                    </Link>
                    <span className="line-clamp-2 break-words text-xs text-muted-foreground">{s.equipo}{s.despacho_nota ? ` · ${s.despacho_nota}` : ""}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {contacto ? (
                      <a href={`tel:${contacto.telefono}`} className="font-medium text-primary hover:underline">
                        {contacto.telefono}
                      </a>
                    ) : (
                      "sin teléfono en la ficha"
                    )}
                    {contacto?.nombre ? ` · ${contacto.nombre}` : ""}
                  </span>
                  {s.cuenta_id && <RegistrarSeguimientoBoton cuentaId={s.cuenta_id} compacto />}
                </li>
              );
            })}
          </ul>
        )}
        {!verPrecios && <p className="mt-2 text-[11px] text-muted-foreground">Sin montos: el área no ve precios.</p>}
      </SeccionPanel>
    </div>
  );
}
