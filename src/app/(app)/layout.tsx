import Image from "next/image";
import { requerirPerfil } from "@/lib/auth";
import { NavLateral } from "@/components/crm/nav-lateral";
import { EncabezadoUsuario } from "@/components/crm/encabezado-usuario";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="flex w-60 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-4">
          <Image
            src="/logo-efameinsa.png"
            alt="Efameinsa"
            width={140}
            height={23}
            className="h-6 w-auto brightness-0 invert"
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
