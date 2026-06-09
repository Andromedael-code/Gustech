# GusTech backend

## Como subir sem Docker
O backend roda em SQLite por padrao no desenvolvimento. Nao precisa instalar MySQL nem abrir Docker.

```bash
cd backend
npm install
npm run dev
```

Na primeira execucao ele cria `data/gustech.sqlite`, aplica o schema e popula o catalogo inicial.

## Banco de dados
Use `.env.example` como base.

- `DB_CLIENT=sqlite`: modo local sem Docker.
- `SQLITE_PATH=data/gustech.sqlite`: caminho do arquivo SQLite.
- `DB_CLIENT=mysql`: modo MySQL opcional para ambiente externo/producao.

As variaveis `MYSQL_*` so sao usadas quando `DB_CLIENT=mysql`.

## Autenticacao local
Para rotas protegidas em desenvolvimento:

- `Authorization: Bearer dev-user`
- `Authorization: Bearer dev-admin`
- ou headers `x-user-id`, `x-user-email` e opcionalmente `x-user-role`

## Rotinas automaticas
Ao iniciar, o backend:

1. cria/valida o schema do banco configurado
2. testa a conexao
3. insere produtos padrao quando a tabela `products` esta vazia

O endpoint `POST /api/seed` continua disponivel para reexecutar o seed sem duplicar produtos.
