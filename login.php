<?php
session_start();
require __DIR__.'/config/database.php';
require __DIR__.'/includes/functions.php';
if (!empty($_SESSION['user'])) redirect(($_SESSION['user']['tipo']==='admin')?'/chamaja/admin/dashboard.php':'/chamaja/funcionario/dashboard.php');
$erro='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    $login=trim($_POST['login']??''); $password=$_POST['password']??'';
    $q=$pdo->prepare("SELECT u.*,s.nome servico,b.nome balcao FROM users u LEFT JOIN servicos s ON s.id=u.servico_id LEFT JOIN balcoes b ON b.id=u.balcao_id WHERE (u.email=? OR u.nome=?) AND u.ativo=1 LIMIT 1");
    $q->execute([$login,$login]); $u=$q->fetch();
    if ($u && password_verify($password,$u['password'])) {
        session_regenerate_id(true);
        unset($u['password']); $_SESSION['user']=$u;
        if ($u['tipo']==='funcionario') { $pdo->prepare('UPDATE users SET online=1 WHERE id=?')->execute([$u['id']]); $_SESSION['user']['online']=1; }
        redirect($u['tipo']==='admin'?'/chamaja/admin/dashboard.php':'/chamaja/funcionario/dashboard.php');
    }
    $erro='Credenciais inválidas ou conta inativa.';
}
$title='Área de Funcionários'; require __DIR__.'/includes/header.php';
?>
<div class="login-shell"><div class="card login-card p-4 p-md-5">
  <div class="text-center mb-4"><span class="brand-mark mb-3"><i class="bi bi-megaphone-fill"></i></span><h2 class="fw-bold">ChamaJá</h2><p class="text-secondary">Área de Funcionários</p></div>
  <?php if($erro):?><div class="alert alert-danger"><?=e($erro)?></div><?php endif;?>
  <form method="post"><input type="hidden" name="csrf" value="<?=e(csrf_token())?>">
    <div class="mb-3"><label class="form-label">Email ou nome de utilizador</label><input class="form-control form-control-lg" name="login" autocomplete="username" required></div>
    <div class="mb-4"><label class="form-label">Palavra-passe</label><input type="password" class="form-control form-control-lg" name="password" autocomplete="current-password" required></div>
    <button class="btn btn-primary btn-lg w-100">Entrar</button>
  </form>
  <a href="/chamaja/" class="text-center mt-4 small">← Voltar ao início</a>
</div></div>
<?php require __DIR__.'/includes/footer.php'; ?>
