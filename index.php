<?php
require __DIR__.'/config/database.php';
$currentHome=$pdo->query("SELECT se.numero,b.nome balcao FROM senhas se LEFT JOIN balcoes b ON b.id=se.balcao_id WHERE se.estado IN('chamada','atendimento') ORDER BY se.hora_chamada DESC LIMIT 1")->fetch();
$waitingHome=(int)$pdo->query("SELECT COUNT(*) FROM senhas WHERE estado='espera'")->fetchColumn();
$avgHome=(float)$pdo->query("SELECT COALESCE(AVG(TIMESTAMPDIFF(MINUTE,hora_emissao,hora_chamada)),0) FROM senhas WHERE hora_chamada IS NOT NULL AND DATE(hora_emissao)=CURDATE()")->fetchColumn();
$title='Início'; require __DIR__.'/includes/header.php'; ?>
<div class="hero">
  <div class="container py-4 py-lg-5">
    <nav class="d-flex justify-content-between align-items-center mb-5">
      <a href="/chamaja/" class="brand-logo d-flex align-items-center gap-2"><span class="brand-mark"><i class="bi bi-megaphone-fill"></i></span> ChamaJá</a>
      <button class="btn btn-outline-secondary theme-toggle"><i class="bi bi-moon-stars"></i></button>
    </nav>
    <div class="row align-items-center min-vh-75 g-5">
      <div class="col-lg-7">
        <span class="badge rounded-pill text-bg-light border px-3 py-2 mb-3">Sistema de Senhas Digitais</span>
        <h1 class="hero-title">A sua vez, <span class="gradient-text">sem complicações.</span></h1>
        <p class="lead text-secondary mt-4 mb-4" style="max-width:650px">Organize filas, reduza tempos de espera e acompanhe atendimentos em tempo real com uma experiência simples para clientes e funcionários.</p>
        <div class="d-flex flex-wrap gap-3">
          <a class="btn btn-primary btn-lg px-4" href="senha.php"><i class="bi bi-ticket-perforated me-2"></i>Retirar Senha</a>
          <a class="btn btn-outline-dark btn-lg px-4" href="painel.php"><i class="bi bi-display me-2"></i>Painel de Chamadas</a>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="glass-card p-4 p-lg-5">
          <div class="d-flex justify-content-between align-items-center mb-4"><div><div class="text-secondary small">AGORA A ATENDER</div><div class="fs-1 fw-bold gradient-text"><?=e($currentHome['numero']??'—')?></div></div><span class="brand-mark"><i class="bi bi-bell-fill"></i></span></div>
          <div class="d-flex justify-content-between p-3 rounded-4 bg-body-tertiary"><span>Balcão</span><strong><?=e($currentHome['balcao']??'—')?></strong></div>
          <hr>
          <div class="row g-3">
            <div class="col-6"><div class="p-3 rounded-4 bg-body-tertiary"><small class="text-secondary">Em espera</small><div class="fs-3 fw-bold"><?=$waitingHome?></div></div></div>
            <div class="col-6"><div class="p-3 rounded-4 bg-body-tertiary"><small class="text-secondary">Espera média</small><div class="fs-3 fw-bold"><?=format_minutes($avgHome)?></div></div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="row g-4 pb-5">
      <div class="col-md-4"><a class="action-card card-soft p-4 h-100" href="senha.php"><div class="service-icon mb-3"><i class="bi bi-ticket-perforated"></i></div><h4>Retirar Senha</h4><p class="text-secondary mb-0">Escolha o serviço e receba a sua senha em segundos.</p></a></div>
      <div class="col-md-4"><a class="action-card card-soft p-4 h-100" href="painel.php"><div class="service-icon mb-3"><i class="bi bi-tv"></i></div><h4>Painel de Chamadas</h4><p class="text-secondary mb-0">Acompanhe a senha atual e as últimas chamadas em tempo real.</p></a></div>
      <div class="col-md-4"><a class="action-card card-soft p-4 h-100" href="login.php"><div class="service-icon mb-3"><i class="bi bi-person-lock"></i></div><h4>Área de Funcionários</h4><p class="text-secondary mb-0">Acesso reservado à gestão de atendimentos e administração.</p></a></div>
    </div>
  </div>
</div>
<?php require __DIR__.'/includes/footer.php'; ?>
