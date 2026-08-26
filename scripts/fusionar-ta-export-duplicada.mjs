// Reportado por Ariana (C4) el 26-08: TA EXPORT S.A.C. aparecía dos veces en
// su cartera. Ambas cuentas se crearon el mismo lote (22-08) -- una sin RUC
// (SIN_DOC, sin contacto, notas "falta RUC/DNI") y otra con el RUC ya
// identificado (20562877101, con dirección y contacto Cristian Castro). No es
// un caso de grupo económico (cuenta_padre_id -- empresas hermanas con RUC
// propio, migración 0052): es la MISMA empresa duplicada por el import, así
// que se fusiona de verdad, no se enlaza.
//
// Verificado antes de tocar nada: la cuenta sin RUC no tiene contactos, y
// ninguna otra tabla (leads, asignaciones, informes_cierre,
// sunat_candidatos, servicios_postventa, soporte_tecnico,
// cotizaciones_historicas, cuenta_padre_id de otras cuentas) la referencia --
// solo su única oportunidad (etapa "seguimiento").

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SOBREVIVE = '880d9b34-9181-4592-850a-670ac2c58eed'; // TA EXPORT S.A.C. con RUC 20562877101
const DUPLICADA = '48baffd8-1d82-4fa6-8a0a-6edecb1a967e'; // TA EXPORT S.A.C. sin RUC

const { data: op, error: eOp } = await supabase
  .from('oportunidades')
  .update({ cuenta_id: SOBREVIVE })
  .eq('cuenta_id', DUPLICADA)
  .select('id, etapa');
if (eOp) { console.error('Error moviendo oportunidad:', eOp.message); process.exit(1); }
console.log('Oportunidad(es) movida(s) a la cuenta con RUC:', JSON.stringify(op));

const { error: eDel } = await supabase.from('cuentas').delete().eq('id', DUPLICADA);
if (eDel) { console.error('Error eliminando cuenta duplicada:', eDel.message); process.exit(1); }
console.log('Cuenta duplicada eliminada:', DUPLICADA);
process.exit(0);
