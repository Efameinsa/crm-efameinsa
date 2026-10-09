import { NextResponse } from "next/server";
import { esAdmin } from "./auth";

export function json(datos: unknown, status = 200) {
  return NextResponse.json(datos, { status });
}

export function fallo(mensaje: string, status = 400) {
  return NextResponse.json({ error: mensaje }, { status });
}

/** Devuelve una respuesta 401 si quien llama no es el admin del CRM. */
export async function exigirAdmin() {
  return (await esAdmin()) ? null : fallo("Solo el administrador del CRM usa Tasking.", 401);
}
