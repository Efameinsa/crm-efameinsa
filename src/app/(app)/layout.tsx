import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contarAtencionesAbiertas, contarBandejaMiDia } from "@/lib/contadores-postventa";
import { BarraLateral } from "@/components/crm/barra-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";
import { CalloutActivarNotificaciones } from "@/components/crm/callout-activar-notificaciones";
import { AplicacionInstalable } from "@/components/crm/aplicacion-instalable";
import { AvisoGestionesSinSubir } from "@/components/crm/aviso-gestiones-sin-subir";
import { AvisoNuevaVersion } from "@/components/crm/aviso-nueva-version";
import { AsistenteFlotante } from "@/components/crm/asistente-flotante";
import { asistenteEncendido } from "@/lib/asistente/herramientas";
import { cookies, headers } from "next/headers";
import { COOKIE_AUDITORIA, decodificarInfoAuditoria, ranuraDeHost } from "@/lib/auditoria";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  // La franja de auditoría (0160): en ver1…ver5 la sesión es de otra persona
  // y hay que decirlo en todas las pantallas, arriba, sin que se pueda cerrar.
  const [cabeceras, tarro] = await Promise.all([headers(), cookies()]);
  const ranuraAuditoria = ranuraDeHost(cabeceras.get("host"));
  const auditoria = ranuraAuditoria ? decodificarInfoAuditoria(tarro.get(COOKIE_AUDITORIA)?.value) : null;

  // Los contadores del menú (plan 23, etapa 5) solo se piden para quien ve
  // la sección Postventa de la barra: cuatro consultas `head: true` de más en
  // CADA navegación de gerencia, central o un comercial normal no le sirven a
  // nadie.
  const veSeccionPostventa = Boolean(perfil.es_postventa) || Boolean(perfil.es_soporte);
  let contadorMiDia: number | undefined;
  let contadorAtenciones: number | undefined;
  if (veSeccionPostventa) {
    const supabase = await createClient();
    [contadorMiDia, contadorAtenciones] = await Promise.all([
      contarBandejaMiDia(supabase, perfil.id),
      contarAtencionesAbiertas(supabase),
    ]);
  }

  return (
    <div className="flex min-h-screen flex-1">
      <BarraLateral
        rol={perfil.rol}
        esPostventa={perfil.es_postventa ?? false}
        hacePostventa={perfil.hace_postventa ?? false}
        esSoporte={perfil.es_soporte ?? false}
        esOperaciones={perfil.es_operaciones ?? false}
        contadorMiDia={contadorMiDia}
        contadorAtenciones={contadorAtenciones}
      />
      <div className="flex flex-1 flex-col">
        {ranuraAuditoria && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-6 py-2 text-xs font-semibold text-amber-950">
            <span>
              Sesión de auditoría de gerencia{auditoria ? ` (${auditoria.auditor})` : ""} · viendo el CRM como{" "}
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
        {perfil.es_prueba && (
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
        <EncabezadoUsuario perfil={perfil} />
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
        <div className="flex flex-col gap-3 px-6 pt-6 empty:hidden">
          <CalloutActivarNotificaciones />
          <AplicacionInstalable />
          {/* La cola de gestiones guardadas sin internet (plan 26): vacía no
              dibuja nada; con algo, lo dice y lo sube solo. */}
          <AvisoGestionesSinSubir />
        </div>
        <main className="flex-1 bg-app-bg p-6">{children}</main>
        {/* La pastilla de «hay versión nueva»: la pestaña nace sabiendo su
            versión y pregunta si el servidor ya es otro. Con esto muere el
            Ctrl+Shift+R (Santos, 31-08). */}
        <AvisoNuevaVersion versionInicial={process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"} />
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
