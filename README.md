# ChamaJá

## Sistema de Senhas Digitais

O **ChamaJá** é uma aplicação web estática de gestão de senhas. Pode funcionar localmente no navegador ou usar o Supabase como backend alojado para partilhar filas e autenticar funcionários. Não requer instalação local. Os ficheiros PHP/MySQL antigos continuam no repositório, mas não são usados pelo site GitHub Pages.

## Versão local sem instalação

Abre `index.html` diretamente no navegador. Esta versão pública não usa PHP, servidor, base de dados, bibliotecas externas ou instalação. A fila fica guardada no armazenamento local do navegador e pode ser usada nas opções **Retirar senha** e **Painel**.

Esta modalidade é apenas local: não tem login nem sincroniza dados com outros computadores ou telemóveis. O atendimento dos funcionários está separado em `funcionarios.html` e requer o Supabase configurado.

## Portal de funcionários

Abre `funcionarios.html` ou usa a ligação **Funcionários** na navegação pública. A página só mostra controlos após autenticação de um perfil `attendant` ativo, com serviço e balcão atribuídos. A lista mostra senhas de todos os serviços; chamar e atualizar senhas continua limitado ao serviço e balcão do funcionário. Sem configuração válida do Supabase, o login permanece bloqueado.

## Backend online com Supabase

1. Cria um projeto no Supabase, sem instalar software no computador.
2. No **SQL Editor**, executa todo o conteúdo de `supabase/schema.sql`.
3. Em **Project Settings → API**, copia o Project URL e a chave `anon`/publishable para `assets/js/backend-config.js`:

    ```js
    window.CHAMAJA_BACKEND = {
       supabaseUrl: 'https://TEU-PROJETO.supabase.co',
       supabaseAnonKey: 'A-TUA-CHAVE-PUBLICA'
    };
    ```

4. Em **Authentication → Users**, cria os utilizadores do atendimento. Para cada utilizador, copia o UUID e cria um perfil na tabela `profiles`:

    ```sql
    insert into public.profiles (id, full_name, role, service_id, counter_id)
    values (
       'UUID-DO-UTILIZADOR',
       'Nome do funcionário',
       'attendant',
       '00000000-0000-4000-8000-000000000004',
       '00000000-0000-4000-8000-000000000011'
    );
    ```

   Usa `role = 'attendant'`. Só perfis ativos de funcionários com serviço e balcão atribuídos podem entrar no atendimento e chamar senhas. Os IDs dos balcões 1–4 terminam em `011`–`014`; os IDs dos serviços estão definidos no schema.
5. Publica as alterações no GitHub Pages. A emissão pública e o painel usam o backend; o atendimento exige sessão. A gestão de contas e perfis é feita no painel do Supabase.

No frontend usa-se apenas a chave pública `anon`/publishable. **Nunca coloques a chave `service_role` no site.** Os dados locais existentes não são migrados automaticamente para o Supabase.

## Requisitos da versão PHP antiga

- XAMPP com Apache, PHP 8+ e MySQL/MariaDB
- Navegador moderno
- Ligação à Internet para carregar Bootstrap, Bootstrap Icons e Chart.js por CDN

## Execução da versão PHP antiga (opcional)

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

## Credenciais da versão PHP antiga

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

## Fluxo da versão PHP antiga

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
│   └── js/
│       ├── backend-config.js
│       └── staff.js
├── supabase/schema.sql
├── funcionarios.html
├── index.html
├── README.md
├── database.sql
└── [ficheiros PHP antigos]
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
