import { requerirPerfil } from "@/lib/auth";
import { RefrescoEnVivo } from "@/components/crm/refresco-en-vivo";
import { createClient } from "@/lib/supabase/server";
import { contarAtencionesAbiertas, contarBandejaMiDia } from "@/lib/contadores-postventa";
import { BarraLateral } from "@/components/crm/barra-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";
import { CalloutActivarNotificaciones } from "@/components/crm/callout-activar-notificaciones";
import { AplicacionInstalable } from "@/components/crm/aplicacion-instalable";
import { AvisoGestionesSinSubir } from "@/components/crm/aviso-gestiones-sin-subir";
import { UbicacionDeCampo } from "@/components/crm/ubicacion-de-campo";
import { PuenteNativo } from "@/components/crm/puente-nativo";
import { VigilanteConducta } from "@/components/crm/vigilante-conducta";
import { seVigila } from "@/lib/seguridad-conducta";
import { RastreoNativo } from "@/components/crm/rastreo-nativo";
import { seRastrea } from "@/lib/campo-rastreo";
import { AvisoNuevaVersion } from "@/components/crm/aviso-nueva-version";
import { VigilanteDeCuenta } from "@/components/crm/vigilante-de-cuenta";
import { AsistenteFlotante } from "@/components/crm/asistente-flotante";
import { ComunicadoDeGerencia, type ComunicadoPendiente } from "@/components/crm/comunicado-de-gerencia";
import { AvisoSugerenciaResuelta, type SugerenciaResuelta } from "@/components/crm/aviso-sugerencia-resuelta";
import { asistenteEncendido } from "@/lib/asistente/herramientas";
import { cookies, headers } from "next/headers";
import { COOKIE_AUDITORIA, decodificarInfoAuditoria, ranuraDeHost } from "@/lib/auditoria";
import { CABECERA_DEMO, COOKIE_VISTA } from "@/lib/solo-lectura";
import { MarcoPropuesta } from "@/components/propuesta/marco-propuesta";
import { usaVistaNueva } from "@/lib/propuesta/vista";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  // La franja de auditoría (0160): en ver1…ver9 la sesión es de otra persona
  // y hay que decirlo en todas las pantallas, arriba, sin que se pueda cerrar.
  const [cabeceras, tarro] = await Promise.all([headers(), cookies()]);
  const ranuraAuditoria = ranuraDeHost(cabeceras.get("host"));
  const auditoria = ranuraAuditoria ? decodificarInfoAuditoria(tarro.get(COOKIE_AUDITORIA)?.value) : null;

  // LA PROPUESTA DE NAVEGACIÓN (23-09). Una cuenta de demostración ve el CRM
  // de la cuenta original, en solo lectura, dentro del marco nuevo; con
  // «Ver cómo es hoy» vuelve al marco actual para comparar.
  const demo = Boolean(cabeceras.get(CABECERA_DEMO));
  const vistaNueva = usaVistaNueva(demo, tarro.get(COOKIE_VISTA)?.value);

  // Los contadores del menú (plan 23, etapa 5) solo se piden para quien ve
  // la sección Postventa de la barra: cuatro consultas `head: true` de más en
  // CADA navegación de gerencia, central o un comercial normal no le sirven a
  // nadie.
  const veSeccionPostventa = !vistaNueva && (Boolean(perfil.es_postventa) || Boolean(perfil.es_soporte));
  let contadorMiDia: number | undefined;
  let contadorAtenciones: number | undefined;
  const supabase = await createClient();
  // EL COMUNICADO DE GERENCIA (0232): el que toca mostrarle a esta persona al
  // entrar, si hay uno. Una consulta chica en cada navegación; casi siempre
  // vuelve vacía.
  const comunicadoP = demo ? Promise.resolve({ data: null }) : supabase.rpc("comunicado_pendiente").maybeSingle();
  // «Ya se solucionó lo que reportó» (0409): sus sugerencias marcadas «Hecha»
  // que todavía no vio. Casi siempre vuelve vacía.
  const resueltasP = demo || ranuraAuditoria
    ? Promise.resolve({ data: null })
    : supabase
        .from("sugerencias")
        .select("id, titulo, respuesta, respondida_at")
        .eq("autor_id", perfil.id)
        .eq("estado", "hecha")
        .is("solucion_vista_at", null)
        .order("respondida_at", { ascending: false })
        .limit(10);
  if (veSeccionPostventa) {
    [contadorMiDia, contadorAtenciones] = await Promise.all([
      contarBandejaMiDia(supabase, perfil.id),
      contarAtencionesAbiertas(supabase),
    ]);
  }
  const { data: comunicadoCrudo } = await comunicadoP;
  const comunicado = (comunicadoCrudo ?? null) as ComunicadoPendiente | null;
  const resueltas = ((await resueltasP).data ?? []) as SugerenciaResuelta[];
  // Un aviso a la vez: el comunicado de gerencia va primero.
  const avisoResueltas = !comunicado && resueltas.length > 0 ? <AvisoSugerenciaResuelta sugerencias={resueltas} /> : null;

  // LO QUE COMPARTEN LOS DOS MARCOS (25-09, antes del cambio a la vista nueva):
  // las franjas de auditoría y de práctica, los avisos de activar
  // notificaciones, instalar y gestiones sin subir, el refresco en vivo, la
  // versión nueva, el comunicado de gerencia y el asistente. La vista nueva
  // no los tenía porque solo la usaban cuentas de demostración.
  const franjaAuditoria = ranuraAuditoria ? (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-6 py-2 text-xs font-semibold text-amber-950">
      <span>
        Sesión de auditoría{auditoria ? ` de ${auditoria.auditor}` : ""} · viendo el CRM como{" "}
        <b>{auditoria?.auditado ?? perfil.nombre}</b> · ranura ver{ranuraAuditoria}
      </span>
      <span className="rounded-full bg-amber-950/10 px-2 py-0.5">Solo lectura: nada se registra a su nombre</span>
    </div>
  ) : null;
  const franjaPractica =
    perfil.es_prueba && !demo ? (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#6D28D9] px-6 py-2 text-white">
        <span className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
          PRUEBA
          <span className="text-xs font-semibold normal-case tracking-normal opacity-90">Cuenta de práctica de {perfil.nombre}</span>
        </span>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">Nada de esto cuenta: ni ventas, ni cotizaciones, ni metas</span>
      </div>
    ) : null;
  // PILOTO DE TRABAJO DE CAMPO (0363; Carlos, 01-10-2026): la ubicación del
  // navegador, solo para quien gerencia marcó. Nunca en la ranura de
  // auditoría: ahí el navegador es del auditor y se anotaría su ubicación a
  // nombre de la persona auditada.
  // Dentro de la app de Android el GPS lo hace el servicio nativo (24/7 por regla de
  // gerencia, 01-10-2026) y el aviso del navegador sobra: la app lo dice en su User-Agent y, si una petición sale sin él (service worker), en la cookie efa-app.
  const enApp = /EfameinsaApp\//.test(cabeceras.get("user-agent") ?? "") || tarro.get("efa-app")?.value === "android";
  // 02-10-2026 (Santos: «¿no se puede rastrear todas las cuentas que instalen la apk?»): en la app se
  // rastrea a TODA cuenta real (lib/campo-rastreo.ts), sin marcar a nadie; el aviso del navegador del
  // piloto de la 0363 sigue siendo solo para las marcadas.
  const ubicacionDeCampo =
    !ranuraAuditoria && !demo
      ? enApp
        ? seRastrea(perfil)
          ? <RastreoNativo />
          : null
        : perfil.trabajo_de_campo
          ? <UbicacionDeCampo />
          : null
      : null;
  const avisosArriba = !demo ? (
    <div className="flex flex-col gap-2 px-3 pt-3 empty:hidden sm:px-4 lg:px-6 lg:pt-4">
      {ubicacionDeCampo}
      <CalloutActivarNotificaciones />
      <AplicacionInstalable />
      <AvisoGestionesSinSubir />
    </div>
  ) : null;
  const alPie = (
    <>
      {/* La app de Android (01-10-2026): PDF, descargas, imprimir y enlaces. Fuera de la app no hace nada. */}
      <PuenteNativo />
      {/* Conducta sospechosa (0373): solo mira y avisa a gerencia, no bloquea. No en auditoría ni demostración, ni a gerencia/admin. */}
      {seVigila(perfil) && !ranuraAuditoria && !demo && <VigilanteConducta />}
      <RefrescoEnVivo versionInicial={process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"} />
      <AvisoNuevaVersion versionInicial={process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"} />
      {/* Otra cuenta entró en este mismo navegador (buzón, Ariana 09-10). En demostración y auditoría la sesión es a propósito de otra persona. */}
      {!demo && !ranuraAuditoria && <VigilanteDeCuenta userId={perfil.id} nombre={perfil.nombre} />}
      {comunicado && !perfil.es_prueba && !ranuraAuditoria && !demo && <ComunicadoDeGerencia comunicado={comunicado} />}
      {avisoResueltas}
      {["gerencia", "admin"].includes(perfil.rol) && asistenteEncendido() && <AsistenteFlotante nombre={perfil.nombre} />}
    </>
  );

  if (vistaNueva) {
    return (
      <MarcoPropuesta perfil={perfil} demo={demo} arriba={<>{franjaAuditoria}{franjaPractica}{avisosArriba}</>} alPie={alPie}>
        {children}
      </MarcoPropuesta>
    );
  }

  return (
    <div className="flex min-h-screen flex-1">
      <BarraLateral
        rol={perfil.rol}
        esPostventa={perfil.es_postventa ?? false}
        hacePostventa={perfil.hace_postventa ?? false}
        soloPreventivo={perfil.solo_preventivo ?? false}
        esSoporte={perfil.es_soporte ?? false}
        esOperaciones={perfil.es_operaciones ?? false}
        esAlmacen={perfil.es_almacen ?? false}
        contadorMiDia={contadorMiDia}
        contadorAtenciones={contadorAtenciones}
      />
      <div className="flex flex-1 flex-col">
        {ranuraAuditoria && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-6 py-2 text-xs font-semibold text-amber-950">
            <span>
              Sesión de auditoría{auditoria ? ` de ${auditoria.auditor}` : ""} · viendo el CRM como{" "}
              <b>{auditoria?.auditado ?? perfil.nombre}</b> · ranura ver{ranuraAuditoria}
            </span>
            <span className="rounded-full bg-amber-950/10 px-2 py-0.5">Solo lectura: nada se registra a su nombre</span>
          </div>
        )}
        {/* CUENTA DE PRUEBA, DICHO DE LEJOS. El tester recorre el CRM con una
            cuenta de práctica y todo lo que hace —cotizaciones incluidas— es
            de mentira, pero la pantalla se veía idéntica a la real. Una
            cotización de práctica al lado de una de verdad, sin nada que las
            separe, es una confusión esperando a ocurrir: alguien la manda a un
            cliente o la cuenta en un reporte.
            
            Va en franja, arriba de todo y en todas las pantallas, con el mismo
            patrón que la franja de auditoría (0160) porque resuelve el mismo
            problema: que nadie confunda lo que está mirando. */}
        {demo && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1B1A1D] px-6 py-2 text-xs text-white">
            <span>
              <b className="font-bold uppercase tracking-widest text-amber-300">Así es hoy</b>
              <span className="ml-2 opacity-90">Viendo el CRM como <b>{perfil.nombre}</b> · solo lectura, nada se guarda</span>
            </span>
            <span className="flex items-center gap-2">
              {/* Anclas a secas: son rutas con efecto y un <Link> las precargaría (ver barra-propuesta). */}
              <a href="/demo/salir" className="rounded-full px-2.5 py-1 hover:bg-white/10">Salir</a>
            </span>
          </div>
        )}
        {perfil.es_prueba && !demo && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#6D28D9] px-6 py-2 text-white">
            <span className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              PRUEBA
              <span className="text-xs font-semibold normal-case tracking-normal opacity-90">
                Cuenta de práctica de {perfil.nombre}
              </span>
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
              Nada de esto cuenta: ni ventas, ni cotizaciones, ni metas
            </span>
          </div>
        )}
        <EncabezadoUsuario perfil={perfil} demo={demo} />
        {/* El aviso para activar las notificaciones del equipo vive acá, no en
            «Mi día»: hasta el 25-08 solo se dibujaba en la pantalla del
            comercial, así que CENTRAL Y GERENCIA nunca tuvieron el botón — de
            ahí que Central llevara cero suscripciones aunque es quien más
            depende del aviso (la miden por la entrega rápida de leads). Se
            oculta solo cuando el permiso ya está concedido y hay suscripción
            viva, así que no estorba a quien ya lo activó. */}
        {/* Los dos avisos van juntos y en este orden: primero el que hace que
            los prospectos lleguen a tiempo, después el de instalar. Los dos se
            descartan y los dos se ocultan solos cuando ya no hacen falta, así
            que lo habitual es que acá no haya nada. `AplicacionInstalable`
            además registra el service worker: aunque no dibuje nada, tiene que
            estar montado en todas las pantallas. */}
        {!demo && <div className="flex flex-col gap-2 px-3 pt-3 empty:hidden sm:px-4 lg:px-6 lg:pt-4">
          {ubicacionDeCampo}
          <CalloutActivarNotificaciones />
          <AplicacionInstalable />
          {/* La cola de gestiones guardadas sin internet (plan 26): vacía no
              dibuja nada; con algo, lo dice y lo sube solo. */}
          <AvisoGestionesSinSubir />
        </div>}
        <main className="flex-1 bg-app-bg p-6">{children}</main>
        <RefrescoEnVivo versionInicial={process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"} />
        {/* La pastilla de «hay versión nueva»: la pestaña nace sabiendo su
            versión y pregunta si el servidor ya es otro. Con esto muere el
            Ctrl+Shift+R (Santos, 31-08). */}
        <AvisoNuevaVersion versionInicial={process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"} />
        {!demo && !ranuraAuditoria && <VigilanteDeCuenta userId={perfil.id} nombre={perfil.nombre} />}
        {/* «Ni bien entra, un pop-up que pase las 4 láminas y un link, y una
            disposición de gerencia» (Carlos, 14-09). No en las cuentas de
            práctica ni en la ranura de auditoría. */}
        {comunicado && !perfil.es_prueba && !ranuraAuditoria && !demo && (
          <ComunicadoDeGerencia comunicado={comunicado} />
        )}
        {avisoResueltas}
        {/* El asistente, en todas las pantallas y solo para gerencia: la
            pregunta nace de lo que se está mirando, así que no puede vivir en
            otra sección. Para los demás roles ni se dibuja.

            Y no se dibuja tampoco si falta la llave de Google. Un botón que al
            abrirse dice «no está conectado» es peor que no tenerlo: gerencia lo
            prueba una vez, no funciona, y no vuelve. Con esto el código puede
            estar desplegado y la función se enciende sola el día que la llave
            entra en las variables de Vercel. */}
        {["gerencia", "admin"].includes(perfil.rol) && asistenteEncendido() && (
          <AsistenteFlotante nombre={perfil.nombre} />
        )}
      </div>
    </div>
  );
}
