<?php
header('Content-Type: application/json');

function sendJson($status, $payload) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function getBearerToken() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.*)$/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function supabaseRequest($method, $url, $token, $body = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
        'apikey: ' . getenv('SUPABASE_ANON_KEY') ?: ''
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error !== '') {
        throw new RuntimeException($error);
    }

    return [$httpCode, $response];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(405, ['error' => 'Method not allowed']);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    sendJson(400, ['error' => 'JSON inválido.']);
}

$userId = trim((string)($data['userId'] ?? ''));
$newPassword = trim((string)($data['password'] ?? ''));

if ($userId === '' || strlen($newPassword) < 8) {
    sendJson(422, ['error' => 'Utilizador inválido e/ou palavra-passe com menos de 8 caracteres.']);
}

$adminToken = getBearerToken();
if ($adminToken === null) {
    sendJson(401, ['error' => 'Token de admin ausente.']);
}

$supabaseUrl = getenv('SUPABASE_URL');
$supabaseAnonKey = getenv('SUPABASE_ANON_KEY');
$supabaseServiceKey = getenv('SUPABASE_SERVICE_ROLE_KEY');

if (!$supabaseUrl || !$supabaseAnonKey || !$supabaseServiceKey) {
    sendJson(500, ['error' => 'Configuração do Supabase em falta no servidor.']);
}

try {
    [$userStatus, $userBody] = supabaseRequest('GET', rtrim($supabaseUrl, '/') . '/rest/v1/profiles?id=eq.' . rawurlencode($userId) . '&select=id,role,active', $adminToken, null);
    if ($userStatus >= 400) {
        sendJson(403, ['error' => 'Não foi possível validar o administrador.']);
    }

    $profileBody = json_decode($userBody, true);
    $isAdmin = false;
    if (is_array($profileBody) && count($profileBody) > 0) {
        $profile = $profileBody[0];
        $isAdmin = (($profile['role'] ?? '') === 'admin' && !empty($profile['active']));
    }

    if (!$isAdmin) {
        sendJson(403, ['error' => 'Acesso restrito a administradores ativos.']);
    }

    $adminUrl = rtrim($supabaseUrl, '/') . '/auth/v1/admin/users/' . rawurlencode($userId);
    $ch = curl_init($adminUrl);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $supabaseServiceKey,
        'apikey: ' . $supabaseServiceKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['password' => $newPassword]));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error !== '') {
        sendJson(500, ['error' => $error]);
    }

    $payload = json_decode($response, true);
    if ($httpCode >= 400) {
        sendJson($httpCode, ['error' => $payload['message'] ?? $payload['error'] ?? 'Não foi possível atualizar a palavra-passe.']);
    }

    sendJson(200, ['ok' => true, 'message' => 'Palavra-passe atualizada com sucesso.']);
} catch (Throwable $exception) {
    sendJson(500, ['error' => $exception->getMessage()]);
}
