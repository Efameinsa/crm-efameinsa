import { requerirPerfil } from "@/lib/auth";
import { BarraLateral } from "@/components/crm/barra-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";
import { CalloutActivarNotificaciones } from "@/components/crm/callout-activar-notificaciones";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  return (
    <div className="flex min-h-screen flex-1">
      <BarraLateral
        rol={perfil.rol}
        esPostventa={perfil.es_postventa ?? false}
        hacePostventa={perfil.hace_postventa ?? false}
        esSoporte={perfil.es_soporte ?? false}
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
        <div className="px-6 pt-6 empty:hidden">
          <CalloutActivarNotificaciones />
        </div>
        <main className="flex-1 bg-app-bg p-6">{children}</main>
      </div>
    </div>
  );
}
