# Lettering — contexto e estado do projeto

Documento consolidado em **03/09/2026** com as decisões e implementações do
frontend e backend do Lettering.

## 1. Conceito e escopo atual

Lettering é um jogo educacional inspirado em Tetris. O jogador recebe letras,
escolhe onde posicioná-las em uma matriz e forma palavras inglesas. Uma palavra
válida é destacada; ao confirmá-la, o jogador recebe pontos, traduções e uma
descrição.

- matriz de 10 linhas por 9 colunas;
- palavras-base em inglês;
- interface em `pt-BR`, `en-US` e `es-ES`;
- palavras horizontais e verticais;
- quatro opções de letras por turno;
- modo clássico autenticado com backend autoritativo;
- modo convidado local preservado;
- banco preparado para multiplayer, ainda não implementado.

## 2. Regras definidas

### Partida autenticada

1. O usuário faz login e recebe um JWT.
2. O frontend cria ou recupera uma partida ativa.
3. O backend envia quatro opções oficiais de letras.
4. O jogador escolhe uma letra e uma coluna.
5. O frontend envia `pieceId`, `column` e `boardVersion`.
6. O backend calcula a última linha livre, valida e persiste a jogada.
7. A letra escolhida é posicionada e as outras três são descartadas.
8. As próximas quatro opções são geradas durante essa jogada.
9. O backend procura a primeira palavra válida contendo a nova peça.
10. A palavra encontrada fica destacada e pendente.
11. O jogador pressiona `Espaço` para confirmar.
12. O backend registra os pontos, remove as células e aplica gravidade.

No modo autenticado, o backend define letras, posição final, palavra válida,
pontuação, vidas e matriz. O frontend envia comandos e anima o estado oficial.

### Palavras

- tamanho mínimo padrão de 3 letras;
- a palavra deve conter a peça recém-colocada;
- prioridade horizontal e depois vertical;
- leitura da esquerda para a direita ou de cima para baixo;
- a primeira palavra válida encerra a busca;
- somente uma palavra fica pendente por jogada;
- a pontuação vem do `words.json`;
- a remoção ocorre somente após a confirmação com `Espaço`.

Assim, se `CAT` for encontrada antes de `CATER`, `CAT` será contabilizada.

### Matriz, vidas e término

O protocolo usa linhas `0..9` e colunas `0..8`. O cliente envia somente a
coluna; o backend encontra a célula livre mais baixa.

Uma jogada é rejeitada se a coluna estiver cheia ou for inválida, a peça não for
uma das quatro opções ativas, a partida não estiver jogável, houver uma palavra
pendente ou o `boardVersion` estiver desatualizado.

- cada jogador começa com 3 vidas;
- ao alcançar o topo, perde uma vida e a matriz é limpa;
- a terceira perda causa `game_over`;
- é possível pausar, retomar e abandonar;
- tempo pausado não entra no tempo oficial;
- partidas inativas são encerradas pelo backend.

### Modo convidado

Funciona inteiramente no frontend: gera letras, valida palavras e mantém matriz e
pontuação localmente. A palavra também fica marcada até o jogador pressionar
`Espaço`. Não há persistência, ranking ou multiplayer, e resultados locais não
viram resultados oficiais posteriormente.

## 3. Geração de letras

Não há seed atualmente. Cada jogador recebe uma sequência independente.

- quatro letras distintas por turno;
- pelo menos uma vogal;
- sorteio ponderado pelo `letters.json`;
- backend usa `node:crypto`, não `Math.random()`;
- sequência efetivamente gerada fica em `match_letters`;
- escolhida vira `placed`, demais viram `discarded`;
- próximas quatro opções são preparadas na jogada atual.

Uma seed poderá ser adicionada futuramente para desafio diário, replay ou modo
competitivo com sequência compartilhada.

## 4. Conteúdo JSON

O dicionário e os pesos não ficam no MySQL.

```text
backend/data/english/letters.json
backend/data/english/words.json
frontend/script/data/letters.json
frontend/script/data/words.json
```

Os arquivos equivalentes estão alinhados. Há 98 entradas em 9 temas, equivalentes
a 89 palavras únicas. Significados repetidos em temas diferentes são combinados
em memória.

```json
{
  "word": "CAT",
  "translations": {
    "pt-BR": ["gato", "gata"],
    "es-ES": ["gato"]
  },
  "description": {
    "pt-BR": "Um pequeno mamífero doméstico.",
    "en-US": "A small domesticated mammal.",
    "es-ES": "Un pequeño mamífero doméstico."
  },
  "score": 30
}
```

`translations` não possui `en-US`, porque `word` já é a forma inglesa. A
descrição continua nos três idiomas. Em inglês, o frontend exibe `word`.
Os JSONs são validados com Zod na inicialização do backend.

## 5. Banco MySQL

As migrations `001` a `007` implementam:

```text
001  users, games e game_words iniciais
002  evolução para matches e match_players
003  tabuleiro autoritativo e match_letters
004  matriz alinhada para 10x9
005  vidas do jogador
006  tempo, pausa e inatividade
007  palavra pendente aguardando confirmação
```

Modelo atual:

```text
users
  └── match_players
        ├── matches
        ├── match_letters
        ├── game_words
        └── match_pending_words

schema_migrations (tabela técnica)
```

- `users`: conta, e-mail normalizado e hash bcrypt da senha.
- `matches`: partida geral, modo, idioma, regras, dimensões e status.
- `match_players`: estado individual, placar, vidas, versão, tempo e pausa.
- `match_letters`: fila, opções, peças posicionadas, removidas e descartadas.
- `game_words`: histórico de palavras confirmadas, pontos e células usadas.
- `match_pending_words`: uma palavra marcada aguardando confirmação.

A separação `matches`/`match_players` permite adicionar participantes no futuro.
`boardVersion` controla concorrência. As coordenadas de peças `placed` em
`match_letters` representam a matriz oficial.

## 6. Arquitetura adotada

Padrão solicitado:

```text
route → controller → module → repository
```

```text
src/
├── controllers/       # action + contexto: getMatches, postMatch etc.
├── interfaces/        # contratos por contexto
├── modules/
│   ├── game/          # matriz, detector, conteúdo e letras
│   └── repositories/  # acesso ao MySQL
├── routes/routes.ts   # todas as rotas em um arquivo central
├── schemas/           # validação Zod
├── server/            # Express, erros e middlewares
└── utils/             # ambiente e conexão MySQL
```

Controllers cuidam do HTTP, modules processam a regra e repositories acessam o
banco. Os `.gitkeep` desnecessários foram removidos.

## 7. Rotas implementadas

Base padrão: `http://localhost:3000/api/v1`.

```text
GET   /health
POST  /api/v1/auth/register
POST  /api/v1/auth/login
GET   /api/v1/auth/me

POST  /api/v1/matches
GET   /api/v1/matches
GET   /api/v1/matches/:matchId
GET   /api/v1/matches/:matchId/state
POST  /api/v1/matches/:matchId/pieces/place
POST  /api/v1/matches/:matchId/words/confirm
POST  /api/v1/matches/:matchId/pause
POST  /api/v1/matches/:matchId/resume
POST  /api/v1/matches/:matchId/leave
```

Exceto registro, login e health check, as rotas exigem:

```http
Authorization: Bearer <token>
```

Jogada:

```json
{
  "pieceId": "uuid-da-peca",
  "column": 3,
  "boardVersion": 5
}
```

Confirmação de palavra:

```json
{
  "boardVersion": 6
}
```

O snapshot devolve configuração, matriz, versão, estado do jogador, pontuação,
vidas, tempo, quatro opções ativas, palavras confirmadas e palavra pendente. Isso
permite reconstruir a tela após recarregar ou reconectar.

## 8. Integração com o frontend

Já foi integrado:

- login real e validação por `/auth/me`;
- JWT no `localStorage`;
- convidado preservado;
- criação e recuperação de partida;
- snapshot oficial;
- posicionamento de peças;
- confirmação com `Espaço`;
- pausa, retomada e abandono;
- sincronização de matriz, pontuação, vidas e palavras;
- recuperação de snapshot após divergência;
- mesmos JSONs no convidado e no backend.

A rota de cadastro existe, mas a tela de cadastro ainda não foi criada no front.

## 9. Segurança e robustez

- bcrypt e JWT com expiração;
- autorização por usuário em cada partida;
- queries parametrizadas e jogadas transacionais;
- Zod para payloads e conteúdo;
- CORS por lista de origens;
- rate limit em login e criação de partidas;
- `boardVersion` contra ações antigas/concorrentes;
- respostas de erro padronizadas;
- limite de 100 KB por JSON;
- `X-Request-Id`, logs e cabeçalhos básicos de segurança;
- expiração periódica de partidas inativas;
- encerramento coordenado do HTTP e pool MySQL.

## 10. Ambiente e comandos

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://root:SUA_SENHA@127.0.0.1:3306/lettering
JWT_SECRET=chave-aleatoria-com-pelo-menos-32-caracteres
JWT_EXPIRES_IN_SECONDS=3600
MATCH_INACTIVITY_TIMEOUT_SECONDS=1800
MATCH_CLEANUP_INTERVAL_SECONDS=60
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

Sem senha local: `mysql://root@127.0.0.1:3306/lettering`. Caracteres especiais
na senha devem ser codificados para URL.

```bash
npm install
npm run migrate
npm run dev
npm run build
npm test
```

## 11. Estado verificado

Na validação de 03/09/2026:

- build TypeScript aprovado;
- 24 testes automatizados aprovados;
- JavaScript do frontend sintaticamente válido;
- JSON de palavras idêntico nos dois projetos;
- zero traduções redundantes `en-US`;
- todas as entradas com traduções `pt-BR` e `es-ES`.

Os testes cobrem autenticação, erros, CORS, matriz, gravidade, conteúdo, geração de
letras, isolamento de partidas e detecção horizontal/vertical.

## 12. Próximos passos

Prioridade:

1. testar manualmente front + backend + MySQL de ponta a ponta;
2. validar palavra pendente, confirmação, pausa, retomada e game over;
3. ampliar testes de integração de palavras, vidas e histórico;
4. criar a tela de cadastro quando entrar no escopo.

Depois:

1. adicionar Socket.IO reutilizando `MatchModule`, sem duplicar regras;
2. autenticar handshake com JWT e criar salas por partida;
3. emitir snapshot e atualizações somente após commit no MySQL;
4. implementar segundo jogador, desconexão e reconexão;
5. criar ranking e níveis quando existirem no frontend;
6. ampliar e revisar o dicionário.

Eventos inicialmente planejados:

```text
cliente → servidor: match:join, piece:place, word:confirm,
                    match:pause, match:resume, match:leave

servidor → cliente: match:snapshot, board:updated, letters:updated,
                    word:found, word:confirmed, score:updated,
                    player:game-over, match:finished
```

O socket não transmite frames da animação. O frontend anima; o backend valida e
persiste. O MySQL permanece como fonte oficial para permitir reconexão.

## 13. Decisões futuras

- multiplayer efetivo e matchmaking;
- seed, desafio diário e replay;
- ranking, níveis, combos e bônus;
- múltiplas palavras por jogada;
- modo espectador;
- Redis para múltiplas instâncias do Socket.IO;
- idiomas-base além do inglês.
