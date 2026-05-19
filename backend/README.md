# GusTech backend

## O que mudou
- Firebase removido do backend
- inicialização automática do schema MySQL no startup
- seed automático do catálogo quando a tabela `products` estiver vazia
- endpoint opcional `POST /api/seed` para reexecutar a rotina de seed sem duplicar produtos
- logs mais claros para falhas de banco e de aplicação

## Como subir
```bash
cd backend
npm install
npm run dev
```

O backend passa a:
1. criar o banco/tabelas se necessário
2. validar a conexão com MySQL
3. inserir automaticamente produtos padrão quando `products` estiver vazia

## Variáveis principais
Use `.env.example` como base e configure:
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `CORS_ORIGIN`
- `ADMIN_ALLOWLIST`

## Autenticação local para desenvolvimento
O backend não depende mais de Firebase Auth.

Para rotas protegidas, use uma destas opções:
- `Authorization: Bearer dev-user`
- `Authorization: Bearer dev-admin`
- headers `x-user-id`, `x-user-email` e opcionalmente `x-user-role`

## Observação
O catálogo público em `/api/products` funciona totalmente em MySQL e não depende de credenciais externas.
