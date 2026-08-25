import { cerrarSesion } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { CampanaNotificaciones } from "@/components/crm/campana-notificaciones";
import { CambiarClave } from "@/components/crm/cambiar-clave";
import type { Perfil } from "@/types/database";

const ETIQUETA_ROL: Record<Perfil["rol"], string> = {
  admin: "Administrador",
  gerencia: "Gerencia",
  central: "Central",
  comercial: "Comercial",
};

export function EncabezadoUsuario({ perfil }: { perfil: Perfil }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{perfil.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {ETIQUETA_ROL[perfil.rol]}
          {perfil.codigo_comercial ? ` · ${perfil.codigo_comercial}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <CampanaNotificaciones userId={perfil.id} rol={perfil.rol} />
        <CambiarClave />
        <form action={cerrarSesion}>
          <Button type="submit" variant="outline" size="sm">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </header>
  );
}
