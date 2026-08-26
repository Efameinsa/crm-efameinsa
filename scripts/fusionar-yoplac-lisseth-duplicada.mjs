// Reportado por Ariana (C4) 26-08: YOPLAC OCHOA LISSETH BRIGIETTE duplicada,
// mismo patrón exacto que TA EXPORT S.A.C. (mismo lote de import 22-08): una
// cuenta con RUC ya identificado (10726634233) y otra sin documento. Se
// fusiona de verdad (no es grupo económico -- es la misma persona).
// Verificado antes: la cuenta sin RUC no tiene contactos y solo su única
// oportunidad la referencia.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SOBREVIVE = '384c6dff-6940-40f2-9274-6efcc872a502'; // con RUC 10726634233
const DUPLICADA = 'f75a4c26-cf73-4a90-94e9-0f8d18377146'; // sin documento

const { data: op, error: eOp } = await supabase
  .from('oportunidades')
  .update({ cuenta_id: SOBREVIVE })
  .eq('cuenta_id', DUPLICADA)
  .select('id, etapa');
if (eOp) { console.error('Error moviendo oportunidad:', eOp.message); process.exit(1); }
console.log('Oportunidad(es) movida(s):', JSON.stringify(op));

const { error: eDel } = await supabase.from('cuentas').delete().eq('id', DUPLICADA);
if (eDel) { console.error('Error eliminando cuenta duplicada:', eDel.message); process.exit(1); }
console.log('Cuenta duplicada eliminada:', DUPLICADA);
process.exit(0);
