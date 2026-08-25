import { requerirPerfil } from "@/lib/auth";
import { BarraLateral } from "@/components/crm/barra-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  return (
    <div className="flex min-h-screen flex-1">
      <BarraLateral rol={perfil.rol} esPostventa={perfil.es_postventa ?? false} />
      <div className="flex flex-1 flex-col">
        <EncabezadoUsuario perfil={perfil} />
        <main className="flex-1 bg-app-bg p-6">{children}</main>
      </div>
    </div>
  );
}
