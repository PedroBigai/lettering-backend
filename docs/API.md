# Documentação da API — Lettering Backend

Esta documentação detalha todos os endpoints, contratos de dados, regras de negócio e fluxos de integração do backend do jogo **Lettering**. Desenvolvedores front-end e integradores devem seguir estas especificações para garantir compatibilidade total.

---

## 1. Visão Geral

- **URL Base:** `http://localhost:3000/api/v1` (ou valor da variável `PORT` configurada no ambiente).
- **Healthcheck:** `GET http://localhost:3000/health` (sem prefixo `/api/v1`).
- **Formato dos Dados:** `application/json` (todas as requisições com corpo devem enviar o cabeçalho `Content-Type: application/json`).
- **Autenticação:** Bearer Token JWT no cabeçalho `Authorization: Bearer <token>` nas rotas protegidas.
- **CORS:** O backend valida a origem da requisição via `CORS_ALLOWED_ORIGINS` no `.env`. Certifique-se de que a URL do frontend esteja listada (ex: `http://localhost:8080`, `http://127.0.0.1:5500`).

---

## 2. Formato Padrão de Erros

Todas as respostas de erro seguem o mesmo formato estruturado em JSON:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "formErrors": [],
      "fieldErrors": {
        "theme": ["Theme is required for learning mode"]
      }
    }
  }
}
```

### Códigos de Erro Comuns

| Código | Status HTTP | Descrição |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | 400 | Corpo da requisição ou parâmetros inválidos (esquema Zod). |
| `INVALID_JSON` | 400 | O corpo da requisição contém um JSON malformado. |
| `AUTHENTICATION_REQUIRED` | 401 | Cabeçalho `Authorization` ausente ou formato inválido. |
| `INVALID_TOKEN` | 401 | Token JWT expirado, adulterado ou com assinatura inválida. |
| `INVALID_CREDENTIALS` | 401 | Email ou senha incorretos no login. |
| `CORS_ORIGIN_DENIED` | 403 | A origem da requisição (header `Origin`) não está na lista de permissões. |
| `MATCH_FORBIDDEN` | 403 | O jogador tentou acessar ou modificar uma partida pertencente a outro usuário. |
| `ROUTE_NOT_FOUND` | 404 | Rota não encontrada. |
| `MATCH_NOT_FOUND` | 404 | Partida com o `matchId` especificado não existe. |
| `USER_ALREADY_EXISTS` | 409 | Já existe um usuário cadastrado com o email informado. |
| `BOARD_VERSION_CONFLICT` | 409 | A versão do tabuleiro (`boardVersion`) enviada está defasada. |
| `TOO_MANY_REQUESTS` | 429 | Limite de requisições por IP ou usuário excedido (Rate Limit). |
| `INTERNAL_SERVER_ERROR` | 500 | Erro inesperado do servidor. |

---

## 3. Healthcheck

### `GET /health`
Verifica se o serviço está no ar e respondendo.

* **Autenticação:** Pública.
* **Resposta (200 OK):**
```json
{
  "status": "ok"
}
```

---

## 4. Módulo de Autenticação (`/auth`)

### 4.1. Cadastro de Usuário
`POST /api/v1/auth/register`

Cria uma nova conta de jogador e já retorna o token de autenticação JWT inicial.

* **Autenticação:** Pública.
* **Corpo da Requisição:**
```json
{
  "username": "pedro_player",
  "email": "pedro@exemplo.com",
  "password": "SenhaSegura123!"
}
```
* **Regras de Validação:**
  * `username`: Entre 3 e 30 caracteres. Apenas letras, números e sublinhados (`^[a-zA-Z0-9_]+$`).
  * `email`: Formato de email válido (normalizado para minúsculas).
  * `password`: Mínimo de 8 caracteres (máximo 72 bytes).
* **Resposta (201 Created):**
```json
{
  "user": {
    "id": "c7a6f958-39b0-4f51-a96c-b3a562ce8df9",
    "username": "pedro_player",
    "email": "pedro@exemplo.com",
    "createdAt": "2026-09-03T20:30:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 4.2. Login
`POST /api/v1/auth/login`

Autentica com email e senha. Possui proteção de rate-limiting (máx. 10 tentativas por IP/email a cada 15 minutos).

* **Autenticação:** Pública.
* **Corpo da Requisição:**
```json
{
  "email": "pedro@exemplo.com",
  "password": "SenhaSegura123!"
}
```
* **Resposta (200 OK):**
```json
{
  "user": {
    "id": "c7a6f958-39b0-4f51-a96c-b3a562ce8df9",
    "username": "pedro_player",
    "email": "pedro@exemplo.com",
    "createdAt": "2026-09-03T20:30:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 4.3. Obter Perfil Atual
`GET /api/v1/auth/me`

Retorna os dados do usuário autenticado pelo token JWT.

* **Autenticação:** Obrigatória (`Bearer <token>`).
* **Resposta (200 OK):**
```json
{
  "user": {
    "id": "c7a6f958-39b0-4f51-a96c-b3a562ce8df9",
    "username": "pedro_player",
    "email": "pedro@exemplo.com",
    "createdAt": "2026-09-03T20:30:00.000Z"
  }
}
```

---

## 5. Módulo de Partidas (`/matches`)

Todas as rotas de partidas requerem autenticação (`Authorization: Bearer <token>`).

### 5.1. Criar Partida
`POST /api/v1/matches`

Inicializa um novo jogo com tabuleiro limpo de 10 linhas x 9 colunas, configura as vidas e distribui o primeiro lote de 4 letras ativas (garantindo pelo menos uma vogal).

* **Corpo da Requisição:**
```json
{
  "mode": "learning",
  "theme": "animals",
  "language": "en-US"
}
```

#### Parâmetros:
| Campo | Tipo | Obrigatório | Padrão | Valores Aceitos / Regras |
| :--- | :---: | :---: | :---: | :--- |
| `mode` | string | Não | `"classic"` | `"classic"`, `"learning"`, `"hardcore"` |
| `theme` | string \| null | Condicional | `null` | Obrigatório se `mode === "learning"`. Aceito em qualquer modo. Valores: `"animals"`, `"objects"`, `"verbs"`, `"food"`, `"places"`, `"adjectives"`, `"colors"`, `"nature"`, `"professions"`. |
| `language` | string | Não | `"en-US"` | `"en-US"` |

#### Comportamento dos Modos:
- **`classic`**: 3 vidas iniciais. Vocabulário geral (ou tema se especificado).
- **`learning`**: 3 vidas iniciais. **Exige** obrigatoriamente um `theme`. O jogo filtra e só aceita e valida palavras pertencentes àquele tema específico.
- **`hardcore`**: **1 vida inicial** (perdeu uma peça no topo = Game Over). Tema opcional.

* **Resposta (201 Created):** Retorna a estrutura completa de [`MatchSnapshot`](#estrutura-matchsnapshot).

---

### 5.2. Obter Estado Atual da Partida
`GET /api/v1/matches/:matchId/state`  
*(ou `GET /api/v1/matches/:matchId`)*

Retorna o snapshot completo da partida, incluindo tabuleiro, células ocupadas, versão do tabuleiro, opções de letras, vidas e palavras já formadas.

* **Parâmetros de Rota:** `matchId` (UUID).
* **Resposta (200 OK):** Retorna [`MatchSnapshot`](#estrutura-matchsnapshot).

---

### 5.3. Jogar uma Peça no Tabuleiro
`POST /api/v1/matches/:matchId/pieces/place`

Posiciona uma das letras disponíveis em uma das colunas do tabuleiro. O motor do servidor calcula a gravidade (a peça desce até a posição mais baixa livre da coluna), verifica colisão no topo e checa imediatamente se uma palavra válida foi formada.

* **Corpo da Requisição:**
```json
{
  "pieceId": "a9e6d0a1-8d2b-4e63-bfb7-8d9e29fcfd21",
  "column": 4,
  "boardVersion": 0
}
```

#### Parâmetros:
- `pieceId` (UUID): ID da peça a ser colocada (deve ser uma das 4 peças presentes em `letterOptions`).
- `column` (int): Índice da coluna de destino, entre `0` e `8` (grade de 9 colunas).
- `boardVersion` (int): Versão atual do tabuleiro que o cliente possui. Evita descompasso de rede.

* **Resposta (200 OK):**
```json
{
  "accepted": true,
  "boardVersion": 1,
  "placedPiece": {
    "row": 9,
    "column": 4,
    "letter": "C",
    "pieceId": "a9e6d0a1-8d2b-4e63-bfb7-8d9e29fcfd21"
  },
  "foundWord": {
    "word": "CAT",
    "direction": "horizontal",
    "pointsEarned": 30,
    "translations": {
      "pt-BR": ["gato"],
      "es-ES": ["gato"]
    },
    "description": {
      "pt-BR": ["Um felino doméstico de pequeno porte."],
      "en-US": ["A small domesticated carnivorous feline mammal."],
      "es-ES": ["Un pequeño mamífero felino carnívoro doméstico."]
    },
    "cells": [
      { "row": 9, "column": 2, "letter": "C" },
      { "row": 9, "column": 3, "letter": "A" },
      { "row": 9, "column": 4, "letter": "T" }
    ]
  },
  "removedCells": [],
  "movedCells": [],
  "currentScore": 0,
  "lifeLost": false,
  "livesRemaining": 3,
  "gameOver": false,
  "match": { ... }
}
```

> **Nota de Fluxo:** Se uma palavra for encontrada, ela entra como `pendingWord`. As células permanecem destacadas no tabuleiro até que o cliente chame `/words/confirm`.

---

### 5.4. Confirmar Palavra Formada
`POST /api/v1/matches/:matchId/words/confirm`

Confirma a palavra pendente detectada. O servidor credita a pontuação, remove as células da palavra do tabuleiro, recalcula a gravidade das letras superiores e incrementa o `boardVersion`.

* **Corpo da Requisição:**
```json
{
  "boardVersion": 1
}
```
* **Resposta (200 OK):**
```json
{
  "boardVersion": 2,
  "confirmedWord": {
    "word": "CAT",
    "direction": "horizontal",
    "pointsEarned": 30,
    "cells": [
      { "row": 9, "column": 2, "letter": "C" },
      { "row": 9, "column": 3, "letter": "A" },
      { "row": 9, "column": 4, "letter": "T" }
    ]
  },
  "removedCells": [
    { "row": 9, "column": 2, "letter": "C" },
    { "row": 9, "column": 3, "letter": "A" },
    { "row": 9, "column": 4, "letter": "T" }
  ],
  "movedCells": [],
  "currentScore": 30,
  "match": { ... }
}
```

---

### 5.5. Pausar e Retomar Partida
* **Pausar:** `POST /api/v1/matches/:matchId/pause`
* **Retomar:** `POST /api/v1/matches/:matchId/resume`

Congela ou retoma o cronômetro oficial da partida no backend.

* **Corpo da Requisição:** `{}`
* **Resposta (200 OK):** Retorna o [`MatchSnapshot`](#estrutura-matchsnapshot) atualizado com `player.pausedAt` e `player.gameTimeMs` calculados.

---

### 5.6. Abandonar / Sair da Partida
`POST /api/v1/matches/:matchId/leave`

Encerra a partida corrente do jogador.

* **Corpo da Requisição:** `{}`
* **Resposta (200 OK):**
```json
{
  "status": "abandoned"
}
```

---

### 5.7. Histórico de Partidas
`GET /api/v1/matches?limit=20&offset=0`

Retorna a lista paginada de partidas disputadas pelo usuário autenticado.

* **Query Params:**
  * `limit` (int opcional, padrão: 20, máx: 50)
  * `offset` (int opcional, padrão: 0)
* **Resposta (200 OK):**
```json
{
  "items": [
    {
      "id": "76fa9be1-081e-450f-90e8-0aa345b59714",
      "mode": "learning",
      "theme": "animals",
      "language": "en-US",
      "matchStatus": "active",
      "playerStatus": "playing",
      "score": 120,
      "livesRemaining": 3,
      "gameTimeMs": 45200,
      "wordsFound": 3,
      "startedAt": "2026-09-03T20:15:00.000Z",
      "finishedAt": null
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

## 6. Estrutura `MatchSnapshot`

O objeto `MatchSnapshot` é o modelo autoritativo central retornado na criação da partida e nas atualizações de estado:

```json
{
  "match": {
    "id": "76fa9be1-081e-450f-90e8-0aa345b59714",
    "language": "en-US",
    "mode": "learning",
    "theme": "animals",
    "status": "active",
    "startedAt": "2026-09-03T20:15:00.000Z",
    "board": {
      "rows": 10,
      "columns": 9,
      "version": 0,
      "cells": [
        {
          "row": 9,
          "column": 4,
          "letter": "E",
          "pieceId": "b1b2c3d4-..."
        }
      ]
    },
    "rules": {
      "minWordLength": 3,
      "letterOptionsPerTurn": 4
    },
    "player": {
      "id": "p12345...",
      "status": "playing",
      "score": 0,
      "levelReached": 1,
      "livesRemaining": 3,
      "boardVersion": 0,
      "gameTimeMs": 0,
      "pausedAt": null
    },
    "letterOptions": [
      { "pieceId": "piece-uuid-1", "letter": "A", "sequenceNumber": 1 },
      { "pieceId": "piece-uuid-2", "letter": "R", "sequenceNumber": 2 },
      { "pieceId": "piece-uuid-3", "letter": "T", "sequenceNumber": 3 },
      { "pieceId": "piece-uuid-4", "letter": "O", "sequenceNumber": 4 }
    ],
    "queuedPieces": [],
    "foundWords": [],
    "pendingWord": null
  }
}
```

---

## 7. Temas Disponíveis (9 Temas)

O banco de dados possui **1.050 palavras únicas** distribuídas nos seguintes 9 temas:

| Identificador (`theme`) | Descrição | Exemplo de Palavras |
| :--- | :--- | :--- |
| `animals` | Animais e fauna | `LION`, `EAGLE`, `DOLPHIN`, `TIGER`, `ZEBRA`, `PENGUIN` |
| `objects` | Objetos, ferramentas e utensílios | `ANCHOR`, `SWORD`, `HAMMER`, `COMPASS`, `LANTERN`, `MIRROR` |
| `verbs` | Ações e verbos de movimento | `BOUNCE`, `CHASE`, `DANCE`, `FORGIVE`, `PRAY`, `WHISPER` |
| `food` | Comidas, frutas, vegetais e pratos | `APPLE`, `BREAD`, `BURRITO`, `CHERRY`, `LASAGNA`, `SUSHI` |
| `places` | Lugares, cidades e construções | `AIRPORT`, `CASTLE`, `HARBOR`, `MUSEUM`, `PALACE`, `TEMPLE` |
| `adjectives` | Qualidades e características | `ALERT`, `BRAVE`, `CLEVER`, `CURIOUS`, `HONEST`, `WISE` |
| `colors` | Cores e tonalidades | `BLACK`, `BLUE`, `BRONZE`, `CRIMSON`, `EMERALD`, `GOLD`, `RED` |
| `nature` | Natureza, relevos e ecossistemas | `CANYON`, `FOREST`, `GLACIER`, `JUNGLE`, `OCEAN`, `RIVER` |
| `professions` | Carreiras e ofícios | `ACTOR`, `ASTRONAUT`, `DOCTOR`, `PILOT`, `SCIENTIST`, `WRITER` |

---

## 8. Guia Prático de Integração (Frontend)

Exemplo completo de integração em JavaScript utilizando a API nativa `fetch`:

```javascript
const API_BASE = 'http://localhost:3000/api/v1';
let userToken = localStorage.getItem('lettering_token');

// 1. Autenticação (Login)
async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message);
  userToken = data.token;
  localStorage.setItem('lettering_token', userToken);
  return data.user;
}

// 2. Iniciar Partida (Modo Aprendizado com Tema)
async function createMatch(mode = 'learning', theme = 'animals') {
  const response = await fetch(`${API_BASE}/matches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ mode, theme, language: 'en-US' }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message);
  return data.match; // Snapshot completo
}

// 3. Jogar uma Peça no Tabuleiro
async function placePiece(matchId, pieceId, column, boardVersion) {
  const response = await fetch(`${API_BASE}/matches/${matchId}/pieces/place`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ pieceId, column, boardVersion }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message);
  return data;
}

// 4. Confirmar Palavra Formada
async function confirmWord(matchId, boardVersion) {
  const response = await fetch(`${API_BASE}/matches/${matchId}/words/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ boardVersion }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message);
  return data;
}
```
