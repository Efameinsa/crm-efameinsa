// Pedido urgente de Darwin 26-08: Ariana (C4) reclama SOCIEDAD DE
// BENEFICENCIA DE HUANCAYO (RUC 20133670191) como suya, pero la cuenta
// (y sus 3 oportunidades) estaban asignadas a Katerine Tello (C5) desde el
// histórico. Confirmado por Darwin: reasignar TODO a C4, conservando el
// historial (las actividades/notas no se tocan, solo cambia el dueño).
//
// RLS de oportunidades filtra por oportunidades.comercial_id = auth.uid()
// (migración 0001) -- ese es el campo que de verdad decide qué ve Ariana en
// "oportunidades", no el de cuentas. Se actualizan ambos por consistencia
// del panel de cartera.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CUENTA_ID = '2934eb11-ec1d-474e-a05f-983431c8e6af'; // SOCIEDAD DE BENEFICENCIA DE HUANCAYO
const ARIANA_ID = 'eaf777d9-280f-4d71-98c1-b98db80bf3d7'; // C4
const HOY = '2026-08-26';

const { data: cuenta, error: eCuenta } = await supabase
  .from('cuentas')
  .update({ comercial_id: ARIANA_ID, cartera_desde: HOY })
  .eq('id', CUENTA_ID)
  .select('id, razon_social, comercial_id, cartera_desde')
  .single();
if (eCuenta) { console.error('Error actualizando cuenta:', eCuenta.message); process.exit(1); }
console.log('Cuenta reasignada:', JSON.stringify(cuenta));

const { data: oportunidades, error: eOp } = await supabase
  .from('oportunidades')
  .update({ comercial_id: ARIANA_ID })
  .eq('cuenta_id', CUENTA_ID)
  .select('id, etapa, comercial_id');
if (eOp) { console.error('Error actualizando oportunidades:', eOp.message); process.exit(1); }
console.log(`${oportunidades.length} oportunidades reasignadas:`, JSON.stringify(oportunidades));
process.exit(0);
