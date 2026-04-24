import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY=(Deno.env.get("SB_SECRET_KEY")??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
const CRON_SECRET=Deno.env.get("CRON_SECRET")??"";
const GRACE_DAYS=7;const AVISO=[1,3,6];const WA_SUP="5587981456565";
function json(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json"}});}
Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!CRON_SECRET||req.headers.get("x-cron-secret")!==CRON_SECRET)return json({error:"unauthorized"},401);
  const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
  const hj=new Date();hj.setHours(0,0,0,0);
  const {data:assins}=await sb.from("subscriptions").select("id,company_id,plan,valor,proximo_vencimento,status,companies(id,legal_name,whatsapp,phone,status,dias_atraso)").in("status",["atrasada","suspensa"]);
  const res:any[]=[];
  for(const a of assins||[]){
    const co:any=(a as any).companies;if(!co)continue;
    const v=a.proximo_vencimento?new Date(a.proximo_vencimento+"T00:00:00"):null;if(!v)continue;
    const d=Math.max(0,Math.floor((hj.getTime()-v.getTime())/86400000));
    const up:any={dias_atraso:d};
    if(d>GRACE_DAYS){up.status="suspensa";up.bloqueado_em=new Date().toISOString();}
    else if(d>0){up.status="atrasada";}
    await sb.from("companies").update(up).eq("id",co.id);
    if(AVISO.includes(d)&&(co.whatsapp||co.phone)){
      console.log(`[WA mock] ${co.whatsapp??co.phone}: DM Pay ${co.legal_name} ${d}d atraso R$${a.valor}`);
      res.push({company:co.legal_name,dias:d,aviso:true});
    }else{
      res.push({company:co.legal_name,dias:d,aviso:false,bloqueado:d>GRACE_DAYS});
    }
  }
  return json({ok:true,processadas:res.length,resultados:res});
});
