# 03 — Modelo de dados e segurança

A migração está em `supabase/migrations/0001_init.sql`. Este documento explica **por
que** cada decisão foi tomada. Se você for mudar o schema, leia isto antes.

> **Ambiente.** Os testes rodam contra o **Supabase local**, recriado do zero a cada
> `npm test`: migrações na ordem e depois o seed. O projeto na nuvem é **demonstração e
> teste manual**, com seed estável, e nenhum teste automatizado escreve nele.
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
existe.

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

Três camadas de autorização, da mais externa à decisiva. **O proxy não é uma delas.**

1. **Fronteira de área — `layout.tsx` do grupo de rotas.** Chama `exigirTipo()`.
   É o que separa funcionário, contratante e equipe interna. Sem esta linha, qualquer
   sessão válida do Portal renderiza qualquer área.
2. **Fronteira de módulo — `layout.tsx` do módulo.** Chama
   `exigirPermissao(modulo, acao)`, que lê `usuario_perfis × perfil_permissoes` no
   banco, nunca uma constante no código. Cobre toda a subárvore do módulo.
   Server Action que não seja pré-sessão começa por `exigirUsuario()`, e route handler
   valida por conta própria — nunca por herança de camada externa.
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
Apagar um `exigirTipo` abre. Se algum dia a única coisa entre um usuário e um dado for
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
login. Os números estão em aberto em `docs/06`.

---

## Como testar a RLS (obrigatório antes de cada release)

Um teste de integração que roda com o client de cada persona, não com `service_role`:

| Cenário | Resultado esperado |
|---|---|
| Funcionário A consulta `pessoas` | 1 linha (ele mesmo) |
| Funcionário A busca documento do funcionário B por id | 0 linhas |
| Fiscal do contrato 1 lista pessoas | só as alocadas no contrato 1 |
| Fiscal tenta ler documento categoria `medico` | 0 linhas |
| Fiscal tenta ler `auditoria` | 0 linhas |
| Usuário da organização X consulta contratos | nenhum da organização Y |
| Funcionário tenta `update` em `ciencias` | erro de permissão |
| Contratante sem escopo cadastrado | 0 linhas em tudo |
| RH sem escopo (interno) | todos os contratos da própria org |
| Interno **com** escopo consulta `pessoas` | só as do escopo — mesmo tendo `pessoas:editar` |
| Interno com `pessoas:editar` vê pessoa sem nenhuma alocação | 1 linha (ela) |
| Contratante vê pessoa sem nenhuma alocação | 0 linhas |
| Interno com `documentos:editar` e sem a categoria em `perfil_categorias` | 0 linhas para `medico`, `bancario`, `folha` — publicado **e** rascunho |
| Quem tem `documentos:editar` lê o rascunho que criou | 1 linha |
| Quem tem só `documentos:ver` lê rascunho | 0 linhas |
| Funcionário lê coletivo direcionado ao contrato dele | 1 linha |

Sem esses testes passando, a fase não é considerada entregue.

---

## Retenção e descarte

`documento_tipos.retencao_meses` define o prazo por categoria. Uma rotina mensal
(cron da Vercel ou pg_cron) marca como `arquivado` o que venceu e move o arquivo para
storage frio ou apaga, conforme a política. O registro em `documentos` e as `ciencias`
**permanecem** — o que se descarta é o arquivo, não a prova de que ele existiu e foi
lido.

Valores a definir com o jurídico antes da Fase 3: ver `docs/06-decisoes-pendentes.md`.
