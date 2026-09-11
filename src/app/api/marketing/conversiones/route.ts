import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { cargarConversionesDeCampana, type ConversionDeCampana as Fila } from "@/lib/marketing-conversiones";
import { origenDe } from "@/lib/campana";

// LA VUELTA A LAS PLATAFORMAS (Santos, 11-09). Google Ads y Meta solo saben
// que alguien llenó un formulario; el CRM sabe si ese alguien se calificó,
// cotizó o compró. Este CSV se les sube como «conversiones offline» para que
// optimicen hacia el cliente bueno.
//
//   ?formato=google  → columnas exactas del importador de Google Ads
//                      (Google Click ID, GBRAID, WBRAID, Conversion Name,
//                      Conversion Time, Conversion Value, Conversion Currency)
//   ?formato=meta    → columnas del importador de eventos offline de Meta
//                      (email, phone, event_name, event_time, value,
//                      currency, order_id); Meta los cifra al subirlos
//   ?formato=todo    → todas las columnas, para gerencia
//   &desde=YYYY-MM-DD&hasta=YYYY-MM-DD (por defecto, los últimos 90 días)
//
// La autorización real la hace `conversiones_de_campana` (solo gerencia).

export const dynamic = "force-dynamic";

const NOMBRE_GOOGLE: Record<string, string> = {
  calificado: "Lead calificado",
  cotizado: "Cotizado",
  ganado: "Venta",
};
const NOMBRE_META: Record<string, string> = {
  calificado: "Lead",
  cotizado: "SubmitApplication",
  ganado: "Purchase",
};

const csv = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const linea = (cols: unknown[]) => cols.map(csv).join(",");

/** «2026-09-11 14:35:02-05:00»: el formato con zona que Google acepta sin parámetro. */
function horaLima(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}-05:00`;
}

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const formato = url.searchParams.get("formato") ?? "todo";
  const { desde, hasta } = resolverPeriodo(
    { desde: url.searchParams.get("desde") ?? undefined, hasta: url.searchParams.get("hasta") ?? undefined },
    "90d",
  );

  const { filas, error } = await cargarConversionesDeCampana(supabase, desde, hasta);
  if (error) return NextResponse.json({ error }, { status: /autorizado/i.test(error) ? 403 : 500 });

  let cuerpo: string;
  let nombre: string;
  if (formato === "google") {
    const conClic = filas.filter((f: Fila) => (f.gclid || f.gbraid || f.wbraid) && NOMBRE_GOOGLE[f.estado]);
    cuerpo = [
      "Parameters:TimeZone=America/Lima",
      linea(["Google Click ID", "GBRAID", "WBRAID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"]),
      ...conClic.map((f) =>
        linea([
          f.gclid,
          f.gbraid,
          f.wbraid,
          NOMBRE_GOOGLE[f.estado],
          horaLima(f.fecha_estado),
          f.estado === "ganado" && f.valor != null ? Math.round(f.valor * 100) / 100 : "",
          f.estado === "ganado" && f.valor != null ? f.moneda ?? "USD" : "",
        ]),
      ),
    ].join("\r\n");
    nombre = `google-ads-conversiones-${desde}-a-${hasta}.csv`;
  } else if (formato === "meta") {
    const deMeta = filas.filter((f) => f.plataforma === "meta" && NOMBRE_META[f.estado] && (f.email || f.telefono));
    cuerpo = [
      linea(["email", "phone", "event_name", "event_time", "value", "currency", "order_id"]),
      ...deMeta.map((f) =>
        linea([
          (f.email ?? "").trim().toLowerCase(),
          telefonoE164(f.telefono),
          NOMBRE_META[f.estado],
          Math.floor(new Date(f.fecha_estado).getTime() / 1000),
          f.estado === "ganado" && f.valor != null ? Math.round(f.valor * 100) / 100 : "",
          f.estado === "ganado" && f.valor != null ? f.moneda ?? "USD" : "",
          f.codigo ?? f.lead_id,
        ]),
      ),
    ].join("\r\n");
    nombre = `meta-conversiones-${desde}-a-${hasta}.csv`;
  } else {
    cuerpo = [
      linea([
        "codigo", "recibido", "plataforma", "origen", "campaña", "contenido", "fuente", "medio", "gclid", "gbraid", "wbraid", "fbclid",
        "nombre", "razon_social", "email", "telefono", "comercial", "estado", "detalle", "valor", "moneda", "fecha_estado",
      ]),
      ...filas.map((f) =>
        linea([
          f.codigo, horaLima(f.recibido_at), f.plataforma, origenDe(f)?.etiqueta ?? "", f.utm_campaign, f.utm_content, f.fuente, f.utm_medium,
          f.gclid, f.gbraid, f.wbraid, f.fbclid, f.nombre, f.razon_social, f.email, f.telefono, f.comercial, f.estado, f.detalle,
          f.valor, f.moneda, horaLima(f.fecha_estado),
        ]),
      ),
    ].join("\r\n");
    nombre = `contactos-de-campana-${desde}-a-${hasta}.csv`;
  }

  // BOM para que Excel abra las tildes bien.
  return new NextResponse(`﻿${cuerpo}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
