import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";

// WhatsApp de campañas, fase 1 sin API (14-09-2026): los públicos para subir a
// Meta como lista de clientes personalizada.
//
//   ?tipo=interesados → interesado + cotizado: público para similar 1 % y para
//                       no volver a pagar el mismo anuncio a quien ya escribió.
//   ?tipo=excluir     → no_interesado + equivocado: lista de exclusión, para
//                       que el anuncio no le vuelva a salir a esta gente.
//   &desde=YYYY-MM-DD&hasta=YYYY-MM-DD (por defecto, los últimos 90 días)
//
// Meta cifra el archivo al subirlo (igual que el CSV de conversiones): va con
// teléfono sin cifrar. Solo gerencia y backoffice pueden bajarlo — mismo
// candado que /api/marketing/conversiones.

export const dynamic = "force-dynamic";

const ESTADOS_INTERESADOS = ["interesado", "cotizado"];
const ESTADOS_EXCLUIR = ["no_interesado", "equivocado"];

const csv = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Teléfono en E.164 para Meta: los nueve dígitos del celular peruano con +51. */
function telefonoE164(t: string | null): string {
  const d = (t ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 9) return `+51${d}`;
  if (d.length === 11 && d.startsWith("51")) return `+${d}`;
  return `+${d}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  if (!perfil || !["gerencia", "admin"].includes(perfil.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") === "excluir" ? "excluir" : "interesados";
  const estados = tipo === "excluir" ? ESTADOS_EXCLUIR : ESTADOS_INTERESADOS;
  const { desde, hasta } = resolverPeriodo(
    { desde: url.searchParams.get("desde") ?? undefined, hasta: url.searchParams.get("hasta") ?? undefined },
    "90d",
  );

  // El estado vigente sale de la vista `tipificacion_whatsapp_actual`, y de
  // ahí se llega al lead para el teléfono y el correo. Volumen chico: no hace
  // falta paginar de a 1000 como en conversiones (39k leads históricos).
  const { data: tipificados, error } = await supabase
    .from("tipificacion_whatsapp_actual")
    .select("lead_id, estado, leads!inner(telefono, email, codigo_campania_wa, recibido_at, es_prueba)")
    .in("estado", estados)
    .eq("leads.es_prueba", false)
    .gte("leads.recibido_at", desde)
    .lt("leads.recibido_at", `${hasta}T23:59:59`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (tipificados ?? []) as unknown as {
    estado: string;
    leads: { telefono: string | null; email: string | null; codigo_campania_wa: string | null };
  }[];

  const cuerpo = [
    csv("phone") + "," + csv("email") + "," + csv("estado") + "," + csv("codigo_campania"),
    ...filas
      .filter((f) => f.leads.telefono || f.leads.email)
      .map((f) =>
        [telefonoE164(f.leads.telefono), (f.leads.email ?? "").trim().toLowerCase(), f.estado, f.leads.codigo_campania_wa ?? ""]
          .map(csv)
          .join(","),
      ),
  ].join("\r\n");

  return new NextResponse(`﻿${cuerpo}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="whatsapp-${tipo}-${desde}-a-${hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
