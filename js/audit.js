// DM Pay — Auditoria (pilar #2 Gemini)
// Chama a RPC SECURITY DEFINER `dmp_log_audit` que injeta company_id/user_id
// do JWT. Frontend só precisa informar entity/entity_id/action + before/after.
//
// Regra: auditoria NUNCA bloqueia a UI. Todo erro é logado em console
// e silenciado para o usuário.
(function () {
  var IP_CACHE = null;

  async function fetchIp() {
    if (IP_CACHE !== null) return IP_CACHE;
    try {
      var r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      if (!r.ok) throw new Error('ipify ' + r.status);
      var j = await r.json();
      IP_CACHE = j.ip || '';
    } catch (e) {
      IP_CACHE = '';
    }
    return IP_CACHE;
  }

  async function log(entity, entityId, action, before, after) {
    try {
      if (typeof window.sb === 'undefined') return null;
      var ip = await fetchIp();
      var ua = (navigator.userAgent || '').slice(0, 280);
      var res = await window.sb.rpc('dmp_log_audit', {
        p_entity: entity,
        p_entity_id: entityId || null,
        p_action: action,
        p_before: before || null,
        p_after: after || null,
        p_ip_origem: ip || null,
        p_user_agent: ua || null
      });
      if (res && res.error) {
        console.warn('[audit] falhou:', res.error.message);
        return null;
      }
      return res && res.data ? res.data : null;
    } catch (e) {
      console.warn('[audit] exceção:', e);
      return null;
    }
  }

  window.DMPAY_AUDIT = {
    log: log,
    create: function (entity, entityId, after) { return log(entity, entityId, 'create', null, after); },
    update: function (entity, entityId, before, after) { return log(entity, entityId, 'update', before, after); },
    delete: function (entity, entityId, before) { return log(entity, entityId, 'delete', before, null); },
    pay: function (entity, entityId, before, after) { return log(entity, entityId, 'pay', before, after); },
    receive: function (entity, entityId, before, after) { return log(entity, entityId, 'receive', before, after); },
    cancel: function (entity, entityId, before) { return log(entity, entityId, 'cancel', before, null); },
    estorno: function (entity, entityId, before, after) { return log(entity, entityId, 'estorno', before, after); },
    import: function (entity, entityId, after) { return log(entity, entityId, 'import', null, after); }
  };
})();
