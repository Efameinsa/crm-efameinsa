import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { ReporteDiarioPdf } from "@/lib/pdf/reporte-diario-pdf";
import { cargarPotenciales, lunesSemana, resumirSemana } from "@/lib/potenciales-semana";
import { cargarEventosPostventa, eventosDelDia, pendientesDePostventa, type PendientesPostventa } from "@/lib/agenda-postventa-datos";
import { etiquetaEvento } from "@/lib/calendario-postventa";
import { TITULO_PREVENTIVOS_POR_OFRECER } from "@/lib/preventivo";

// PDF del cierre del día del comercial. La autorización real la hace la
// función SQL (el propio comercial o backoffice); acá solo se comprueba que
// haya sesión y se arma el documento.
//
// Se lee una sola vez al cargar el módulo, no en cada request.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const fechaParam = url.searchParams.get("fecha");
  const fecha = fechaParam && RE_FECHA.test(fechaParam) ? fechaParam : hoyLima();
  // Sin ?comercial, cada quien baja el suyo: es el caso normal del comercial
  // que cierra su día. Gerencia puede pedir el de otro pasándolo explícito.
  const comercialId = url.searchParams.get("comercial") ?? user.id;

  const { data, error } = await supabase.rpc("reporte_diario_comercial", {
    p_comercial: comercialId,
    p_fecha: fecha,
  });
  if (error) {
    const noAutorizado = /No autorizado/i.test(error.message);
    return NextResponse.json(
      { error: noAutorizado ? "No autorizado" : "No se pudo generar el reporte" },
      { status: noAutorizado ? 403 : 500 },
    );
  }

  const r = data as unknown as Parameters<typeof ReporteDiarioPdf>[0] & { fecha: string };

  // La proyección de la semana (ing. Carlos, 27-08). Se calcula ACÁ y no dentro
  // de `reporte_diario_comercial`: esa función ya se redefinió una decena de
  // veces y es la que sostiene el informe que gerencia recibe todos los días.
  // Sumarle un bloque más por una sección nueva es apostar el reporte entero;
  // desde acá, si algo falla, el PDF sale igual sin esa sección.
  let proyeccion;
  try {
    const lunes = lunesSemana(fecha);
    const { potenciales } = await cargarPotenciales(lunes, comercialId);
    proyeccion = resumirSemana(lunes, potenciales);
  } catch {
    proyeccion = undefined;
  }
  // POSTVENTA (Carlos, 21-09, mirando la agenda de Rubí): «así como los
  // comerciales tienen lo proyectado para el día siguiente, que también
  // aparezca: despachos, atenciones técnicas, llamadas… y sus pedidos, para
  // ver los procesos, que salgan sus despachados». Y «otras gestiones», lo
  // que se digita en la bitácora como en Central. Se calcula ACÁ, igual que
  // la proyección, por la misma razón: la función SQL no se toca.
  let pendientesPostventa: { titulo: string; filas: { cliente: string; detalle: string | null }[] }[] | undefined;
  try {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("id, rol, es_postventa, hace_postventa")
      .eq("id", comercialId)
      .maybeSingle();
    if (perfil?.es_postventa) {
      const manana = r.planificacion_manana.fecha;
      const [eventos, { data: bitacora }, pendientes] = await Promise.all([
        cargarEventosPostventa(supabase, perfil, fecha, manana),
        supabase.from("bitacora_dia").select("orden, texto").eq("perfil_id", comercialId).eq("fecha", fecha).order("orden"),
        pendientesDePostventa(supabase),
      ]);
      // 5b. PENDIENTES DEL ÁREA (22-09, ítem 6): mismos bloques que el panel
      // «Pendiente por tipo» de la agenda, para que el PDF diga lo mismo.
      const ROTULO: Record<keyof PendientesPostventa, string> = {
        despachosSinFecha: "Despachos sin fecha todavía",
        despachosConFecha: "Despachos programados, sin salir",
        videollamadas: "Videollamadas de preinstalación (Lima)",
        puestasEnMarcha: "Puestas en marcha pendientes",
        atencionesSinProgramar: "Atenciones sin programar",
        preventivosPorVencer: TITULO_PREVENTIVOS_POR_OFRECER,
      };
      pendientesPostventa = (Object.keys(ROTULO) as (keyof PendientesPostventa)[]).map((clave) => ({
        titulo: ROTULO[clave],
        filas: pendientes[clave].map((f) => ({ cliente: f.cliente, detalle: f.detalle })),
      }));
      const aFila = (e: (typeof eventos)[number]) => ({
        hora: e.hora,
        titulo: e.cliente,
        tipo: etiquetaEvento(e.tipo),
        detalle: e.titulo + (e.ubicacion ? ` · ${e.ubicacion}` : ""),
      });
      // Hoy: lo del circuito (despachado, atendido, visitado) y la bitácora,
      // en «actividades complementarias»; ya está tal cual en el calendario.
      r.complementarias = [
        ...eventosDelDia(eventos, fecha).map((e) => ({
          hora: e.hora,
          titulo: e.origen === "tarea" ? e.titulo : `${etiquetaEvento(e.tipo)} · ${e.cliente} · ${e.titulo}`,
        })),
        ...(bitacora ?? []).map((b) => ({ hora: null, titulo: b.texto })),
        ...r.complementarias,
      ];
      r.resumen = { ...r.resumen, complementarias: r.complementarias.length };
      // Mañana: al lado de las gestiones y tareas que ya trae la función SQL.
      // Las tareas propias y los casos de la cartera propia ya vienen de ahí:
      // no se repiten (el calendario trae los casos de toda el área).
      const yaEstan = new Set(r.planificacion_manana.gestiones.map((g) => `${g.hora ?? ""}|${g.cliente}`));
      r.planificacion_manana = {
        ...r.planificacion_manana,
        tareas: [
          ...r.planificacion_manana.tareas,
          ...eventosDelDia(eventos, manana)
            .filter((e) => e.origen !== "tarea" && !(e.origen === "caso" && yaEstan.has(`${e.hora ?? ""}|${e.cliente}`)))
            .map(aFila),
        ],
      };
      r.agenda = { ...r.agenda, manana: r.planificacion_manana.gestiones.length + r.planificacion_manana.tareas.length };
    }
  } catch {
    // Sin la agenda del área, pero con reporte.
  }
  const fechaLarga = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const buffer = await renderToBuffer(
    <ReporteDiarioPdf
      logoBuffer={LOGO_BUFFER}
      fecha={fechaLarga}
      comercial={r.comercial}
      resumen={r.resumen}
      seguimientos={r.seguimientos}
      cotizaciones={r.cotizaciones}
      ventas={r.ventas}
      leads={r.leads}
      complementarias={r.complementarias}
      agenda={r.agenda}
      planificacion_manana={r.planificacion_manana}
      proyeccion={proyeccion}
      pendientesPostventa={pendientesPostventa}
    />,
  );

  // Queda grabado, y la última generación del día pisa a la anterior: «la que
  // se genere al cierre del día debería ser la que queda» (Carlos, 28-08). Se
  // guarda DESPUÉS de dibujar el PDF y sin bloquear la respuesta si falla: el
  // reporte que la persona está esperando no se cae porque el registro no pudo
  // escribirse.
  try {
    await supabase.rpc("guardar_reporte_diario", {
      p_comercial: comercialId,
      p_fecha: fecha,
      p_contenido: { ...r, proyeccion, fecha_larga: fechaLarga },
    });
  } catch {
    // Sin registro, pero con reporte. Es el orden correcto de prioridades.
  }

  const nombre = `Reporte ${r.comercial.codigo ?? ""} ${fecha}.pdf`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se abre en el visor del navegador y desde ahí se descarga o
      // se adjunta al correo, que es el flujo que describió gerencia.
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}
