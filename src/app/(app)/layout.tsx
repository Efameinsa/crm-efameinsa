import Image from "next/image";
import { requerirPerfil } from "@/lib/auth";
import { NavLateral } from "@/components/crm/nav-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="flex w-60 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center justify-center px-4 py-5">
          <Image
            src="/efameinsa-blanco.png"
            alt="Efameinsa"
            width={442}
            height={334}
            className="h-20 w-auto"
            priority
          />
        </div>
        <NavLateral rol={perfil.rol} />
      </aside>
      <div className="flex flex-1 flex-col">
        <EncabezadoUsuario perfil={perfil} />
        <main className="flex-1 bg-app-bg p-6">{children}</main>
      </div>
    </div>
  );
}
