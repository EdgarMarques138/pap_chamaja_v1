<?php $title='Painel de Chamadas'; require __DIR__.'/includes/header.php'; ?>
<div class="display-page p-4 p-lg-5">
  <div class="d-flex justify-content-between align-items-center mb-5"><div class="d-flex gap-3 align-items-center"><span class="brand-mark"><i class="bi bi-megaphone-fill"></i></span><div><h2 class="mb-0">ChamaJá</h2><small class="text-white-50">Sistema de Senhas Digitais</small></div></div><div class="fs-4" id="clock"></div></div>
  <div class="row g-4">
    <div class="col-lg-8"><div class="rounded-5 p-4 p-lg-5 text-center h-100" style="background:#151c31"><div class="text-uppercase text-white-50 fw-semibold fs-5">Senha atual</div><div id="currentTicket" class="display-ticket my-4">---</div><div id="currentCounter" class="display-counter">A aguardar chamada</div><p id="direction" class="fs-4 text-white-50 mt-3 mb-0"></p></div></div>
    <div class="col-lg-4"><div class="rounded-5 p-4 h-100" style="background:#151c31"><h3 class="mb-4">Últimas senhas chamadas</h3><div id="lastTickets" class="d-grid gap-3"></div></div></div>
  </div>
</div>
<audio id="notify"><source src="assets/sounds/notify.wav" type="audio/wav"></audio>
<script>
let lastSeen=null;
function clock(){document.getElementById('clock').textContent=new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} setInterval(clock,1000);clock();
async function loadPanel(){try{const r=await fetch('api/painel.php',{cache:'no-store'});const d=await r.json();const c=d.current;if(c){const el=document.getElementById('currentTicket');if(lastSeen&&lastSeen!==c.numero){el.classList.remove('pulse-new');void el.offsetWidth;el.classList.add('pulse-new');document.getElementById('notify').play().catch(()=>{});} lastSeen=c.numero;el.textContent=c.numero;document.getElementById('currentCounter').textContent=(c.balcao||'Balcão').toUpperCase();document.getElementById('direction').textContent='Dirija-se ao '+(c.balcao||'balcão indicado');}
 document.getElementById('lastTickets').innerHTML=d.last.map(x=>`<div class="d-flex justify-content-between align-items-center p-3 rounded-4" style="background:#202a45"><strong class="fs-4">${x.numero}</strong><span class="text-white-50">${x.balcao||'—'}</span></div>`).join('');}catch(e){}}
loadPanel();setInterval(loadPanel,3000);
</script>
<?php require __DIR__.'/includes/footer.php'; ?>
