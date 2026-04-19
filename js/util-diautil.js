// DM Pay — regra de dia útil para vencimentos (sáb/dom → próxima seg)
(function() {
  function parseISO(iso) {
    if (iso instanceof Date) return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
    const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
    return new Date(y, m-1, d);
  }
  function isoOf(d) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }
  // Retorna próximo dia útil (se dia já é útil, retorna ele mesmo)
  function proximoDiaUtil(iso) {
    const d = parseISO(iso);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  }
  function proximoDiaUtilISO(iso) { return isoOf(proximoDiaUtil(iso)); }
  // Boleto venceu em fim de semana? Retorna true se sáb ou dom
  function eFimDeSemana(iso) {
    const d = parseISO(iso);
    return d.getDay() === 0 || d.getDay() === 6;
  }
  // Está atrasado considerando regra fim de semana?
  // Ex: boleto vence sáb 18. Hoje é seg 20. Banco ainda considera válido no seg — NÃO está atrasado.
  // Só vira atrasado se HOJE > proximoDiaUtil(vencimento).
  function estaAtrasado(dueIso, hoje) {
    const h = hoje ? parseISO(hoje) : (function(){ const d=new Date(); d.setHours(0,0,0,0); return d; })();
    const efetivo = proximoDiaUtil(dueIso);
    return h > efetivo;
  }
  window.DMPAY_DIAUTIL = {
    proximo: proximoDiaUtil,
    proximoISO: proximoDiaUtilISO,
    eFimDeSemana: eFimDeSemana,
    atrasado: estaAtrasado
  };
})();
