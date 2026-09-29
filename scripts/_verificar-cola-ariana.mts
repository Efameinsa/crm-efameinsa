// Corre la cola del día de un comercial con SU sesión real y dice dónde quedan
// los clientes dados. Solo lee.
//   npx tsx --env-file=.env.local scripts/_verificar-cola-ariana.ts "Ariana" "GARCIA BARRETO" "EGOAVIL"
import { createClient } from "@supabase/supabase-js";
import { colaDelDia } from "@/lib/propuesta/cola-del-dia";

const [nombre, ...buscar] = process.argv.slice(2);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: perfil } = await admin.from("perfiles").select("*").ilike("nombre", `%${nombre}%`).eq("rol", "comercial").eq("activo", true).limit(1).single();
const { data: u } = await admin.auth.admin.getUserById(perfil!.id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user!.email! });
const yo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
await yo.auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: "magiclink" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { tareas } = await colaDelDia(yo as any, perfil as any, "comercial");
const cuenta = (u2: string) => tareas.filter((t) => t.urgencia === u2).length;
console.log(`${perfil!.nombre}: atrasado ${cuenta("atrasado")} · hoy ${cuenta("hoy")} · semana ${cuenta("semana")} · ya atendidas al lado ${tareas.filter((t) => t.id.startsWith("al-")).length}`);
for (const b of buscar) for (const t of tareas.filter((t) => t.cliente.toUpperCase().includes(b.toUpperCase()))) console.log(`  ${t.cliente} → [${t.urgencia}] ${t.que} · ${t.porque}`);
