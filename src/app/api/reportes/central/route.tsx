import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { InformeCentralPdf } from "@/lib/pdf/informe-central-pdf";

// PDF del informe del día de Central, el que se envía a gerencia.
//
// La autorización la hace la función SQL (informe_central solo responde a
// Central o backoffice); acá solo se comprueba que haya sesión y se arma el
// documento.
//
// El logo se lee una vez al cargar el módulo, no en cada request.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const fechaParam = url.searchParams.get("fecha");
  const fecha = fechaParam && RE_FECHA.test(fechaParam) ? fechaParam : hoyLima();

  const [{ data, error }, { data: perfil }] = await Promise.all([
    supabase.rpc("informe_central", { p_fecha: fecha }),
    supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  const informe = data as unknown as {
    bitacora: { texto: string }[];
    contactos: {
      codigo: string | null;
      canal: string;
      area: string;
      nombre: string | null;
      razon_social: string | null;
      telefono: string | null;
      solicita: string | null;
      recibido_at: string;
      asignado_a: string | null;
      codigo_comercial: string | null;
    }[];
    presupuestos: {
      codigo: string | null;
      serie: string;
      cliente: string | null;
      comercial: string | null;
      codigo_comercial: string | null;
      total: number;
      moneda: string;
    }[];
    totales: { contactos: number; derivados: number; presupuestos: number; sin_asignar: number };
  };

  const buffer = await renderToBuffer(
    <InformeCentralPdf
      logoBuffer={LOGO_BUFFER}
      responsable={perfil?.nombre ?? "Central"}
      fechaLarga={fechaCalendarioLarga(fecha)}
      actividades={informe.bitacora.map((b) => b.texto)}
      contactos={informe.contactos.map((c) => ({
        codigo: c.codigo,
        canal: c.canal,
        area: c.area,
        nombre: c.nombre,
        razon_social: c.razon_social,
        telefono: c.telefono,
        solicita: c.solicita,
        // La hora en que entró, en hora de Lima: el servidor corre en UTC.
        hora: new Date(c.recibido_at).toLocaleTimeString("es-PE", {
          timeZone: "America/Lima",
          hour: "2-digit",
          minute: "2-digit",
        }),
        asignado_a: c.asignado_a,
        codigo_comercial: c.codigo_comercial,
      }))}
      presupuestos={informe.presupuestos}
      totales={informe.totales}
    />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="informe-central-${fecha}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
