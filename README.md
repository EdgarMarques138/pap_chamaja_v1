# ChamaJá

## Sistema de Senhas Digitais

O **ChamaJá** é um sistema web de gestão de senhas e listas de espera desenvolvido em PHP, MySQL, HTML, CSS e JavaScript. Inclui emissão de senhas, painel de chamadas em tempo real, área de funcionários, administração, histórico, estatísticas e relatórios.

## Requisitos

- XAMPP com Apache, PHP 8+ e MySQL/MariaDB
- Navegador moderno
- Ligação à Internet para carregar Bootstrap, Bootstrap Icons e Chart.js por CDN

## Instalação passo a passo

1. Instala o XAMPP.
2. Abre o XAMPP Control Panel e inicia **Apache** e **MySQL**.
3. Copia a pasta `chamaja` para:
   - Windows: `C:\xampp\htdocs\chamaja`
4. Abre o phpMyAdmin em `http://localhost/phpmyadmin/`.
5. Vai a **Importar** e seleciona o ficheiro `database.sql` desta pasta.
6. O script cria automaticamente a base de dados `chamaja`, as tabelas e dados de teste.
7. Confirma `config/database.php`. Na configuração padrão do XAMPP é usado:
   - Host: `localhost`
   - Base de dados: `chamaja`
   - Utilizador: `root`
   - Palavra-passe: vazia
8. Abre no navegador:
   - `http://localhost/chamaja/`

## Credenciais de teste

### Administrador
- Email: `admin@chamaja.pt`
- Palavra-passe: `admin123`

### Funcionário — Atendimento Geral
- Email: `joao@chamaja.pt`
- Palavra-passe: `func123`

### Funcionário — Tesouraria
- Email: `maria@chamaja.pt`
- Palavra-passe: `func123`

> Estas credenciais existem apenas para ambiente de desenvolvimento. Numa utilização real, altera imediatamente as palavras-passe.

## Fluxo de teste recomendado

1. Na página inicial, abre **Retirar Senha**.
2. Escolhe um serviço e gera uma senha.
3. Noutro separador, abre o **Painel de Chamadas**.
4. Faz login com um funcionário associado ao mesmo serviço.
5. Entra em **Atendimento** e carrega em **Chamar Próxima Senha**.
6. O painel público atualiza automaticamente a cada 3 segundos.
7. Inicia e conclui o atendimento.
8. Entra como administrador para consultar estatísticas, histórico e relatórios.

## Estrutura principal

```text
chamaja/
├── assets/
│   ├── css/style.css
│   ├── js/app.js
│   ├── img/
│   └── sounds/notify.wav
├── config/database.php
├── includes/
│   ├── auth.php
│   ├── functions.php
│   ├── header.php
│   ├── sidebar.php
│   └── footer.php
├── admin/
│   ├── dashboard.php
│   ├── servicos.php
│   ├── funcionarios.php
│   ├── balcoes.php
│   ├── relatorios.php
│   ├── historico.php
│   └── definicoes.php
├── funcionario/
│   ├── dashboard.php
│   └── atendimento.php
├── api/
│   ├── proxima_senha.php
│   ├── painel.php
│   └── estatisticas.php
├── index.php
├── senha.php
├── painel.php
├── login.php
├── logout.php
├── database.sql
└── README.md
```

## Segurança implementada

- `password_hash()` e `password_verify()`
- PDO com prepared statements
- Sessões PHP
- Regeneração do ID de sessão após login
- Proteção CSRF nos formulários com alterações
- Validação de dados recebidos
- Escape de HTML com `htmlspecialchars()`
- Proteção de páginas privadas por sessão e função
- Restrição de páginas administrativas a administradores

## Notas

- O painel público consulta `api/painel.php` automaticamente a cada 3 segundos.
- O número das senhas é gerado por serviço (ex.: `A001`, `T001`, `SE001`).
- O relatório pode ser exportado para CSV. Para PDF, usa **Imprimir → Guardar como PDF** no navegador.
- O tema claro/escuro é guardado localmente no navegador.
