import { NextResponse } from 'next/server';
import { recordarPersona } from '@/lib/tasking/auth';
import { db } from '@/lib/tasking/db';

// Enlace personal que llega por WhatsApp/correo: deja la sesión del trabajador y lo lleva a su lista.
export async function GET(req: Request, ctx: RouteContext<'/t/[token]'>) {
  const { token } = await ctx.params;
  const { data } = await db().from('personas').select('id').eq('token', token).eq('activo', true).maybeSingle();
  if (!data) return NextResponse.redirect(new URL('/t/mis-compromisos', req.url));
  await recordarPersona(token);
  return NextResponse.redirect(new URL('/t/mis-compromisos', req.url));
}
