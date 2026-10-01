-- ChamaJá — Sistema de Senhas Digitais
-- Base de dados para MySQL/MariaDB (XAMPP)

CREATE DATABASE IF NOT EXISTS chamaja CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chamaja;

SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS atendimentos;
DROP TABLE IF EXISTS senhas;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS balcoes;
DROP TABLE IF EXISTS servicos;
SET FOREIGN_KEY_CHECKS=1;

CREATE TABLE servicos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    prefixo VARCHAR(4) NOT NULL,
    descricao VARCHAR(255) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_servicos_prefixo (prefixo),
    KEY idx_servicos_ativo (ativo)
) ENGINE=InnoDB;

CREATE TABLE balcoes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_balcoes_nome (nome),
    KEY idx_balcoes_ativo (ativo)
) ENGINE=InnoDB;

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL,
    password VARCHAR(255) NOT NULL,
    tipo ENUM('admin','funcionario') NOT NULL DEFAULT 'funcionario',
    servico_id INT UNSIGNED NULL,
    balcao_id INT UNSIGNED NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    online TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_tipo_ativo (tipo, ativo),
    KEY idx_users_servico (servico_id),
    KEY idx_users_balcao (balcao_id),
    CONSTRAINT fk_users_servico FOREIGN KEY (servico_id) REFERENCES servicos(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_users_balcao FOREIGN KEY (balcao_id) REFERENCES balcoes(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE senhas (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(20) NOT NULL,
    servico_id INT UNSIGNED NOT NULL,
    estado ENUM('espera','chamada','atendimento','concluida','ausente') NOT NULL DEFAULT 'espera',
    hora_emissao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hora_chamada DATETIME NULL,
    hora_inicio DATETIME NULL,
    hora_fim DATETIME NULL,
    funcionario_id INT UNSIGNED NULL,
    balcao_id INT UNSIGNED NULL,
    UNIQUE KEY uk_senhas_numero (numero),
    KEY idx_senhas_fila (servico_id, estado, hora_emissao),
    KEY idx_senhas_estado (estado),
    KEY idx_senhas_funcionario (funcionario_id),
    KEY idx_senhas_balcao (balcao_id),
    KEY idx_senhas_chamada (hora_chamada),
    CONSTRAINT fk_senhas_servico FOREIGN KEY (servico_id) REFERENCES servicos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_senhas_funcionario FOREIGN KEY (funcionario_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_senhas_balcao FOREIGN KEY (balcao_id) REFERENCES balcoes(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE atendimentos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    senha_id BIGINT UNSIGNED NOT NULL,
    funcionario_id INT UNSIGNED NULL,
    servico_id INT UNSIGNED NOT NULL,
    balcao_id INT UNSIGNED NULL,
    inicio DATETIME NOT NULL,
    fim DATETIME NULL,
    tempo_espera INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Minutos',
    duracao INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Minutos',
    estado ENUM('concluida','ausente') NOT NULL DEFAULT 'concluida',
    UNIQUE KEY uk_atendimentos_senha (senha_id),
    KEY idx_atendimentos_funcionario (funcionario_id),
    KEY idx_atendimentos_servico (servico_id),
    KEY idx_atendimentos_fim (fim),
    CONSTRAINT fk_atendimentos_senha FOREIGN KEY (senha_id) REFERENCES senhas(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_atendimentos_funcionario FOREIGN KEY (funcionario_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_atendimentos_servico FOREIGN KEY (servico_id) REFERENCES servicos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_atendimentos_balcao FOREIGN KEY (balcao_id) REFERENCES balcoes(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO servicos (nome,prefixo,descricao,ativo) VALUES
('Tesouraria','T','Pagamentos, faturas, taxas e outros assuntos financeiros.',1),
('Suporte Técnico','S','Apoio com equipamentos, acessos e problemas técnicos.',1),
('Secretaria','SE','Documentos, inscrições, declarações e assuntos administrativos.',1),
('Atendimento Geral','A','Informações gerais e encaminhamento para outros serviços.',1);

INSERT INTO balcoes (nome,ativo) VALUES
('Balcão 1',1),('Balcão 2',1),('Balcão 3',1),('Balcão 4',1);

-- Credenciais de desenvolvimento:
-- admin@chamaja.pt / admin123
-- joao@chamaja.pt / func123
-- maria@chamaja.pt / func123
INSERT INTO users (nome,email,password,tipo,servico_id,balcao_id,ativo,online) VALUES
('Administrador ChamaJá','admin@chamaja.pt','$2y$12$Prq69ePUvF6uAjYaRvAHu.ceWX9yEffVgEhC7fR2xm8a7Du5YTVY6','admin',NULL,NULL,1,0),
('João Silva','joao@chamaja.pt','$2y$12$A8/v4LpQ311ZH2ut3pgsMeFsXCAh2/s6uyrg/wOZG..2guACV3.WK','funcionario',4,1,1,0),
('Maria Costa','maria@chamaja.pt','$2y$12$A8/v4LpQ311ZH2ut3pgsMeFsXCAh2/s6uyrg/wOZG..2guACV3.WK','funcionario',1,3,1,0);

INSERT INTO senhas (numero,servico_id,estado,hora_emissao,hora_chamada,hora_inicio,hora_fim,funcionario_id,balcao_id) VALUES
('A001',4,'concluida',DATE_SUB(NOW(),INTERVAL 70 MINUTE),DATE_SUB(NOW(),INTERVAL 60 MINUTE),DATE_SUB(NOW(),INTERVAL 59 MINUTE),DATE_SUB(NOW(),INTERVAL 53 MINUTE),2,1),
('A002',4,'concluida',DATE_SUB(NOW(),INTERVAL 58 MINUTE),DATE_SUB(NOW(),INTERVAL 49 MINUTE),DATE_SUB(NOW(),INTERVAL 48 MINUTE),DATE_SUB(NOW(),INTERVAL 42 MINUTE),2,1),
('T001',1,'concluida',DATE_SUB(NOW(),INTERVAL 51 MINUTE),DATE_SUB(NOW(),INTERVAL 38 MINUTE),DATE_SUB(NOW(),INTERVAL 37 MINUTE),DATE_SUB(NOW(),INTERVAL 28 MINUTE),3,3),
('A003',4,'chamada',DATE_SUB(NOW(),INTERVAL 18 MINUTE),DATE_SUB(NOW(),INTERVAL 1 MINUTE),NULL,NULL,2,1),
('A004',4,'espera',DATE_SUB(NOW(),INTERVAL 12 MINUTE),NULL,NULL,NULL,NULL,NULL),
('A005',4,'espera',DATE_SUB(NOW(),INTERVAL 7 MINUTE),NULL,NULL,NULL,NULL,NULL),
('T002',1,'espera',DATE_SUB(NOW(),INTERVAL 10 MINUTE),NULL,NULL,NULL,NULL,NULL),
('S001',2,'espera',DATE_SUB(NOW(),INTERVAL 6 MINUTE),NULL,NULL,NULL,NULL,NULL),
('SE001',3,'espera',DATE_SUB(NOW(),INTERVAL 4 MINUTE),NULL,NULL,NULL,NULL,NULL);

INSERT INTO atendimentos (senha_id,funcionario_id,servico_id,balcao_id,inicio,fim,tempo_espera,duracao,estado) VALUES
(1,2,4,1,DATE_SUB(NOW(),INTERVAL 59 MINUTE),DATE_SUB(NOW(),INTERVAL 53 MINUTE),10,6,'concluida'),
(2,2,4,1,DATE_SUB(NOW(),INTERVAL 48 MINUTE),DATE_SUB(NOW(),INTERVAL 42 MINUTE),9,6,'concluida'),
(3,3,1,3,DATE_SUB(NOW(),INTERVAL 37 MINUTE),DATE_SUB(NOW(),INTERVAL 28 MINUTE),13,9,'concluida');
