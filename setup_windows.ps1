$ErrorActionPreference = "Stop"

Write-Host "Iniciando configuração do S+ CRM para Windows..." -ForegroundColor Cyan

# Função para gerar senhas aleatórias
function Generate-Secret {
    return -join ((33..126) | Get-Random -Count 32 | % {[char]$_})
}

# Configurar Backend
$backendPath = Join-Path $PSScriptRoot "backend"
$backendEnv = Join-Path $backendPath ".env"
$backendEnvExample = Join-Path $backendPath ".env.example"

if (-not (Test-Path $backendEnv)) {
    Write-Host "Criando arquivo .env do backend..." -ForegroundColor Yellow
    Copy-Item $backendEnvExample $backendEnv
    
    $content = Get-Content $backendEnv
    $newContent = @()
    foreach ($line in $content) {
        if ($line -match "^JWT_SECRET=") {
            $secret = Generate-Secret
            $newContent += "JWT_SECRET=$secret"
        }
        elseif ($line -match "^WPP_API_KEY=") {
            $secret = Generate-Secret
            $newContent += "WPP_API_KEY=$secret"
        }
        elseif ($line -match "^DATABASE_URL=") {
             # Uncomment and set default local url
             $newContent += "DATABASE_URL=postgresql://postgres:12345@localhost:5432/crm?schema=public"
        }
        else {
            $newContent += $line
        }
    }
    $newContent | Set-Content $backendEnv
    Write-Host "Backend configurado." -ForegroundColor Green
} else {
    Write-Host "Arquivo .env do backend já existe. Pulando." -ForegroundColor Gray
}

# Configurar Frontend
$frontendPath = Join-Path $PSScriptRoot "crm-frontend"
$frontendEnv = Join-Path $frontendPath ".env"
$frontendEnvExample = Join-Path $frontendPath ".env.example"

if (-not (Test-Path $frontendEnv)) {
    Write-Host "Criando arquivo .env do frontend..." -ForegroundColor Yellow
    Copy-Item $frontendEnvExample $frontendEnv
    Write-Host "Frontend configurado." -ForegroundColor Green
} else {
    Write-Host "Arquivo .env do frontend já existe. Pulando." -ForegroundColor Gray
}

Write-Host "`nConfiguração concluída!" -ForegroundColor Cyan
Write-Host "Para rodar o sistema, certifique-se que o Docker está rodando e execute:"
Write-Host "docker compose -f ops/docker-compose.yml up -d --build" -ForegroundColor Yellow

$response = Read-Host "`nDeseja rodar o docker compose agora? (s/N)"
if ($response -eq 's' -or $response -eq 'S') {
    docker compose -f ops/docker-compose.yml up -d --build
}
