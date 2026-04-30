import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://sandbox.asaas.com/api/v3";
const ASAAS_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
const PLATFORM_ID = "aaaa0001-0000-0000-0000-000000000001";
async function asaas(p:string,init:RequestInit={}){const r=await fetch(`${ASAAS_BASE}${p}`,{...init,headers:{...(init.headers||{}),"access_token":ASAAS_KEY,"content-type":"application/json","User-Agent":"DMPay/1.0"}});const t=await r.text();const d=t?JSON.parse(t):{};if(!r.ok)throw new Error(`Asaas ${r.status}: ${t}`);return d;}
Deno.serve(async(req)=>{
  const cors = corsHeaders(req);
  const json = (b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json"}});
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const jwt=(req.headers.get("authorization")??"").replace("Bearer ","");
  if(!jwt)return json({error:"unauthorized"},401);
  const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
  const {data:u}=await sb.auth.getUser(jwt);
  if(!u?.user)return json({error:"unauthorized"},401);
  const b=await req.json().catch(()=>({}));
  const {company_id,plan,valor,ciclo="MONTHLY"}=b;const forma_pagamento="UNDEFINED";
  if(!company_id||!plan||!valor)return json({error:"missing_fields"},400);
  const {data:perfil}=await sb.from("profiles").select("company_id,role").eq("id",u.user.id).single();
  const isAdmin=perfil?.company_id===PLATFORM_ID&&perfil?.role==="dono";
  if(!isAdmin&&perfil?.company_id!==company_id)return json({error:"forbidden"},403);
  const {data:co,error:ce}=await sb.from("companies").select("id,legal_name,cnpj,email,phone,whatsapp,asaas_customer_id").eq("id",company_id).single();
  if(ce||!co)return json({error:"company_not_found"},404);
  try{
    // Deduplicação: se já tem assinatura ativa/pendente do mesmo plano, retorna ela
    const {data:exi}=await sb.from("subscriptions").select("*").eq("company_id",company_id).in("status",["pendente","ativa","atrasada","suspensa"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(exi&&exi.plan===plan){
      let iu:string|null=null;
      try{const ps=await asaas(`/payments?subscription=${exi.asaas_subscription_id}&status=PENDING&limit=1`);if(ps?.data?.[0])iu=ps.data[0].invoiceUrl??ps.data[0].bankSlipUrl??null;}catch(_){}
      return json({ok:true,assinatura:exi,subscription_id:exi.asaas_subscription_id,invoice_url:iu,duplicado:true});
    }
    // Cria/reutiliza customer Asaas
    let cid=co.asaas_customer_id;
    if(!cid){
      const c=await asaas("/customers",{method:"POST",body:JSON.stringify({name:co.legal_name,cpfCnpj:(co.cnpj??"").replace(/\D/g,"")||undefined,email:co.email??undefined,mobilePhone:(co.whatsapp??co.phone??"").replace(/\D/g,"")||undefined,externalReference:co.id})});
      cid=c.id;
      await sb.from("companies").update({asaas_customer_id:cid}).eq("id",co.id);
    }
    const nd=new Date();nd.setDate(nd.getDate()+7);
    const ndi=nd.toISOString().slice(0,10);
    const sub=await asaas("/subscriptions",{method:"POST",body:JSON.stringify({customer:cid,billingType:forma_pagamento,value:Number(valor),nextDueDate:ndi,cycle:ciclo,description:`DM Pay - Plano ${plan}`,externalReference:`dmpay:${co.id}`})});
    const {data:a,error:ae}=await sb.from("subscriptions").insert({company_id:co.id,asaas_customer_id:cid,asaas_subscription_id:sub.id,plan,valor:Number(valor),ciclo,forma_pagamento,status:"pendente",proximo_vencimento:ndi}).select().single();
    if(ae)throw ae;
    let invoiceUrl:string|null=null;
    try{const ps=await asaas(`/payments?subscription=${sub.id}&limit=1`);if(ps?.data?.[0])invoiceUrl=ps.data[0].invoiceUrl??ps.data[0].bankSlipUrl??null;}catch(_){}
    return json({ok:true,assinatura:a,subscription_id:sub.id,invoice_url:invoiceUrl});
  }catch(e){console.error("[dmpay-asaas-criar]",e);return json({error:"asaas_error",message:String(e instanceof Error?e.message:e)},500);}
});
