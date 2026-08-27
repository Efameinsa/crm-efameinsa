import {
  Phone,
  MessageCircle,
  Mail,
  Building2,
  Store,
  Filter,
  StickyNote,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

// Cómo se llama y con qué ícono se pinta cada tipo de gestión. Vive en su
// propio módulo —y no dentro de linea-tiempo-cuenta.tsx, que es "use client"—
// porque también lo usan pantallas de servidor (la lista de derivados de
// Central): importar un valor desde un módulo cliente lo convierte en una
// referencia de cliente y en el servidor deja de ser el objeto.

export const ICONO_ACTIVIDAD: Record<string, LucideIcon> = {
  llamada: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  visita: Building2,
  showroom: Store,
  filtro: Filter,
  nota: StickyNote,
  otro: MoreHorizontal,
};

export const ETIQUETA_ACTIVIDAD: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  showroom: "Showroom",
  filtro: "Filtro",
  nota: "Nota",
  otro: "Otro",
};
