# 03 — Modelo de dados e segurança

A migração está em `supabase/migrations/0001_init.sql`. Este documento explica **por
que** cada decisão foi tomada. Se você for mudar o schema, leia isto antes.

> **Ambiente.** Com Docker, os testes rodam contra o **Supabase local**, recriado do zero
> a cada `npm test`: migrações na ordem e depois o seed. Sem Docker, rodam contra o
> **projeto dev na nuvem**, sem reset — e por isso todo fixture limpa o que criou.
> **Nenhum dado real de funcionário entra em nenhum dos dois, em nenhuma fase.**
> Produção é um projeto novo, criado na F3, com as migrações reaplicadas do zero em
> banco limpo — o mesmo que o `db reset` local já faz toda execução, que é o que
> impede uma correção de existir só no histórico de um projeto. Ver "Testes" no
> CLAUDE.md.

---

## Mapa das entidades

```
organizacoes (tenant = a prestadora, ex.: 3e)
 ├── contratantes (clientes)
 │    ├── contratos ──┬── contrato_unidades ──┬── unidades
 │    └── unidades ───┘                       │
 ├── pessoas ─── alocacoes (pessoa × contrato × unidade × função × vigência)
 ├── usuarios (1:1 com auth.users)
 │    ├── usuario_perfis  → perfis → perfil_permissoes (modulo × acao)
 │    └── usuario_escopos (contrato e/ou unidade)
 ├── documento_tipos → documentos ─┬── documento_destinatarios (coletivo)
 │                                 └── ciencias (imutável)
 ├── solicitacoes ─┬── solicitacao_eventos
 │                 └── anexos
 └── auditoria · notificacoes · codigos_verificacao
```

### Decisões que valem explicar

**1. `organizacoes` existe desde o dia 1.** O produto vai ser vendido para outras
prestadoras. Adicionar tenant depois é reescrever RLS, migração e queries. Toda tabela
de negócio carrega `org_id` — inclusive as que poderiam derivá-lo por join, porque
isso deixa a policy simples e o índice eficiente.

**2. Espelho de ponto é um `documento`, não uma tabela própria.** Ele precisa das
mesmas coisas: versão, hash, publicação, prazo, ciência, histórico e auditoria.
Criar uma segunda entidade duplicaria toda essa máquina. O que distingue é
`documento_tipos.chave = 'espelho_ponto'` e o campo `competencia`.

O mesmo vale para comunicado, norma, ASO, holerite e termo de rescisão. **Uma
entidade `documentos` para tudo que a pessoa recebe, lê e dá ciência.** Isso é o que
mantém a plataforma simples.

**3. `alocacoes` separada de `pessoas`.** Uma pessoa pode trocar de unidade, de
contrato ou de função e o histórico precisa sobreviver. O contratante enxerga a
pessoa **através** da alocação — sem alocação ativa no escopo dele, a pessoa não
existe. E **nunca pela tabela `pessoas`**: RLS corta linha, não coluna, e a linha tem
CPF, nascimento, telefone, e-mail e endereço. O contratante lê pessoa só por
`quadro_do_contratante()` (0023), que devolve a lista de campos de docs/02 com o CPF
já cortado nos 3 últimos dígitos.

**4. Permissão é dado, não código.** `perfil_permissoes` é uma tabela. Mudar o que o
fiscal pode fazer é um `insert`, não um deploy. É isso que permite vender para uma
empresa com organograma diferente.

**5. `usuario_escopos` vazio + tipo interno = alcance total.** Evita ter que cadastrar
todos os contratos para o administrador geral. Para contratante, escopo vazio significa
**não enxerga nada** — falha fechada, que é o comportamento seguro.

**6. `ciencias` é imutável.** Não existe policy de `update` nem de `delete`. O valor
jurídico do registro vem exatamente disso. Documento retificado gera nova linha em
`documentos` (`versao + 1`, `substitui_id` apontando para a anterior) e uma nova
ciência. A antiga fica.

**7. Protocolo é sequência legível** (`2026-000123`), não UUID. As pessoas vão ler esse
número em voz alta no telefone.

---

## Login por CPF

O Supabase Auth trabalha com e-mail. A solução é um e-mail sintético:

```
funcionário:  <cpf-somente-dígitos>@func.<slug-da-org>.portal3e
interno/cliente: e-mail real da pessoa
```

Fluxo no formulário de login (um campo só, rotulado "CPF ou e-mail"):

```ts
const entrada = normalizar(input);              // trim + lowercase
const somenteDigitos = entrada.replace(/\D/g, "");
const email = somenteDigitos.length === 11
  ? `${somenteDigitos}@func.${orgSlug}.portal3e`
  : entrada;
await supabase.auth.signInWithPassword({ email, password });
```

Regras do primeiro acesso:
- Senha inicial provisória gerada no cadastro e entregue pelo canal definido com o RH.
- `usuarios.precisa_trocar_senha = true` força a troca antes de qualquer outra tela.
- Mínimo 8 caracteres. Sem exigência de símbolo — a barreira de digitação no celular é
  real e piora a segurança na prática (gente anota a senha em papel).
- Recuperação: código de uso único no telefone ou e-mail cadastrado. Nunca por
  pergunta secreta.

O domínio `.portal3e` é interno e não resolve na internet — nenhum e-mail é enviado
para ele. Confirmação de e-mail deve ficar desligada para esses usuários.

**De onde sai o `<slug-da-org>` na tela de login.** Ali ainda não existe sessão, então
não dá para descobrir a organização pelo banco. Enquanto o produto roda em um domínio
por prestadora, a instalação declara o próprio slug na variável de ambiente `ORG_SLUG`
(só server — nunca `NEXT_PUBLIC_`). Quando entrar a segunda organização no mesmo
domínio (F6.3), `src/lib/auth/organizacao.ts` passa a resolver o slug pelo host da
requisição e nada mais muda.

### Barreiras de acesso

Três camadas de autorização, da mais externa à decisiva. **O proxy não é uma delas — e
o layout também não.**

1. **Página — `paginaProtegida` em toda `page.tsx`** das áreas logadas
   (`src/lib/auth/pagina-protegida.tsx`). Refaz `exigirTipo()` (tipo errado → redirect
   para a própria área) e, se a página declara módulo, confere
   `temPermissao(modulo, acao)` em `usuario_perfis × perfil_permissoes` no banco, nunca
   numa constante. Sem permissão, renderiza `SemPermissao` — a tela diz qual permissão
   falta (`modulo:acao`) e a quem pedir. **Falta de permissão nunca é 500.** A página só
   é chamada depois da checagem, então nenhuma consulta dela começa antes.
   *Por que não no layout:* no Next 16 o layout não controla se o resto da rota
   renderiza. Os segmentos são renderizados pelo router em paralelo, e um layout que
   lança ou troca `children` não impede a página de rodar nem de entrar no RSC payload
   (guia de autenticação do Next, "Layouts"). Medido na F2.2: com `exigirPermissao` no
   layout de `/admin/auditoria`, o RH/DP recebia 500 com o RSC completo da página
   dentro, resultado das consultas incluído — só não vazou dado porque a RLS cortou.
   O `exigirTipo` do layout da área continua, mas protege só o que o layout desenha
   (cabeçalho e navegação). `src/app/paginas-protegidas.test.ts` quebra a suíte se
   uma página das áreas não usar o wrapper ou se um layout chamar `exigirPermissao`.
2. **Server Action e route handler — por conta própria.** Server Action que não seja
   pré-sessão começa por `exigirUsuario()` e checa a ação específica com
   `exigirPermissao(modulo, acao)`, que lança e vira `{ ok: false, erro }`. Route
   handler valida sozinho e responde 401/403 — nunca por herança de camada externa.
3. **RLS.** A que vale. Um bug nas duas primeiras não pode virar vazamento.

**Subconsulta em policy roda sob a RLS da tabela consultada.** Duas consequências, as
duas já custaram migração: se a tabela consultada tem policy que volta para a primeira,
o SELECT morre em recursão infinita (`documentos` × `documento_destinatarios`, corrigido
na 0010); e se ela apenas filtra, a policy confunde "não existe" com "não enxergo" —
foi assim que "pessoa sem alocação" quase virou "pessoa cuja alocação eu não vejo"
(0007/0009). Nos dois casos a saída é a mesma: a pergunta que cruza tabela vira função
`SECURITY DEFINER` em `app`, com `search_path` travado.

**Policy de escrita nunca usa `for all`** (aprendido na marra, migração 0008). O
`USING` de um `for all` vale para todos os comandos, SELECT inclusive, e policies
permissivas se combinam por OR. Uma `*_escrita` em `for all` portanto **concede
leitura** a quem tem a permissão de editar, e a `*_leitura` — com escopo, categoria e
tudo o mais — nunca chega a ser avaliada, porque o OR já foi satisfeito. Medido no
seed: interno com escopo em um contrato e `pessoas:editar` enxergava as 30 pessoas da
organização em vez de 14; com `documentos:editar`, enxergaria documento `medico` e
`bancario` de qualquer um, furando a invariante 4. Três comandos, três policies.

**Onde entra o `src/proxy.ts`.** No Next 16 o antigo `middleware.ts` virou `proxy.ts`,
com o export `proxy`. Ele renova a sessão do Supabase, barra quem não tem sessão fora
de `/login` e `/recuperar-senha`, prende em `/primeiro-acesso` quem tem
`precisa_trocar_senha = true` e manda cada tipo para a própria área. O mapa de rotas
fica em `src/lib/auth/rotas.ts`, módulo puro que o proxy e as telas compartilham.

Isso é **conveniência de roteamento, não autorização**. A própria documentação do Next
descreve Proxy como interceptação de requisição, que pode inclusive rodar na CDN, fora
do runtime da aplicação — e já houve CVE de bypass de middleware no Next. O teste é
simples: **apagar `proxy.ts` inteiro não abre buraco nenhum**, só piora a navegação.
Apagar um `paginaProtegida` abre. Se algum dia a única coisa entre um usuário e um dado for
o proxy, isso é o bug, não a economia.

---

## Storage

Dois buckets, ambos **privados**:

| Bucket | Conteúdo | Caminho |
|---|---|---|
| `documentos` | Documentos publicados e espelhos | `{org_id}/{ano}/{tipo}/{documento_id}.pdf` |
| `anexos` | Anexos de solicitação e fotos | `{org_id}/solicitacoes/{solicitacao_id}/{uuid}` |

**Regra única de acesso:** nenhum cliente fala com o Storage. Todo download passa por
`GET /api/documentos/[id]/download`, que:

1. valida a sessão;
2. consulta o documento **com o client do usuário** (a RLS decide, não o código);
3. se o tipo exigir 2FA, verifica se a sessão tem verificação válida nos últimos 15 min;
4. gera URL assinada com TTL de 60 segundos;
5. grava `auditoria` (`acao = 'download'`) com IP, user-agent e id do documento;
6. redireciona.

Isso é o que transforma "quem baixou o quê" em fato registrado em vez de suposição.

O bucket `documentos` é criado pela migração 0015, privado, só `application/pdf`, até
8 MB, **sem nenhuma policy em `storage.objects`**: nem quem lê a linha do documento
baixa direto do Storage. O upload da F3.1 é feito pela Server Action com `service_role`,
e só depois de o client do usuário ter criado a linha — a RLS decide antes do arquivo
existir.

**Implementado na F3.2** em `src/app/api/documentos/[id]/download/route.ts`. Sem
`?baixar=1` o PDF abre inline (a tela de ciência embute assim) e o evento é `ver`; com
ele, a URL assinada força download com o título como nome, e o evento é `download`.
Documento que a RLS não mostra é 404 — igual a inexistente. Só `publicado` e
`arquivado` saem por aqui. O passo 3 devolve 428 para todo tipo com `exige_2fa` até a
F3.3 marcar sessões como verificadas. Os passos 4–6 moram em
`src/features/documentos/entrega.ts`, usados também pela prévia. Coberto por
`src/features/documentos/download.integracao.test.ts` (hash do arquivo entregue,
auditoria com IP, 404 com contraponto, 428, 401).

A **prévia do rascunho** (`GET /api/documentos/[id]/previa`, F3.1) segue os mesmos seis
passos, restrita a rascunho e a `documentos:editar`, com `acao = 'ver'` e
`detalhes.previa = true`. Tipo com `exige_2fa` devolve 428 até a F3.3.

## Ciclo de vida do documento

Garantido por trigger (0015), não pela tela — vale para `authenticated`; `service_role`
e `postgres` (seed, fixture, retenção) ficam de fora:

- **Insert só cria `rascunho`.** `publicado_em`/`publicado_por` são apagados no insert
  e carimbados pelo banco na publicação (`now()`, `auth.uid()`).
- **Publicado só vai para `arquivado`**, sem nenhuma outra coluna mudar junto.
  Arquivado não muda mais. Só rascunho é apagado. Erro com `SQLSTATE 55000` e texto
  pronto para a tela.
- **Coletivo sem público não publica.** Público (`documento_destinatarios`) só muda
  enquanto o documento é rascunho.
- **Prazo:** vazio na publicação = hoje (Brasília) + `prazo_ciencia_dias` do tipo; nunca
  antes de hoje; tipo sem ciência fica sem prazo.
- **Retificação** = insert com `substitui_id` apontando para um **publicado** do mesmo
  tipo, escopo e pessoa; `versao` calculada pelo banco. Índice único em `substitui_id`:
  uma versão por documento substituído. Publicar a nova **arquiva a anterior na mesma
  transação** — as ciências dela ficam, e o titular (ou, no coletivo, quem respondeu)
  continua lendo a versão arquivada (0016).
- **Notificação:** publicar insere uma linha em `notificacoes` (canal `portal`) para
  cada usuário ativo que o documento alcança (`app.pessoas_alcancadas`), na mesma
  transação. E-mail é da F4.3.

Para a tela: `public.categorias_permitidas()` (as categorias que o usuário pode usar,
perguntando a `app.categoria_permitida`) e `public.resumo_do_documento(id)` (alcançados,
confirmações e divergências; zero linhas se a RLS não deixa ler o documento).

---

## Auditoria

Um helper só, `src/lib/audit.ts`:

```ts
await registrarAuditoria({
  acao: "download",
  entidade: "documentos",
  entidadeId: documento.id,
  detalhes: { competencia: documento.competencia, versao: documento.versao },
});
```

Ele já resolve `org_id`, `usuario_id`, `ip` e `user_agent` a partir do request. Escreve
com `service_role` porque a tabela não aceita insert do usuário — o log não pode
depender da boa vontade de quem está sendo auditado.

**Eventos obrigatórios:** login, falha de login, login bloqueado, download, visualização
de documento sensível, publicação, mudança de permissão, mudança de escopo, ciência,
mudança de status de solicitação, exportação de relatório (inclusive da própria
trilha), criação/desativação de usuário.

**A trilha (`/admin/auditoria`, F2.2)** é lida com o client do usuário: quem enxerga é
`auditoria_leitura` (própria organização + `administracao:ver`). Filtros por período
(dia civil de Brasília), usuário, ação e entidade moram na URL, e o CSV lê os mesmos
parâmetros — exportação e tela não discordam sobre o recorte. Exportar pede
`administracao:exportar` no route handler, e o evento `exportar` é gravado **antes** de o
arquivo sair; se o registro falha, o arquivo não sai.

### Bloqueio de login por tentativas

A regra lê a própria `auditoria` — não há contador em tabela separada, que divergiria do
log no primeiro insert que falhasse.

- **5 `falha_login` em 15 minutos bloqueiam** o identificador (CPF ou e-mail). Janela
  deslizante: o bloqueio acaba quando a mais antiga dessas cinco sai da janela.
- Durante o bloqueio **a senha não é testada** e a tentativa não conta como falha; grava
  `login_bloqueado`. Contar faria o bloqueio de quem insiste — o dono da conta, quase
  sempre — nunca terminar.
- `login` e `senha_redefinida` zeram a contagem.
- A chave é `detalhes.chave_login`, **HMAC** do e-mail de login com segredo derivado da
  `service_role` — nunca o CPF em claro, e não sha256 simples, que se desfaz por força
  bruta nos 10⁹ CPFs possíveis. Existe também para identificador sem cadastro: CPF
  inventado bloqueia igual, senão a sexta tentativa revelaria quem existe. Pelo mesmo
  motivo a falha de quem não tem cadastro grava o `org_id` da instalação — sem ele o
  evento some da trilha.
- **Falha aberta, e só aqui:** se a leitura da auditoria der erro, o login segue para o
  Supabase Auth (que tem limite por IP) em vez de trancar a organização inteira. O erro
  vai alto para o console.

Índice parcial `auditoria_tentativas_login_idx` (0011) cobre a leitura, que roda em todo
login. Números e ausência de desbloqueio manual decididos em 2026-09-15 (docs/02,
"Bloqueio de login por tentativas"). A tela de login mostra o horário em que libera e
a contagem regressiva (`src/app/(auth)/login/aviso-bloqueio.tsx`).

---

## Contratante: leitura desenhada, não herdada

Três falhas da mesma família, achadas por teste em três fases diferentes. Não é azar: é
o que acontece quando a leitura do contratante é **herdada** da regra do interno (ou da
tabela vizinha) em vez de desenhada para ele.

| Migração | O que o contratante lia | De onde veio a herança |
|---|---|---|
| **0012** | comunicado coletivo de **qualquer** contrato da organização (e, sem escopo nenhum, todo coletivo) | o ramo "terceiros" de `documentos_leitura` tratava contratante como interno: coletivo não é segregado para quem é da casa, e o contratante entrou junto |
| **0021** | pedido de férias e o **atestado** do afastamento de funcionária do contrato dele | `solicitacoes_leitura` liberava pela **pessoa** no escopo — certo para o RH, errado para o cliente |
| **0023** | **CPF completo, nascimento, telefone, e-mail e endereço** de todo alocado, e quem já tinha saído | `pessoas_leitura` liberava a **linha** ao contratante como ao interno; RLS não corta coluna |

A 0023 é a mais instrutiva: a policy estava "certa" — escopo por contrato, só gente
alocada — e mesmo assim vazava, porque o recorte que importa ali é de **coluna**, e
policy não faz isso. Daí o invariante 10 do CLAUDE.md:

> Toda superfície nova exposta ao contratante devolve campos por função de banco com
> lista explícita, nunca por select em tabela. Policy decide quais linhas; a função
> decide quais colunas. Se uma rota do contratante lê tabela direto, é bug, mesmo que a
> tela não mostre o campo.

**Como aplicar:** para entidade nova que o contratante vê, (1) a policy de leitura não
tem ramo de contratante, ou tem um ramo desenhado para ele, nunca o do interno com
`or app.tipo() = 'contratante'`; (2) os campos saem de função `SECURITY DEFINER` que
confere `app.tipo() = 'contratante'`, permissão e escopo, e lista as colunas; (3) o
teste pede cada campo restrito como o contratante (0 linhas) e como um interno no mesmo
registro (o valor), e varre toda resposta da área atrás dos valores restritos
(`src/features/contratante/contratante.integracao.test.ts`). O mesmo raciocínio vale
para entidade escrita pelos três públicos (docs/06, "Riscos").

**Onde ainda há leitura direta de tabela pelo contratante**, hoje: `solicitacoes`
(ocorrência e substituição do contrato, 0021) com `solicitacao_eventos` e `anexos`,
`documentos` e `documento_destinatarios` (categorias abertas do escopo), `alocacoes`
(vigentes, 0023) e a estrutura comercial (`contratantes`, `contratos`, `unidades`).
Conferido coluna a coluna em 2026-09-30: nenhuma é campo restrito de docs/02
(`unidades.endereco` é o endereço da unidade, não o residencial). O que sobra de risco é
**texto livre** — `titulo`, `descricao`, `conteudo` — escrito por quem abre ou comenta, e
que o contratante do contrato lê por desenho. Qualquer coluna nova nessas tabelas passa
pela pergunta do invariante 10 antes da migração.

## Como testar a RLS (obrigatório antes de cada release)

Um teste de integração que roda com o client de cada persona, não com `service_role`:

| Cenário | Resultado esperado |
|---|---|
| Funcionário A consulta `pessoas` | 1 linha (ele mesmo) |
| Funcionário A busca documento do funcionário B por id | 0 linhas |
| Fiscal do contrato 1 consulta a tabela `pessoas` | 0 linhas — o quadro dele sai de `quadro_do_contratante()`, só com as alocadas **vigentes** no contrato 1 (0023) |
| Fiscal pede `cpf`, `data_nascimento`, `telefone`, `email_pessoal` ou `endereco` de pessoa do escopo | 0 linhas, campo a campo — contraponto: o RH lê o mesmo registro (0023) |
| Fiscal lê `ciencias` de pessoa do escopo | 0 linhas (IP, user agent e justificativa); a pendência sai agregada de `pendencias_de_ciencia_do_contratante()` — contraponto: o RH lê a mesma ciência (0023) |
| Fiscal lê alocação encerrada, ou com `data_fim` passada, no escopo | 0 linhas — e 0 linhas nos documentos dessa pessoa (0023) |
| Perfil de contratante recebe `administracao:ver` por engano | `auditoria`, `usuarios`, `usuario_perfis`, `usuario_escopos` seguem fechados (0023) |
| Fiscal tenta ler documento categoria `medico` | 0 linhas |
| Fiscal tenta ler `auditoria` | 0 linhas |
| Usuário da organização X consulta contratos | nenhum da organização Y |
| Funcionário tenta `update` em `ciencias` | erro de permissão |
| Funcionário tenta `insert` em `ciencias`, ou chamar `registrar_ciencia`, com o próprio token | 42501 — contraponto: a Server Action grava, com IP/user-agent do request (0018) |
| Contratante do 042 lê o pedido de férias (ou baixa o atestado) de funcionária do 042 | 0 linhas / 404 — contraponto: o RH lê e baixa (0021) |
| Funcionário grava evento na linha do tempo (status falso, nota interna, comentário direto) | 42501 (0020) |
| Qualquer um edita ou apaga evento da linha do tempo — inclusive o RH | 42501 (0020) |
| Contratante abre ocorrência em contrato fora do escopo | recusado, nada gravado (0020) |
| Contratante sem escopo cadastrado | 0 linhas em tudo |
| RH sem escopo (interno) | todos os contratos da própria org |
| Interno **com** escopo consulta `pessoas` | só as do escopo — mesmo tendo `pessoas:editar` |
| Interno com `pessoas:editar` vê pessoa sem nenhuma alocação | 1 linha (ela) |
| Contratante vê pessoa sem nenhuma alocação | 0 linhas |
| Interno com `documentos:editar` e sem a categoria em `perfil_categorias` | 0 linhas para `medico`, `bancario`, `folha` — publicado **e** rascunho |
| Quem tem `documentos:editar` lê o rascunho que criou | 1 linha |
| Quem tem só `documentos:ver` lê rascunho | 0 linhas |
| Funcionário lê coletivo direcionado ao contrato dele | 1 linha |
| Contratante lê coletivo dirigido a contrato fora do escopo dele | 0 linhas — e 0 linhas no público-alvo (`documento_destinatarios`) |
| Qualquer usuário tenta `update`/`delete` em `auditoria` | erro de permissão — inclusive Admin geral |
| Interno com escopo no 042 e `contratos:editar` cria contratante, unidade e contrato | cria e lê de volta; lê o contrato 077; continua com 0 pessoas do 077 |
| Interno com escopo no 042 só com `contratos:ver` | só o contrato 042 |
| Interno com `documentos:editar` e sem a categoria cria documento dela (insert sem `RETURNING`) | `42501` — e o contraponto com a categoria cria (0015) |
| Qualquer interno insere documento já `publicado` | `42501` |
| Quem publicou tenta mudar título, voltar a rascunho ou apagar um publicado | `55000` no update; 0 linhas no delete |
| Quem lê o documento baixa o arquivo direto do bucket `documentos` | erro — só a rota do servidor entrega |
| Funcionária confirma a v1, a retificação publicada arquiva a v1 | ela ainda lê a v1 e a ciência dela (versão e hash da v1); terceiro sem `editar` não vê a v1 (0016) |
| Funcionária lê coletivo arquivado que **não** respondeu | 0 linhas — só a v2 |
| Suporte/Auditoria (sem `medico`) lê a ciência de divergência de um ASO | 0 linhas — contraponto: RH/DP lê a mesma ciência (0016) |

Implementados em `tests/rls/` (`npm run test:rls`), um arquivo por tema; as da 0023 em
`src/features/contratante/contratante.integracao.test.ts`, que também varre toda resposta
da área do contratante atrás dos valores restritos; as linhas da
0015 e da 0016 estão em `src/features/documentos/publicacao.integracao.test.ts`, que passa pelas
Server Actions reais. Cada "0 linhas"
tem um contraponto que enxerga o mesmo fixture — senão tabela vazia passaria por
segregação. As linhas de coletivo e de `auditoria` nasceram de defeitos que esses testes acharam, todos
corrigidos na 0012: o contratante lia coletivo de qualquer contrato (desde a 0001), o
público-alvo era legível pela organização inteira (regressão da 0010), e ciência e
auditoria recusavam escrita em silêncio — "0 linhas afetadas", sem erro — em vez de
`42501`.

**Catálogo não entra em "0 linhas em tudo".** `perfis`, `perfil_permissoes`,
`perfil_categorias`, `documento_tipos` e a própria `organizacoes` são legíveis a todo
usuário da organização: descrevem regras, não pessoas.

Sem esses testes passando, a fase não é considerada entregue.

---

## Espelhos em lote (F4.1)

`/admin/jornada/publicar` (`jornada:criar`). Três passos, e o do meio não se pula:
**analisar** manda ao servidor só os nomes dos arquivos, que casa cada um com as pessoas
que a RLS mostra ao usuário pela regra de `regras_espelho` (0019: regex com a chave no
1º grupo + campo `cpf`/`matricula`) e devolve casados, **não casados com motivo**
(sem chave, sem pessoa no alcance, repetido no lote, já publicado na competência) e
pessoas esperadas sem arquivo — só id e nome vão à tela, nunca CPF. A tela **sempre**
mostra a lista de não casados antes do botão de publicar. **Publicar** envia os PDFs em
lotes de até ~6 MB (a Server Action tem teto de 8 MB; o ZIP é aberto no navegador) e cada
lote **refaz o casamento no servidor** com o estado de agora — é isso que impede espelho
duplicado entre lotes. Cada espelho segue o caminho da F3.1 (`gravarRascunho` em
`src/features/documentos/gravacao.ts` → publicação): a RLS de `documentos` ainda pede
`documentos:editar` e a categoria `jornada`. Título `Espelho de ponto — MM/AAAA`,
`competencia` no 1º dia do mês, prazo padrão do tipo se vier vazio.

## Solicitações (F4.2)

Três áreas: funcionário (`/pedidos`), contratante (`/cliente/solicitacoes`), interno
(`/admin/solicitacoes`, caixa de entrada com filtro por tipo, situação, responsável e
prazo).

- **Abertura (0020).** Toda solicitação nasce `aberta`, sem responsável, com
  `prazo = hoje (Brasília) + N dias úteis` de `sla_solicitacoes` — trigger, quem abre não
  escolhe. Funcionário abre só para si e só férias, afastamento, correção de ponto,
  atualização cadastral e suporte, **sem contrato**. Contratante abre só ocorrência e
  substituição, em contrato/unidade/pessoa do escopo. Interno, qualquer tipo, com
  `solicitacoes:criar`.
- **Leitura (0021).** Titular e quem abriu; interno com `solicitacoes:ver` por contrato
  ou pela pessoa do escopo; **contratante só pelo contrato** — pedido pessoal não chega a
  ele. Anexos e linha do tempo herdam.
- **Tratamento.** Só interno com `solicitacoes:editar` muda situação e responsável.
  Transições em `app.transicao_valida` (espelhada em `src/features/solicitacoes/fluxo.ts`
  e conferida por teste); `concluida` e `cancelada` são finais. Tipo, solicitante,
  pessoa e documento não mudam.
- **Linha do tempo, imutável.** O evento de status é gravado **só** pelo trigger
  `trg_solicitacao_status` (0001) e o de atribuição por `trg_solicitacao_atribuicao`
  (0020); o código não duplica. Insert direto só de interno com `editar`, só
  `comentario` (com `interno = true` para nota interna, que `eventos_leitura` esconde de
  quem não é interno). UPDATE/DELETE revogados.
- **Comentário nasce interno (0026).** `interno` tem padrão `true` no banco, na Server
  Action e na tela ("Visível ao solicitante", desmarcada). Texto livre é o que o
  invariante 10 não alcança — função escolhe coluna, não o que se escreveu nela —, então
  o esquecimento tem de esconder, não expor. Os eventos de sistema (status, atribuição) e a
  resposta do solicitante gravam `false` explícito. A caixa "Mensagem ao solicitante" da
  mudança de situação é, pelo rótulo, dirigida a ele, e grava `false`.
- **Resposta do solicitante**: `public.responder_solicitacao` (DEFINER) — só quem abriu,
  só em `pendente_solicitante`; grava o comentário e volta para `em_analise` numa
  transação.
- **Auditoria**: `criar`, `mudar_status` e `atribuir` (entidade `solicitacoes`) — a trilha
  do sistema, separada da linha do tempo que o solicitante lê.
- **Anexos**: foto ou PDF, conferidos pelo conteúdo; bucket `anexos`; saem só por
  `GET /api/anexos/[id]` (RLS de `anexos`, URL de 60 s, auditoria antes).
- Nomes na tela sem abrir `usuarios`: `public.responsaveis_possiveis()` e
  `public.pessoas_da_solicitacao(id)` devolvem id e nome, e só a quem vê a solicitação.

## Notificações (F4.3)

**O banco decide quem é avisado e de quê; o servidor envia.** Cada aviso é uma linha em
`notificacoes` (`canal` portal e/ou email, `motivo`, `status = 'pendente'`), criada por:

| Motivo | Quando | Quem cria |
|---|---|---|
| `publicado` | documento publicado **com prazo** (e-mail); todo publicado (portal) | `app.notificar_publicacao` (trigger, 0015/0022) |
| `lembrete` | 3º dia da publicação, sem resposta, dentro do prazo (docs/06) | `public.gerar_avisos_de_prazo()` (job) |
| `vencido` | prazo passou sem resposta | idem |
| `respondida` | comentário visível da equipe, ou situação vai para "aguardando solicitante", aprovada ou recusada | `app.notificar_solicitacao` (trigger em `solicitacao_eventos`) |
| `concluida` | situação vai para concluída | idem |
| `validade` | ASO/treinamento a ≤ 30 dias do vencimento, não renovado, pessoa com alocação vigente — para quem tem `sst:editar` e enxerga o documento | `public.gerar_avisos_de_validade()` (job, 0024) |

Lembrete e vencido são únicos por pessoa, documento e canal (índice parcial) — o job pode
rodar de hora em hora. Os de solicitação têm um freio de 5 minutos por motivo: comentar e
mudar a situação no mesmo gesto é um e-mail só. O que o próprio solicitante faz e nota
interna não avisam ninguém. O evento de status continua sendo do trigger da 0001; o de
aviso só o lê.

**Envio** (`src/features/notificacoes/envio.ts`, chamado por `GET /api/jobs/notificacoes`
com `Authorization: Bearer $CRON_SECRET`; cron em `vercel.json`): só com
`NOTIFICACOES_EMAIL=ativo` **e** `RESEND_API_KEY` **e** `EMAIL_REMETENTE`, e só entre 8h e
20h de Brasília. Fora disso as linhas ficam `pendente`. Endereço: funcionário recebe em
`pessoas.email_pessoal` (o login dele é sintético); os demais no e-mail de login. Sem
endereço → `erro` com o motivo escrito, e o aviso do Portal continua. Falha do provedor
tenta de novo e desiste na 3ª (`tentativas`, `erro`).

**Modelo único** (`src/features/notificacoes/modelo.ts`): primeiro nome, uma frase, um
botão "Abrir no Portal". Sem título de documento, sem conteúdo de solicitação, sem CPF,
sem anexo, sem botão de confirmar. O prazo e o protocolo entram — não identificam
ninguém.

## SST: validade e conformidade (F5.2)

Norma, treinamento e ASO são `documentos` — mesma publicação, mesma ciência. O que a
F5.2 acrescenta (0024):

- `documento_tipos.validade`: `por_pessoa` (ASO — o mais novo substitui o anterior, seja
  qual for o título), `por_titulo` (treinamento — "NR-35" não renova "NR-10"; a renovação
  repete o título), ou nulo (não vence).
- `documentos.valido_ate`: informado por quem publica, **obrigatório** ao publicar
  individual de tipo que vence (trigger `trg_documentos_validade`, 55000); nulo em
  coletivo e em tipo que não vence. Nenhuma duração é calculada pelo sistema (docs/06).
- **Painel** `/admin/sst` (`sst:ver`): lê pela RLS do usuário, então ASO (`medico`) só
  aparece para quem tem a categoria, e só do escopo. Situação: vencido, a vencer (≤ 30
  dias), em dia. Pessoa sem alocação vigente fica fora.
- **Alerta**: `gerar_avisos_de_validade()` roda no mesmo job da F4.3. Como o job não tem
  usuário, a pergunta "este destinatário vê este documento?" é feita por
  `app.usuario_tem_permissao`, `app.usuario_ve_categoria` e `app.usuario_alcanca_pessoa`
  — o mesmo cálculo das funções de `auth.uid()`, com o usuário explícito. O teste da F5.2
  confere que o alerta bate com o que a RLS mostra ao mesmo usuário.

## Relatórios (F5.3)

`/admin/relatorios`, um por tela, exportação em CSV (`;`, BOM, fórmula desarmada — o
mesmo da auditoria) e PDF (A4 deitado, até 2.000 linhas; acima disso, CSV) pela rota
`GET /api/relatorios/[chave]?formato=csv|pdf`, que valida sozinha e grava `exportar` em
`auditoria` **antes** de entregar — se o registro falhar, o arquivo não sai. Cada
relatório lê no máximo 20.000 linhas e, passando disso, pede recorte menor em vez de
cortar em silêncio.

Tudo com o client do usuário. A única peça de banco nova é a das pendências (0025):
"quem ainda não respondeu" depende do alcance do coletivo, que é DEFINER. Segue o padrão
de `resumo_do_documento`: `public.relatorio_pendencias_de_ciencia()` é INVOKER (lê
`documentos` e `pessoas` com a RLS de quem chama) e só a lista de alcançados sem resposta
vem da parte DEFINER, `app.pendentes_do_documento`. O teste confere o total do Admin geral
contra uma contagem feita à parte, direto das tabelas.

**Minimização:** relatório exportado não leva CPF, título nem descrição de solicitação,
nem IP de ciência — nome e matrícula identificam a pessoa para quem opera. O de acessos
leva IP e e-mail de login, porque é trilha.

## Ciência (F3.4)

**Só o servidor grava ciência** (0018). `authenticated` não tem `insert` em `ciencias`
nem executa a função — tentar dá 42501. O único caminho é a Server Action
`src/features/documentos/ciencia.ts`, que chama, com `service_role`,
`public.registrar_ciencia(usuario, documento, tipo, justificativa, ip, user_agent)`: o
usuário sai da sessão validada no servidor e o IP/user-agent do request, nunca do
navegador. A função é SECURITY DEFINER e confere sozinha o que a RLS conferia:

1. o usuário é `funcionario` ativo e tem `pessoa_id`;
2. o documento é da organização dele e **chega** à pessoa pelas mesmas portas de
   `documentos_leitura` — individual dela, ou coletivo que alcança a alocação vigente
   (`app.documento_alcanca_pessoa`); não chega = "Documento não encontrado";
3. só `publicado` (versão arquivada não recebe resposta nova) e só tipo com
   `exige_ciencia`;
4. divergência exige justificativa de **20 caracteres** (a constraint da 0001, > 10, fica
   como piso);
5. grava a ciência com `versao` e `arquivo_hash` **lidos do documento**; segunda resposta
   = "Você já respondeu este documento" (`unique (documento_id, pessoa_id)`);
6. divergência abre a solicitação do tipo em
   `documento_tipos.tipo_solicitacao_divergencia`, sem responsável e sem prazo (docs/06),
   **na mesma transação** — ciência é imutável, então não pode existir ciência gravada
   com a solicitação falhada.

A Server Action (`src/features/documentos/ciencia.ts`) confere a foto **antes** de
chamar a função — foto inválida não pode deixar meio registro — e sobe a foto aceita para
o bucket privado `anexos` (0017) em `{org_id}/solicitacoes/{id}/{uuid}.jpg`, com o
registro em `anexos` pelo client do usuário (`anexos_insert` exige que a solicitação seja
visível a quem anexa). A tela reduz a foto no celular (lado maior 1.600 px, JPEG) antes
de enviar. Falha da foto depois da ciência gravada vira aviso na tela de protocolo, não
erro. Evento `ciencia` na auditoria. Coberto por
`src/features/documentos/ciencia.integracao.test.ts`.

## Comprovante de ciência (F3.5)

`GET /api/ciencias/[id]/comprovante` gera o PDF **sob demanda, sem guardar** — a prova
é o registro imutável em `ciencias`; o PDF é só a forma de levá-la. A ciência, a pessoa,
o documento e a organização são lidos com o client do usuário: a titular gera sempre;
terceiro só com `documentos:ver`, escopo e a categoria do documento (0016). Qualquer
peça que a RLS não entrega = 404 — o comprovante não sai pela metade.

Conteúdo (docs/05): protocolo, nome, CPF **mascarado** (`***.007.919-**`), título, tipo e
versão, o **hash que a ciência gravou** (não o do documento hoje — é o que prova a qual
arquivo a pessoa respondeu), tipo de resposta, justificativa se houver, data e hora em
Brasília, e o CNPJ da organização no rodapé. Sai com `cache-control: private, no-store`.
O `download` (entidade `ciencias`) vai para a auditoria **antes** de o arquivo sair.
Coberto por `src/features/documentos/comprovante.integracao.test.ts`, que confere que o
hash impresso é o sha256 do arquivo entregue pela rota de download.

## Retenção e descarte

`documento_tipos.retencao_meses` define o prazo por categoria. Uma rotina mensal
(cron da Vercel ou pg_cron) marca como `arquivado` o que venceu e move o arquivo para
storage frio ou apaga, conforme a política. O registro em `documentos` e as `ciencias`
**permanecem** — o que se descarta é o arquivo, não a prova de que ele existiu e foi
lido.

Valores **provisórios** desde 2026-09-28, por tipo: 60 meses nos tipos do MVP e 240 no
ASO. O jurídico ainda fecha os definitivos por categoria — ver
`docs/06-decisoes-pendentes.md`, "Decisões provisórias".

## Prazo de ciência

`documento_tipos.prazo_ciencia_dias` (0014) é o **padrão** do tipo, em dias corridos;
`documentos.prazo_ciencia` é a **data** efetiva daquele documento, preenchida na
publicação a partir do padrão e editável. Tipo sem ciência não tem prazo (constraint).
Provisório: 5 dias, lembrete no 3º dia (docs/06).
