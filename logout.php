<?php
session_start();
if (!empty($_SESSION['user']['id']) && ($_SESSION['user']['tipo'] ?? '') === 'funcionario') {
    require __DIR__.'/config/database.php';
    $pdo->prepare('UPDATE users SET online=0 WHERE id=?')->execute([$_SESSION['user']['id']]);
}
$_SESSION=[];
if (ini_get('session.use_cookies')) { $p=session_get_cookie_params(); setcookie(session_name(),'',time()-42000,$p['path'],$p['domain'],$p['secure'],$p['httponly']); }
session_destroy();
header('Location: /chamaja/login.php');
exit;
