import { ListChecks } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import Navegacion from "@/components/tasking/Navegacion";

// TASKING (Santos, 09-10-2026): actas de reunión que se vuelven compromisos con
// recordatorios por WhatsApp, y el aviso de «su sugerencia ya está lista».
// Solo el administrador; los trabajadores marcan lo suyo desde su enlace /t/<token>.
export const dynamic = "force-dynamic";

const ENLACES = [
  { href: "/tasking/reunion", texto: "Grabar reunión" },
  { href: "/tasking/reuniones", texto: "Reuniones" },
  { href: "/tasking/tablero", texto: "Compromisos" },
  { href: "/tasking/reportes", texto: "Reportes" },
  { href: "/tasking/equipo", texto: "Equipo" },
  { href: "/tasking/whatsapp", texto: "WhatsApp" },
];

export default async function TaskingLayout({ children }: { children: React.ReactNode }) {
  await requerirRol(["admin"]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <ListChecks className="size-5" />
        </span>
        <div className="mr-auto font-semibold text-foreground">Tasking</div>
        <Navegacion enlaces={ENLACES} />
      </div>
      {children}
    </div>
  );
}
