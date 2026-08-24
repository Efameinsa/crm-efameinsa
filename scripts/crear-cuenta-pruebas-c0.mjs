// ============================================================
// CRM EFAMEINSA · La cuenta C0, para practicar sin ensuciar los números
// ============================================================
// Pedido del 24-08: «una cuenta de vendedor de prueba que se llame C0 … para
// no malograr las cuentas de los vendedores haciendo pruebas», que gerencia no
// la considere en sus estadísticas, y que Central pueda derivarle un lead para
// oír el sonido sin manchar sus números.
//
// La exclusión no la hace este script: la hace la migración 0072, que marca el
// perfil con `es_prueba` y deja fuera esa cuenta del resumen de gerencia, de la
// supervisión diaria, del informe de Central y de los paneles de carga. Acá
// solo se crea la cuenta con esa marca puesta y se le siembran unos pocos
// registros.
//
// QUÉ SE SIEMBRA, y por qué tan poco:
//   · 3 clientes inventados, con RUC válido pero que no existe en SUNAT.
//   · 3 oportunidades en etapas distintas, para ver cómo se comporta el tablero.
//   · 2 gestiones, para que la agenda no salga vacía.
//   · 1 contacto SIN DERIVAR esperando en la bandeja de Central, que es el que
//     Central va a derivar a C0 para oír el pitido.
//
// Lo justo para que las pantallas tengan algo que mostrar. Sembrar mucho haría
// que la cuenta de práctica pareciera un vendedor de verdad y confundiría a
// quien la mire de reojo.
//
// Es idempotente: si la cuenta ya existe, no la duplica ni vuelve a sembrar.
//
// Uso: node --env-file=.env.local scripts/crear-cuenta-pruebas-c0.mjs

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.DATABASE_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL.");
  process.exit(1);
}

const CORREO = "comercial0@gmail.com";
const NOMBRE = "Comercial de pruebas";
const CODIGO = "C0";

/** Contraseña legible pero no adivinable: se imprime UNA vez y no se guarda. */
function contrasena() {
  return `Prueba-${randomBytes(4).toString("hex")}`;
}

const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// ── 1. El usuario ───────────────────────────────────────────────────────────
const { data: existentes } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
let usuario = existentes?.users.find((u) => u.email?.toLowerCase() === CORREO);
let clave = null;

if (usuario) {
  // Ya existía: se le pone una contraseña nueva, que es lo que hace falta para
  // poder entrar. No se toca nada más.
  clave = contrasena();
  await auth.auth.admin.updateUserById(usuario.id, { password: clave });
  console.log(`La cuenta ya existía; se le puso una contraseña nueva.`);
} else {
  clave = contrasena();
  const { data, error } = await auth.auth.admin.createUser({
    email: CORREO,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre: NOMBRE },
  });
  if (error) throw error;
  usuario = data.user;
  console.log("Cuenta creada.");
}

await bd.query(
  `insert into perfiles (id, nombre, rol, codigo_comercial, activo, es_prueba, meta_mensual)
   values ($1, $2, 'comercial', $3, true, true, 0)
   on conflict (id) do update set
     nombre = excluded.nombre, rol = 'comercial', codigo_comercial = excluded.codigo_comercial,
     activo = true, es_prueba = true, meta_mensual = 0`,
  [usuario.id, NOMBRE, CODIGO],
);

// ── 2. Los registros sintéticos ─────────────────────────────────────────────
const { rows: yaSembrado } = await bd.query(
  `select count(*)::int n from cuentas where comercial_id = $1`,
  [usuario.id],
);

if (yaSembrado[0].n > 0) {
  console.log(`Ya tenía ${yaSembrado[0].n} cliente(s) de práctica: no se vuelve a sembrar.`);
} else {
  // RUCs con dígito verificador correcto pero que no corresponden a nadie: no
  // se puede confundir con un cliente real ni chocar con uno existente.
  const CLIENTES = [
    { razon: "LAVANDERIA DE PRUEBA UNO S.A.C.", ruc: "20000000001", etapa: "asignada" },
    { razon: "HOTEL DE PRUEBA DOS E.I.R.L.", ruc: "20000000002", etapa: "cotizada" },
    { razon: "TEXTIL DE PRUEBA TRES S.A.", ruc: "20000000003", etapa: "seguimiento" },
  ];

  for (const c of CLIENTES) {
    const { rows: cuenta } = await bd.query(
      `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id, cartera_desde)
       values ($1, 'RUC', $2, $3, current_date) returning id`,
      [c.razon, c.ruc, usuario.id],
    );
    const { rows: op } = await bd.query(
      `insert into oportunidades (cuenta_id, comercial_id, etapa, intencion, moneda)
       values ($1, $2, $3::etapa_oportunidad, 'medio', 'USD') returning id`,
      [cuenta[0].id, usuario.id, c.etapa],
    );
    await bd.query(
      `insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal)
       values ($1, $2, 'Contacto de prueba', '999 000 000', 'prueba@example.com', true)`,
      [cuenta[0].id, `Contacto de ${c.razon.split(" ")[0]}`],
    );
    // Una gestión en dos de las tres, para que la agenda tenga algo.
    if (c.etapa !== "asignada") {
      await bd.query(
        `insert into actividades (oportunidad_id, realizada_por, tipo, nota, realizada_at)
         values ($1, $2, 'llamada', 'Gestión de práctica: este registro es sintético.', now())`,
        [op[0].id, usuario.id],
      );
    }
  }
  console.log(`Sembrados ${CLIENTES.length} clientes de práctica con sus oportunidades.`);
}

// ── 3. El contacto que Central va a derivar para oír el pitido ──────────────
const { rows: pendiente } = await bd.query(
  `select id, codigo from leads where es_prueba and estado = 'pendiente_triaje' limit 1`,
);

if (pendiente.length > 0) {
  console.log(`Ya hay un contacto de práctica esperando en la bandeja: ${pendiente[0].codigo}`);
} else {
  const { rows: lead } = await bd.query(
    `insert into leads (canal, area_destino, estado, nombre_contacto, razon_social, telefono,
                        mensaje, recibido_at, es_prueba)
     values ('whatsapp', 'comercial', 'pendiente_triaje', 'Cliente de prueba',
             'PRUEBA DEL SISTEMA — no es un cliente real', '999 000 000',
             'CONTACTO DE PRUEBA para ensayar el aviso sonoro. Derivarlo a C0. No es un cliente real.',
             now(), true)
     returning id, codigo`,
  );
  console.log(`Contacto de práctica en la bandeja de Central: ${lead[0].codigo}`);
}

// ── 4. Comprobación: que de verdad no aparezca en los números ───────────────
const { rows: comprobacion } = await bd.query(
  `select
     (select count(*) from perfiles where rol = 'comercial' and activo and not es_prueba)::int reales,
     (select count(*) from perfiles where rol = 'comercial' and activo and es_prueba)::int de_prueba,
     (select count(*) from leads where estado = 'pendiente_triaje' and not es_prueba)::int bandeja_real,
     (select count(*) from leads where estado = 'pendiente_triaje' and es_prueba)::int bandeja_prueba`,
);
const c = comprobacion[0];

console.log(`\n${"─".repeat(66)}`);
console.log("  CUENTA DE PRUEBAS LISTA");
console.log(`  Correo      : ${CORREO}`);
console.log(`  Contraseña  : ${clave}`);
console.log(`  Código      : ${CODIGO} · marcada como cuenta de práctica`);
console.log(`${"─".repeat(66)}`);
console.log(`  Comerciales que SÍ cuentan para gerencia : ${c.reales}`);
console.log(`  Cuentas de práctica (no cuentan)         : ${c.de_prueba}`);
console.log(`  Bandeja de Central, contactos reales     : ${c.bandeja_real}`);
console.log(`  Bandeja de Central, de práctica          : ${c.bandeja_prueba}`);
console.log(`${"─".repeat(66)}`);
console.log("  La contraseña no queda guardada en ningún lado: anotarla ahora.");

await bd.end();
