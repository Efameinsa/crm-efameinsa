import { Phone, MessageCircle, Mail, Building2, Store, Filter, StickyNote, MoreHorizontal, type LucideIcon } from "lucide-react";

const ICONO: Record<string, LucideIcon> = {
  llamada: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  visita: Building2,
  showroom: Store,
  filtro: Filter,
  nota: StickyNote,
  otro: MoreHorizontal,
};

const ETIQUETA: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  showroom: "Showroom",
  filtro: "Filtro",
  nota: "Nota",
  otro: "Otro",
};

interface Actividad {
  id: string;
  tipo: string;
  nota: string | null;
  realizada_at: string;
}

export function HistorialActividades({ actividades }: { actividades: Actividad[] }) {
  if (actividades.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>;
  }

  return (
    <div className="relative space-y-4">
      {actividades.map((a, i) => {
        const Icono = ICONO[a.tipo] ?? MoreHorizontal;
        return (
          <div key={a.id} className="relative flex gap-3">
            {i < actividades.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-4px)] w-px bg-border" aria-hidden />
            )}
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-foreground">
              <Icono className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">{ETIQUETA[a.tipo] ?? a.tipo}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.realizada_at).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              {a.nota && <p className="mt-0.5 text-sm text-muted-foreground">{a.nota}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
