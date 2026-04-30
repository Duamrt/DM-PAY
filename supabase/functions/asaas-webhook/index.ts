import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
Deno.serve(async(req)=>{
  const cors = corsHeaders(req);
  const json = (b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json"}});
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  // Token obrigatório (não condicional). Sem token configurado, recusa por segurança.
  if(!WEBHOOK_TOKEN||req.headers.get("asaas-access-token")!==WEBHOOK_TOKEN)return json({error:"invalid_token"},401);
  const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
  // Rate limit: webhook do Asaas pode ter burst legítimo (vários eventos quase simultâneos), 300/min.
  const ip=getClientIp(req);
  if(!(await checkRateLimit(sb,ip,"asaas-webhook",300)))return json({error:"rate_limited"},429);
  const payload=await req.json().catch(()=>null);
  if(!payload)return json({error:"invalid_payload"},400);
  const evento=payload.event as string;
  const payment=payload.payment??{};
  const subId=payment.subscription??payload.subscription?.id??null;
  const custId=payment.customer??payload.customer??null;
  const eid=payload.id??`${evento}:${payment.id??""}:${payment.status??""}:${payment.paymentDate??payment.dueDate??""}`;
  // Idempotência: ignora evento já processado
  const {data:ex}=await sb.from("asaas_eventos").select("id,processado").eq("asaas_event_id",eid).maybeSingle();
  if(ex?.processado)return json({ok:true,duplicado:true});
  const {data:log}=await sb.from("asaas_eventos").insert({asaas_event_id:eid,tipo:evento,payment_id:payment.id??null,subscription_id:subId,customer_id:custId,payload}).select("id").single();
  try{
    let a:any=null;
    if(subId){const {data}=await sb.from("subscriptions").select("*").eq("asaas_subscription_id",subId).maybeSingle();a=data;}
    if(!a){await sb.from("asaas_eventos").update({processado:true,erro:"sem_assinatura"}).eq("id",log!.id);return json({ok:true,ignorado:true});}
    const cid=a.company_id;
    switch(evento){
      case "PAYMENT_CONFIRMED":case "PAYMENT_RECEIVED":case "PAYMENT_RECEIVED_IN_CASH":{
        const cc=payment.creditCard??{};
        await sb.from("subscriptions").update({status:"ativa",forma_pagamento:payment.billingType??a.forma_pagamento,ultimo_pagamento_em:new Date().toISOString(),proximo_vencimento:payment.nextDueDate??a.proximo_vencimento,cartao_ultimos_digitos:cc.creditCardNumber??a.cartao_ultimos_digitos,cartao_bandeira:cc.creditCardBrand??a.cartao_bandeira}).eq("id",a.id);
        await sb.from("companies").update({status:"ativa",plan:a.plan,trial_until:null,dias_atraso:0,bloqueado_em:null}).eq("id",cid);
        break;
      }
      case "PAYMENT_OVERDUE":{
        await sb.from("subscriptions").update({status:"atrasada"}).eq("id",a.id);
        await sb.from("companies").update({status:"atrasada",dias_atraso:1}).eq("id",cid);
        break;
      }
      case "PAYMENT_DELETED":case "PAYMENT_REFUNDED":case "PAYMENT_CHARGEBACK_REQUESTED":case "PAYMENT_CHARGEBACK_DISPUTE":{
        await sb.from("subscriptions").update({status:"suspensa"}).eq("id",a.id);
        await sb.from("companies").update({status:"atrasada"}).eq("id",cid);
        break;
      }
      case "SUBSCRIPTION_DELETED":case "SUBSCRIPTION_INACTIVATED":{
        await sb.from("subscriptions").update({status:"cancelada"}).eq("id",a.id);
        await sb.from("companies").update({status:"cancelada",bloqueado_em:new Date().toISOString()}).eq("id",cid);
        break;
      }
      case "SUBSCRIPTION_UPDATED":{
        const s=payload.subscription??{};
        if(s.billingType)await sb.from("subscriptions").update({forma_pagamento:s.billingType,valor:s.value??a.valor,proximo_vencimento:s.nextDueDate??a.proximo_vencimento}).eq("id",a.id);
        break;
      }
    }
    await sb.from("asaas_eventos").update({processado:true}).eq("id",log!.id);
    return json({ok:true});
  }catch(e){const m=String(e instanceof Error?e.message:e);console.error("[dmpay-webhook]",m);await sb.from("asaas_eventos").update({erro:m}).eq("id",log!.id);return json({error:"processing_error",message:m},500);}
});
