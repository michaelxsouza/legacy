# Legacy

Sistema de controle de Fichas Douradas e Jogadores na Base.

## Setup rápido

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie `.env.local` e preencha com os dados do seu projeto Supabase:

```bash
# No painel do Supabase: Settings > Database > Connection string
DATABASE_URL="postgresql://postgres.[REF]:[SENHA]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[REF]:[SENHA]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Gere com: openssl rand -base64 32
AUTH_SECRET="sua-chave-secreta"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Criar tabelas no banco
```bash
npm run db:push
```

### 4. Popular banco com dados de demonstração
```bash
npm run db:seed
```

**Usuários de demo:**
| Email | Senha | Role |
|---|---|---|
| admin@caramellabs.com | admin123 | ADMIN |
| gerente@caramellabs.com | gerente123 | MANAGER |
| marcus@caramellabs.com | marcus123 | EXPERT |

### 5. Rodar em desenvolvimento
```bash
npm run dev
```

Acesse: http://localhost:3000

---

## Exportação CSV
Com o sistema aberto, acesse:
```
GET /api/export?date=YYYY-MM-DD
```

---

## Deploy (Vercel)
1. `vercel --prod`
2. Configure as variáveis de ambiente no painel da Vercel
3. Use a connection string com PgBouncer (pooled) para o `DATABASE_URL`
4. Use a connection string direta para o `DIRECT_URL`
