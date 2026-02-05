# S+ CRM - Guia de Uso Geral

Este projeto foi configurado para rodar facilmente em ambiente Windows com Docker.

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando.
- PowerShell.

## Como Iniciar

1.  Abra o PowerShell na pasta raiz do projeto.
2.  Execute o script de configuração:
    ```powershell
    .\setup_windows.ps1
    ```
3.  O script irá:
    - Criar os arquivos de configuração (`.env`) se não existirem.
    - Gerar senhas seguras automaticamente.
    - Perguntar se você deseja iniciar o sistema.

## Acessando o Sistema

Após o Docker iniciar os serviços (pode levar alguns minutos na primeira vez):

- **Frontend (Aplicação Web):** [http://localhost:4173](http://localhost:4173)
- **Backend (API):** [http://localhost:3000](http://localhost:3000)
    - Verifique se está tudo ok acessando: [http://localhost:3000/health](http://localhost:3000/health)

## Comandos Úteis

- Parar o sistema:
    ```powershell
    docker compose -f ops/docker-compose.yml down
    ```
- Ver os logs:
    ```powershell
    docker compose -f ops/docker-compose.yml logs -f
    ```
