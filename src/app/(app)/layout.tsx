import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contarAtencionesAbiertas, contarBandejaMiDia } from "@/lib/contadores-postventa";
import { BarraLateral } from "@/components/crm/barra-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";
import { CalloutActivarNotificaciones } from "@/components/crm/callout-activar-notificaciones";
import { AplicacionInstalable } from "@/components/crm/aplicacion-instalable";
import { AvisoGestionesSinSubir } from "@/components/crm/aviso-gestiones-sin-subir";
import { AvisoNuevaVersion } from "@/components/crm/aviso-nueva-version";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

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
      </div>
    </div>
  );
}
