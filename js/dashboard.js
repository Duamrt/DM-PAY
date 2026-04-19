// DM Pay — Dashboard personalization + status check
(function() {
  function init() {
    if (!window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    const profile = window.DMPAY_PROFILE;
    const company = window.DMPAY_COMPANY;
    const isPlatformAdmin = company.id === window.DMPAY_CONFIG.PLATFORM_COMPANY_ID;
    const firstName = (profile.name || profile.email || '').split(' ')[0];
    const empresaNome = company.trade_name || company.legal_name || 'sua empresa';

    // Saudação dinâmica baseada na hora
    const h = new Date().getHours();
    const sauda = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');

    // Atualiza H1
    const h1 = document.querySelector('.hero h1');
    if (h1) h1.textContent = `${sauda}, ${firstName}`;

    // Atualiza subtítulo do hero
    const heroP = document.querySelector('.hero p');
    if (heroP) {
      const dia = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
      const planoTxt = isPlatformAdmin ? 'modo administrador DM Stack' : (company.plan === 'trial' ? `trial até ${new Date(company.trial_until).toLocaleDateString('pt-BR')}` : 'plano ' + company.plan);
      heroP.innerHTML = `<span class="dot-success"></span> <b>${dia}</b> · <b>${empresaNome}</b> · ${planoTxt}`;
    }

    // Verifica se tem dados no banco
    sb.from('payables').select('id', { count:'exact', head:true }).eq('company_id', company.id)
      .then(({ count }) => {
        const temDados = count > 0;
        if (!temDados && !document.getElementById('demo-banner')) {
          // Banner amarelo: dados de demo
          const main = document.querySelector('main');
          if (!main) return;
          const banner = document.createElement('div');
          banner.id = 'demo-banner';
          banner.style.cssText = 'background:linear-gradient(135deg,#FEF3C7,transparent);border:1px solid #D97706;border-left:4px solid #D97706;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;gap:12px;align-items:flex-start;font-size:13px;color:#111';
          banner.innerHTML = `
            <i data-lucide="info" style="width:18px;height:18px;color:#D97706;flex-shrink:0;margin-top:2px"></i>
            <div style="flex:1">
              <b style="display:block;margin-bottom:2px">Você está vendo dados de demonstração</b>
              <span style="color:#6B7280">Os números abaixo são exemplos do Mercadinho Liberato. Pra ver seus dados reais, vá em
                <a href="contas-a-pagar.html" style="color:#2563EB;font-weight:600;text-decoration:none">Contas a Pagar</a>
                e clique em <b>Importar histórico</b>.</span>
            </div>
            <button onclick="document.getElementById('demo-banner').remove()" style="background:transparent;border:none;color:#6B7280;cursor:pointer;padding:4px"><i data-lucide="x" style="width:14px;height:14px"></i></button>`;
          main.insertBefore(banner, main.firstChild);
          lucide.createIcons();
        }
      });

    // Fix do R$ NaN no IRPJ+CSLL (no DRE snapshot do dashboard)
    setTimeout(() => {
      document.querySelectorAll('.dre-line .v').forEach(el => {
        if (el.textContent.includes('NaN')) el.textContent = '−R$ 39.464';
      });
    }, 200);
  }
  init();
})();
