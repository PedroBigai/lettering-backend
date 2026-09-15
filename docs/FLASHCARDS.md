# Flashcards e histórico de estudo

Implementado em 14/09/2026. A migration `20260914_010_flashcards.sql` adiciona
`flashcard_decks`, `flashcard_cards`, `flashcard_sessions` e `flashcard_reviews`.
O frontend usa a API autenticada para cadastrar, editar, excluir e estudar.

## API

Todas as rotas exigem `Authorization: Bearer <token>`.

- `GET /api/v1/flashcards`: `{decks, statistics}`. Cada baralho contém seus cartões.
- `POST /api/v1/flashcards/actions`: comando abaixo; retorna `{decks, session?}`.

| action | Campos além de action |
| --- | --- |
| createDeck | id (UUID), name |
| renameDeck | id, name |
| deleteDeck | id |
| createCard | id (UUID), deckId, word, translation |
| editCard | id, deckId, word, translation, version |
| deleteCard | id, deckId |
| startSession | id (UUID), deckId (UUID ou null), reviewType (due ou all) |
| review | id (UUID da avaliação), sessionId, cardId, version, rating |
| finishSession | id da sessão |

`deckId: null` inicia o estudo geral. `due` inclui cartões novos e com revisão
pendente; `all` inclui todos os cartões do baralho ou da visão geral.
Uma sessão usa uma fila persistida e cada cartão é avaliado uma vez nessa fila.
Uma nova sessão permite revisar o mesmo cartão novamente.

As avaliações são `again`, `hard`, `good` e `easy`. No aprendizado inicial,
os intervalos são 1 minuto, 10 minutos, 1 dia e 4 dias, respectivamente.
O servidor calcula os intervalos e grava datas em UTC. Timestamps dos cartões
na resposta são números de milissegundos UTC, compatíveis com o frontend anterior.
O cliente calcula apenas a prévia dos intervalos mostrada nos botões.

## Integridade e histórico

- O dono vem do JWT; nenhum comando aceita `userId` informado pelo cliente.
- Até 20 cartões ativos por baralho; palavras duplicadas são comparadas com
  normalização NFKC e conversão para minúsculas.
- Mutações do mesmo usuário são serializadas por lock transacional.
- Edição e revisão exigem a versão atual do cartão.
- Histórico, cartão e fila da sessão são atualizados na mesma transação.
- O cliente mantém o UUID da avaliação enquanto uma requisição falha.
  Repetir esse UUID com a mesma sessão, cartão e avaliação não conta duas vezes.
- Alterar palavra ou tradução reinicia o agendamento do cartão, preservando as
  avaliações anteriores com uma cópia da palavra e tradução daquela revisão.
- Exclusões de cartões e baralhos são lógicas e preservam o histórico.
- Iniciar outra sessão abandona uma sessão anterior ainda aberta. Alterar ou
  excluir conteúdo também abandona sessões abertas do usuário para evitar filas obsoletas.
- Sessões podem ser `in_progress`, `completed`, `ended` (encerradas antes do fim)
  ou `abandoned`. A rotina do backend abandona sessões sem atividade conforme
  `MATCH_INACTIVITY_TIMEOUT_SECONDS`.
- Estatísticas de revisões vêm do histórico e sobrevivem a edição e exclusão.
  A avaliação é uma autoavaliação do aluno, não uma resposta corrigida automaticamente.

Os antigos baralhos de `localStorage` não são apagados nem importados automaticamente.
Uma migração desses dados locais precisa de um fluxo explícito de importação.

## Partidas do quebra-cabeça

`matches`, `match_players` e `game_words` continuam registrando as partidas.
A partir desta implementação, resultados inferiores ao recorde são preservados,
e partidas abandonadas ou expiradas são marcadas como canceladas. O ranking
seleciona o melhor resultado por usuário sem excluir as outras tentativas.
Palavras confirmadas também registram o tempo decorrido da partida.
Registros apagados pela implementação anterior não são recuperados.

## Verificação

```powershell
npm run migrate
npm test
$env:LETTERING_DB_TESTS = '1'
node --test tests/flashcards.integration.test.js
```

O teste de integração usa o MySQL configurado no `.env`, cria contas temporárias
e remove seus dados ao terminar. Verifica CRUD, isolamento entre contas, limite
concorrente, duplicatas, datas, revisão idempotente, fila geral/manual,
encerramento, expiração e preservação do histórico de revisões e partidas.

No frontend: `node --test tests/flashcards.test.mjs` valida o agendamento mostrado
nos botões. O fluxo de cadastro, persistência após recarregar, revisão geral,
nova sessão manual, encerramento e estatísticas foi verificado no navegador.
