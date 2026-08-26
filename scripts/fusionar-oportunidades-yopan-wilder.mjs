// Reportado por Ariana (C4) 26-08 (captura de pantalla): YOPAN RAMIREZ
// WILDER aparecía duplicado en oportunidades. A diferencia de TA EXPORT y
// YOPLAC OCHOA LISSETH BRIGIETTE (que eran 2 CUENTAS duplicadas), acá hay
// UNA sola cuenta (RUC 10328434585) con DOS oportunidades del histórico que
// son la misma conversación partida en dos filas por el import: contacto
// inicial 2021-11-15 ("filtrada") y seguimiento 2021-11-26 ("seguimiento"),
// 11 días después, mismo cliente, mismo pedido (lav. 13/15kg).
//
// Se fusiona moviendo la actividad de la oportunidad más antigua a la más
// reciente (que ya tiene la etapa más avanzada) y borrando la oportunidad
// vacía. Verificado antes: ninguna tiene cotizaciones ni ventas asociadas.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SOBREVIVE = 'd0447708-dc9b-4d04-8432-7f33e3bdbea5'; // seguimiento, 2021-11-26 (etapa más avanzada)
const DUPLICADA = '47d46377-d3cf-4762-86be-3f90c7010ec4'; // filtrada, 2021-11-15 (contacto inicial)

const { data: act, error: eAct } = await supabase
  .from('actividades')
  .update({ oportunidad_id: SOBREVIVE })
  .eq('oportunidad_id', DUPLICADA)
  .select('id, realizada_at');
if (eAct) { console.error('Error moviendo actividad:', eAct.message); process.exit(1); }
console.log('Actividad(es) movida(s) a la oportunidad sobreviviente:', JSON.stringify(act));

const { error: eDel } = await supabase.from('oportunidades').delete().eq('id', DUPLICADA);
if (eDel) { console.error('Error eliminando oportunidad duplicada:', eDel.message); process.exit(1); }
console.log('Oportunidad duplicada eliminada:', DUPLICADA);
process.exit(0);
