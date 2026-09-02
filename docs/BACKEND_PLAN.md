# Lettering — Plano do Backend

Documento de alinhamento para a primeira versão do backend do Lettering.

Estado confirmado em 27/08/2026: as migrations `001`, `002` e `003` estão aplicadas no MySQL.

## Estado da implementação

Concluído:

- servidor Express com `GET /health`;
- respostas padronizadas para rotas inexistentes e erros internos;
- cabeçalhos HTTP básicos de segurança;
- inicialização condicionada à conexão com MySQL e ao conteúdo válido;
- encerramento coordenado do servidor HTTP e do pool MySQL;
- `data/english/letters.json` com as 26 letras e pesos;
- `data/english/words.json` inicial com cinco palavras de teste;
- schemas Zod para os dois arquivos;
- carregamento e cache do conteúdo em memória;
- normalização e consulta de palavras;
- sorteio ponderado com `node:crypto`;
- lotes de 10 letras com pelo menos três vogais e sem três letras iguais consecutivas;
- testes automatizados do conteúdo, gerador e servidor.
- registro com normalização de e-mail e hash bcrypt;
- login com resposta uniforme para credenciais inválidas;
- emissão e validação de JWT com expiração, issuer e audience;
- middleware de autenticação Bearer;
- rotas `POST /api/v1/auth/register`, `POST /api/v1/auth/login` e `GET /api/v1/auth/me`;
- tratamento de cadastros duplicados, inclusive em condição de concorrência;
- testes isolados de autenticação sem alteração dos usuários reais do MySQL.
- CORS restrito às origens configuradas em `CORS_ORIGINS`;
- login do frontend integrado às rotas reais `/api/v1/auth/login` e `/api/v1/auth/me`;
- mensagens distintas para credenciais inválidas, payload inválido e indisponibilidade da API;
- fluxo de convidado preservado e independente da autenticação server-side.
- rota autenticada `POST /api/v1/matches` para criação de partida clássica solo;
- criação transacional de `matches`, `match_players` e quatro opções de letras;
- quatro opções distintas por turno, com pelo menos uma vogal;
- rota autenticada `GET /api/v1/matches/:matchId/state` para snapshot oficial;
- isolamento do snapshot por usuário e matriz oficial alinhada ao frontend em 10x9.
- engine pura para queda, coluna cheia, gravidade e tabuleiro cheio;
- detecção server-side da primeira palavra horizontal ou vertical que contenha a nova peça;
- rota `POST /api/v1/matches/:matchId/pieces/place` para testar jogadas por HTTP;
- jogada transacional com bloqueio do jogador, `board_version`, pontuação, remoção,
  gravidade, descarte das opções não escolhidas e geração das quatro opções seguintes.
- três vidas persistidas por jogador; ao alcançar a linha zero, perde uma vida e
  limpa a matriz; a terceira perda encerra a partida;
- abandono autenticado em `POST /api/v1/matches/:matchId/leave`.
- histórico paginado e detalhe autenticado de partidas;
- tempo oficial calculado no backend e congelado durante pausas;
- pause/resume server-side e bloqueio de jogadas enquanto pausado;
- expiração periódica de partidas inativas;
- limite de uma partida ativa por usuário, rate limits, request ID e logs HTTP estruturados.

Próxima etapa: Socket.IO e reconexão usando o snapshot oficial, seguidos da integração com o frontend.

Organização adotada para a API:

```text
src/
├── routes/
│   └── routes.ts    # registro central de todas as rotas da API
├── controllers/     # um arquivo por action HTTP (ex.: getMatches.ts)
├── interfaces/      # contratos TypeScript separados por contexto
├── schemas/         # validação dos payloads com Zod
├── modules/         # serviços, regras do jogo e acesso ao MySQL
│   ├── game/        # regras puras e conteúdo do jogo
│   └── repositories/# acesso ao MySQL
├── utils/           # ambiente e conexão compartilhada
└── server/          # configuração do Express, erros e middlewares HTTP
    └── middlewares/
```

Fluxo de código adotado:

```text
route → controller (action + contexto) → module → repository
```

Exemplos: `getMatches`, `postMatch`, `postMatchPiece`, `postPauseMatch` e
`postAuth`. O arquivo e a função usam o mesmo nome no padrão ação HTTP + contexto.
Cada controller exporta diretamente um handler `(request, response)`;
controllers validam entrada e resposta HTTP, enquanto modules processam a regra
da aplicação.

## 1. Conceito do jogo

Lettering é um jogo inspirado em Tetris. Letras caem em uma matriz e o jogador escolhe a coluna onde cada letra será posicionada. Ao surgir uma palavra inglesa válida, ela é contabilizada, removida e gera pontos.

O MVP utilizará:

- matriz de 10 linhas por 9 colunas, acompanhando o tabuleiro atual do frontend;
- palavras somente em inglês;
- traduções e descrições em português;
- detecção horizontal e vertical;
- primeira palavra válida encontrada após a jogada;
- partidas solo e estrutura preparada para multiplayer;
- MySQL para estado e histórico;
- arquivos JSON para letras, palavras e conteúdo educacional.

## 2. Divisão de responsabilidades

### Frontend autenticado

- renderizar a matriz e as letras;
- animar a queda em tempo real;
- capturar a coluna escolhida pelo jogador;
- enviar comandos ao backend;
- aplicar as atualizações oficiais recebidas;
- animar palavras, remoções, gravidade e pontuação;
- reconstruir a tela a partir de um snapshot em caso de reconexão.

O frontend não define a letra, a linha final, a validade da palavra nem a pontuação oficial.

### Backend autenticado

- autenticar o usuário;
- criar e finalizar partidas;
- gerar letras aleatórias por jogador;
- armazenar as quatro opções oficiais de letras de cada turno;
- calcular a linha final da peça;
- manter a matriz oficial;
- detectar e validar palavras;
- calcular e registrar pontos;
- remover letras e aplicar gravidade;
- sincronizar placares e partidas multiplayer;
- fornecer snapshots para reconexão;
- manter histórico e ranking.

### Modo convidado

No modo convidado, toda a partida funciona no frontend:

- letras geradas no cliente;
- validação pelo JSON local;
- pontuação local;
- sem histórico oficial;
- sem ranking;
- sem multiplayer;
- sem envio posterior da pontuação local ao backend.

## 3. Transporte

### HTTP

Será utilizado para registro, login, criação e entrada em partidas, snapshots, histórico e ranking.

### WebSocket

Será utilizado durante a partida para entrada na sala, entrega de letras, posicionamento de peças, atualização da matriz, palavras, placares e game over.

Socket.IO é a opção recomendada para a primeira versão por oferecer salas, autenticação, acknowledgements e reconexão automática.

O WebSocket não recebe cada frame da animação. A queda visual acontece somente no frontend.

## 4. Fluxo de uma partida autenticada

1. O usuário realiza login por HTTP e recebe um JWT.
2. O frontend cria uma partida por HTTP.
3. O backend cria `matches` e o primeiro `match_players`.
4. O frontend conecta ao WebSocket usando o JWT.
5. O frontend entra na sala da partida.
6. O backend envia um snapshot e as quatro opções iniciais de letras.
7. O jogador escolhe uma das quatro letras e o frontend a anima.
8. O jogador escolhe uma coluna.
9. O frontend envia `pieceId`, `column` e `boardVersion`.
10. O backend valida o comando e calcula a linha final.
11. O backend atualiza a matriz e procura uma palavra.
12. Se encontrar, registra a palavra, soma pontos, remove as letras e aplica gravidade.
13. O backend incrementa `board_version` e confirma a transação.
14. O frontend recebe e anima o resultado oficial.
15. Depois da jogada, o backend descarta as três opções não escolhidas e gera outras quatro.
16. Ao ocorrer game over, o backend finaliza o participante e, quando aplicável, a partida.

## 5. Regra da matriz

A matriz possui:

```text
linhas:  0 até 9
colunas: 0 até 8
```

O frontend pode exibir colunas de `A` até `I`, mas o protocolo utiliza números.

Ao posicionar uma peça, o frontend envia somente a coluna. O backend percorre a coluna de baixo para cima e escolhe a primeira célula livre.

O backend rejeita a jogada quando:

- a coluna está fora do intervalo;
- a coluna está cheia;
- a peça não pertence ao jogador;
- a peça não pertence às quatro opções ativas do turno;
- a peça já foi utilizada;
- a partida não está ativa;
- o jogador não pertence à partida;
- `boardVersion` está desatualizada.

## 6. Regra de detecção de palavras

Regras do MVP:

- palavras horizontais e verticais;
- tamanho mínimo padrão de três letras;
- a palavra precisa conter a peça recém-posicionada;
- prioridade horizontal; se nenhuma palavra for encontrada, busca vertical;
- busca da esquerda para a direita na horizontal e de cima para baixo na vertical;
- busca a partir do tamanho mínimo;
- a primeira palavra válida encerra a busca;
- somente uma palavra é contabilizada por posicionamento na primeira versão.

Exemplo:

```text
C | A | T | E | R
```

Se `CAT` for a primeira palavra válida encontrada, ela é contabilizada antes de `CATER`.

Depois de encontrar uma palavra, o backend:

1. registra a palavra em `game_words`;
2. atualiza `match_players.score`;
3. marca as letras como `cleared`;
4. remove suas posições atuais;
5. aplica gravidade nas colunas afetadas;
6. incrementa `board_version`;
7. retorna as células removidas e movimentadas.

O frontend não confirma a remoção. Ele apenas anima a alteração oficial enviada pelo backend.

## 7. Geração das letras

Não haverá seed no modo atual.

Cada jogador recebe uma sequência aleatória e independente. A sequência efetivamente gerada é persistida em `match_letters`, portanto pode ser recuperada sem reproduzir o sorteio.

Regras iniciais:

- quatro opções oficiais por turno, acompanhando a experiência atual do frontend;
- as quatro opções são distintas;
- pelo menos uma opção é vogal;
- o jogador escolhe uma opção e uma coluna;
- a opção escolhida é posicionada e as outras três são marcadas como `discarded`;
- após cada jogada aceita, são geradas outras quatro opções;
- sorteio ponderado com os pesos do JSON;
- aleatoriedade gerada no backend com `node:crypto`, não `Math.random()`;
- cada jogador multiplayer possui sua própria fila.

A seed poderá ser adicionada futuramente em modos com sequência compartilhada, desafio diário ou replay determinístico.

## 8. Arquivos JSON

Estrutura prevista:

```text
data/
└── english/
    ├── letters.json
    └── words.json
```

### `letters.json`

Usado para o sorteio ponderado:

```json
{
  "letters": [
    { "value": "A", "weight": 8 },
    { "value": "E", "weight": 12 },
    { "value": "Q", "weight": 1 },
    { "value": "Z", "weight": 1 }
  ]
}
```

### `words.json`

Usado para validação, aprendizado e pontuação:

```json
{
  "words": {
    "fall": {
      "translations": ["cair", "queda"],
      "description": "Mover-se para baixo, geralmente por causa da gravidade.",
      "score": 40
    },
    "apple": {
      "translations": ["maçã"],
      "description": "Uma fruta arredondada que cresce na macieira.",
      "score": 50
    }
  }
}
```

As chaves das palavras ficam normalizadas em minúsculas. Ao iniciar o servidor, ambos os arquivos devem ser validados com Zod e carregados em memória.

## 9. Modelo do banco

Tabelas de negócio:

```text
users
matches
match_players
match_letters
game_words
```

Tabela técnica:

```text
schema_migrations
```

Relacionamentos:

```text
users
  └── match_players
          ├── matches
          ├── match_letters
          └── game_words
```

### `users`

```text
id              CHAR(36) PK
username        VARCHAR(30) UNIQUE NOT NULL
email           VARCHAR(255) UNIQUE NOT NULL
password_hash   TEXT NOT NULL
created_at      DATETIME(3) NOT NULL
updated_at      DATETIME(3) NOT NULL
```

### `matches`

```text
id                  CHAR(36) PK
language            VARCHAR(10) NOT NULL
mode                VARCHAR(30) NOT NULL
status              VARCHAR(20) NOT NULL
board_rows          TINYINT UNSIGNED NOT NULL DEFAULT 10
board_columns       TINYINT UNSIGNED NOT NULL DEFAULT 9
min_word_length     TINYINT UNSIGNED NOT NULL DEFAULT 3
max_players         TINYINT UNSIGNED NOT NULL DEFAULT 1
rules_version       VARCHAR(20) NOT NULL DEFAULT '1'
started_at          DATETIME(3) NULL
finished_at         DATETIME(3) NULL
created_at          DATETIME(3) NOT NULL
```

Status: `waiting`, `in_progress`, `finished` ou `cancelled`.

Modos iniciais: `solo` e `versus`. O MVP utiliza `language = en-US`.

### `match_players`

```text
id                  CHAR(36) PK
match_id            CHAR(36) FK
user_id             CHAR(36) FK
status              VARCHAR(20) NOT NULL
score               INTEGER NOT NULL DEFAULT 0
level_reached       INTEGER NOT NULL DEFAULT 1
board_version       INTEGER NOT NULL DEFAULT 0
lives_remaining     TINYINT UNSIGNED NOT NULL DEFAULT 3
game_time_ms        INTEGER NOT NULL DEFAULT 0
paused_at           DATETIME(3) NULL
total_paused_ms     BIGINT UNSIGNED NOT NULL DEFAULT 0
last_activity_at    DATETIME(3) NOT NULL
joined_at           DATETIME(3) NOT NULL
finished_at         DATETIME(3) NULL
```

Status: `waiting`, `playing`, `paused`, `game_over` ou `left`.

Existe uma restrição única para `(match_id, user_id)`.

### `match_letters`

Armazena a fila e o estado atual da matriz:

```text
id                  CHAR(36) PK
match_player_id     CHAR(36) FK
sequence_number     INTEGER NOT NULL
letter              VARCHAR(5) NOT NULL
status              VARCHAR(20) NOT NULL
row_position        TINYINT UNSIGNED NULL
column_position     TINYINT UNSIGNED NULL
generated_at        DATETIME(3) NOT NULL
activated_at        DATETIME(3) NULL
placed_at           DATETIME(3) NULL
cleared_at          DATETIME(3) NULL
```

Status: `queued`, `active`, `placed`, `cleared` ou `discarded`. No modo clássico,
as quatro opções disponíveis no turno possuem status `active`.

Restrições principais:

```text
UNIQUE (match_player_id, sequence_number)
UNIQUE (match_player_id, row_position, column_position)
row_position entre 0 e 9
column_position entre 0 e 8
```

Somente letras com status `placed` possuem linha e coluna.

### `game_words`

```text
id                  CHAR(36) PK
match_player_id     CHAR(36) FK
formed_word         VARCHAR(80) NOT NULL
points_earned       INTEGER NOT NULL
board_version       INTEGER NOT NULL
game_time_ms        INTEGER NULL
cells               JSON NOT NULL
created_at          DATETIME(3) NOT NULL
```

`cells` preserva as peças e coordenadas utilizadas:

```json
[
  { "pieceId": "piece-1", "letter": "A", "row": 11, "column": 2 },
  { "pieceId": "piece-2", "letter": "P", "row": 11, "column": 3 }
]
```

Traduções e descrições não são duplicadas no banco. `points_earned` é salvo para preservar o valor histórico concedido.

## 10. Contrato HTTP inicial

Prefixo recomendado: `/api/v1`.

```text
POST   /auth/register
POST   /auth/login
GET    /auth/me

POST   /matches
POST   /matches/:matchId/pieces/place
POST   /matches/:matchId/leave
POST   /matches/:matchId/pause
POST   /matches/:matchId/resume
POST   /matches/:matchId/join
GET    /matches
GET    /matches/:matchId
GET    /matches/:matchId/state

GET    /ranking
```

O JWT será enviado como `Authorization: Bearer <token>`.

## 11. Contrato WebSocket inicial

### Cliente para servidor

```text
match:join
piece:place
match:leave
```

Posicionamento:

```json
{
  "pieceId": "piece-1",
  "column": 3,
  "boardVersion": 5
}
```

O cliente não envia letra, linha, palavra ou pontuação. O `pieceId` escolhido
deve pertencer às quatro opções `active` recebidas no snapshot.

### Servidor para cliente

```text
match:snapshot
letters:batch
board:updated
score:updated
player:game-over
match:finished
```

Resposta de posicionamento aceita:

```json
{
  "accepted": true,
  "boardVersion": 6,
  "placedPiece": {
    "pieceId": "piece-1",
    "letter": "A",
    "row": 11,
    "column": 3
  },
  "foundWord": null,
  "removedCells": [],
  "movedCells": [],
  "currentScore": 0
}
```

Códigos iniciais de rejeição:

```text
UNAUTHORIZED
MATCH_NOT_FOUND
NOT_A_MATCH_PLAYER
MATCH_NOT_ACTIVE
PIECE_NOT_FOUND
PIECE_NOT_ACTIVE
PIECE_ALREADY_USED
INVALID_COLUMN
COLUMN_FULL
STALE_BOARD_VERSION
```

## 12. Transação de posicionamento

Cada comando `piece:place` deve executar uma única transação:

1. bloquear o registro de `match_players` para evitar ações concorrentes;
2. validar jogador, partida, peça e `board_version`;
3. calcular a linha final;
4. marcar a peça como `placed`;
5. procurar a primeira palavra válida;
6. registrar `game_words`, se encontrada;
7. atualizar a pontuação;
8. limpar as letras da palavra;
9. aplicar gravidade;
10. descartar as outras três opções do turno;
11. gerar quatro novas opções ativas;
12. incrementar `board_version`;
13. confirmar a transação;
14. emitir eventos WebSocket somente após o commit.

Em caso de falha, toda a operação deve ser revertida.

## 13. Reconexão

O banco é a fonte oficial. O socket não armazena o único estado da partida.

Após reconectar:

1. validar novamente o JWT;
2. confirmar participação na partida;
3. consultar `match_players`;
4. carregar letras `active`, `queued` e `placed`;
5. carregar o placar;
6. enviar `match:snapshot`;
7. o frontend reconstrói a matriz.

## 14. Segurança e integridade

- senhas armazenadas somente como hash;
- JWT validado no HTTP e no handshake do socket;
- autorização conferida em todo evento de partida;
- queries sempre parametrizadas;
- pontuação calculada somente no backend;
- palavras verificadas no JSON do backend no modo autenticado;
- `pieceId` impede o cliente de inventar letras;
- `board_version` impede comandos sobre estado antigo;
- uma peça não pode ser utilizada duas vezes;
- eventos WebSocket emitidos somente após commit no MySQL;
- placares do modo convidado nunca entram no ranking oficial.
- uma única partida pode permanecer ativa por usuário;
- login e criação de partidas possuem rate limit em memória;
- partidas sem atividade são finalizadas após o timeout configurado;
- cada resposta possui `X-Request-Id` para correlação de logs.

## 15. Ordem de implementação

1. Validar os JSONs de letras e palavras com Zod.
2. Implementar autenticação HTTP.
3. Implementar criação de partida solo.
4. Implementar geração ponderada de letras.
5. Implementar serviço de posicionamento e gravidade sem WebSocket.
6. Implementar detecção da primeira palavra horizontal ou vertical válida.
7. Implementar pontuação e remoção transacional.
8. Criar testes unitários da matriz e das palavras.
9. Adicionar Socket.IO chamando os mesmos serviços internos.
10. Implementar snapshot e reconexão.
11. Implementar salas e multiplayer.
12. Implementar histórico e ranking.

As regras do jogo devem ficar em serviços independentes do HTTP e do Socket.IO, para serem testadas diretamente e reutilizadas pelos dois transportes.

## 16. Decisões futuras

- palavras verticais;
- múltiplas palavras em uma única jogada;
- seed ou sequência compartilhada;
- desafios diários;
- replay completo;
- outros idiomas;
- modo espectador;
- Redis para múltiplas instâncias do backend;
- matchmaking automático;
- regras adicionais de combo e bônus.
