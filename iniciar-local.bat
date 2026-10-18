@echo off
setlocal
cd /d "%~dp0"
title Meu Dinheiro - Servidor Local

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nao encontrado.
  echo   Instale a versao LTS em https://nodejs.org e tente novamente.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   Primeira execucao: instalando dependencias...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Falha ao instalar dependencias. Verifique sua conexao.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo.
  echo   Aviso: arquivo .env nao encontrado.
  echo   Rodando com banco local de teste no arquivo .local-data.json.
  echo   Copie .env.example para .env e preencha DATABASE_URL para usar o Neon.
  echo.
)

echo.
echo   Iniciando o servidor e abrindo o navegador...
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server.js

echo.
echo   Servidor encerrado.
pause
