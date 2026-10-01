<?php
session_start();
require __DIR__.'/config/database.php';
require __DIR__.'/includes/functions.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $servicoId = filter_input(INPUT_POST, 'servico_id', FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT * FROM servicos WHERE id=? AND ativo=1');
    $stmt->execute([$servicoId]);
    $servico = $stmt->fetch();
    if (!$servico) { flash('danger','Serviço inválido ou indisponível.'); redirect('/chamaja/senha.php'); }

    $pdo->beginTransaction();
    try {
        $serviceLock = $pdo->prepare('SELECT id FROM servicos WHERE id=? FOR UPDATE');
        $serviceLock->execute([$servicoId]);
        $lock = $pdo->prepare('SELECT COUNT(*) FROM senhas WHERE servico_id=?');
        $lock->execute([$servicoId]);
        $seq = (int)$lock->fetchColumn() + 1;
        $numero = $servico['prefixo'] . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
        $ins = $pdo->prepare("INSERT INTO senhas(numero,servico_id,estado,hora_emissao) VALUES(?,?,'espera',NOW())");
        $ins->execute([$numero,$servicoId]);
        $id = (int)$pdo->lastInsertId();
        $pdo->commit();
        redirect('/chamaja/senha.php?emitida='.$id);
    } catch (Throwable $e) {
        $pdo->rollBack();
        flash('danger','Não foi possível emitir a senha.');
        redirect('/chamaja/senha.php');
    }
}

$servicos = $pdo->query("SELECT s.*, (SELECT COUNT(*) FROM senhas x WHERE x.servico_id=s.id AND x.estado='espera') espera FROM servicos s WHERE s.ativo=1 ORDER BY s.nome")->fetchAll();
$emitida = null;
if (!empty($_GET['emitida'])) {
    $q = $pdo->prepare("SELECT se.*, sv.nome servico, (SELECT COUNT(*) FROM senhas x WHERE x.servico_id=se.servico_id AND x.estado='espera' AND x.id < se.id) frente FROM senhas se JOIN servicos sv ON sv.id=se.servico_id WHERE se.id=?");
    $q->execute([(int)$_GET['emitida']]);
    $emitida = $q->fetch();
}
$title='Retirar Senha'; require __DIR__.'/includes/header.php';
?>
<div class="container py-4 py-lg-5">
  <div class="d-flex justify-content-between align-items-center mb-5">
    <a href="/chamaja/" class="brand-logo d-flex align-items-center gap-2"><span class="brand-mark"><i class="bi bi-megaphone-fill"></i></span> ChamaJá</a>
    <a href="/chamaja/" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Início</a>
  </div>
  <?php foreach(get_flashes() as $f): ?><div class="alert alert-<?=e($f['type'])?>"><?=e($f['message'])?></div><?php endforeach; ?>
  <?php if ($emitida): ?>
    <div class="row justify-content-center"><div class="col-lg-7"><div class="ticket-box text-center">
      <div class="text-success fw-semibold mb-2"><i class="bi bi-check-circle-fill"></i> Senha retirada com sucesso!</div>
      <div class="ticket-number"><?=e($emitida['numero'])?></div>
      <h4><?=e($emitida['servico'])?></h4>
      <div class="row g-3 my-4 text-start">
        <div class="col-sm-4"><div class="p-3 bg-body-tertiary rounded-4"><small class="text-secondary">Hora de emissão</small><strong class="d-block"><?=date('H:i',strtotime($emitida['hora_emissao']))?></strong></div></div>
        <div class="col-sm-4"><div class="p-3 bg-body-tertiary rounded-4"><small class="text-secondary">Pessoas à frente</small><strong class="d-block"><?=e((string)$emitida['frente'])?></strong></div></div>
        <div class="col-sm-4"><div class="p-3 bg-body-tertiary rounded-4"><small class="text-secondary">Espera estimada</small><strong class="d-block"><?=max(2,(int)$emitida['frente']*5)?> min</strong></div></div>
      </div>
      <a class="btn btn-primary btn-lg" href="senha.php">Retirar nova senha</a>
    </div></div></div>
  <?php else: ?>
    <div class="text-center mb-5"><span class="badge text-bg-light border mb-3">Escolha o seu atendimento</span><h1 class="fw-bold">Que serviço procura?</h1><p class="text-secondary">Selecione uma opção para gerar a sua senha digital.</p></div>
    <div class="row g-4 justify-content-center">
      <?php foreach($servicos as $s): ?>
      <div class="col-md-6 col-xl-3"><form method="post" class="h-100"><input type="hidden" name="csrf" value="<?=e(csrf_token())?>"><input type="hidden" name="servico_id" value="<?=$s['id']?>"><button class="service-card card-soft p-4 h-100 w-100 text-start border" type="submit">
        <div class="service-icon mb-4"><i class="bi bi-briefcase-fill"></i></div><h4><?=e($s['nome'])?></h4><p class="text-secondary"><?=e($s['descricao'])?></p><div class="d-flex justify-content-between align-items-center"><span class="small text-secondary"><?=e((string)$s['espera'])?> em espera</span><i class="bi bi-arrow-right-circle fs-4 text-primary"></i></div>
      </button></form></div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>
<?php require __DIR__.'/includes/footer.php'; ?>
