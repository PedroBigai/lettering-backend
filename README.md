# Lettering — Backend

Servidor autoritativo da API e motor de jogo do **Lettering**, desenvolvido com Node.js, Express, TypeScript, MySQL e Zod.

## 🚀 Como Executar

### 1. Pré-requisitos
- Node.js (v20 ou superior recomendado)
- MySQL Server

### 2. Configuração de Variáveis de Ambiente
Copie o `.env.example` para `.env` e configure suas credenciais de banco:
```bash
cp .env.example .env
```

Exemplo de `.env`:
```env
PORT=3000
DATABASE_URL=mysql://root:SENHA@localhost:3306/lettering
JWT_SECRET=sua_chave_secreta_super_segura
JWT_EXPIRES_IN_SECONDS=86400
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:5500
```

### 3. Instalar Dependências e Rodar Migrações
```bash
npm install
npm run migrate
```

### 4. Iniciar o Servidor
```bash
npm run dev
```

### 5. Executar a Suíte de Testes
```bash
npm test
```

---

## 📖 Documentação da API

A documentação técnica detalhada de todos os endpoints, esquemas de dados, regras de negócio e exemplos de integração com o frontend encontra-se em:

👉 **[docs/API.md](docs/API.md)**

### Principais Funcionalidades da API:
- **Autenticação Segura:** Cadastro, login com JWT e rate limiting (`/api/v1/auth`).
- **Partidas Autoritativas:** Tabuleiro 10x9, gravidade por coluna e controle de concorrência por versão (`/api/v1/matches`).
- **Modos de Jogo:** Clássico (`classic`), Aprendizado (`learning` — com tema obrigatório) e Hardcore (`hardcore` — 1 vida).
- **9 Temas Disponíveis:** `animals`, `objects`, `verbs`, `food`, `places`, `adjectives`, `colors`, `nature`, `professions`.
- **Dicionário com +1.050 Palavras:** Validadas com traduções em PT/ES e descrições educativas.
