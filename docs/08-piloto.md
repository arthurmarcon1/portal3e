# 08 — Colocar em produção para o piloto

Passo a passo para subir o Portal 3e num ambiente de produção **novo**, do zero. Escrito
para quem não acompanhou o desenvolvimento: cada passo diz o que fazer, o comando, e
como conferir que deu certo antes de ir para o próximo. Não pule a conferência — um
passo que falhou em silêncio aparece três passos depois com outra cara.

Tempo estimado: meio dia, sem contar a espera de DNS do domínio de e-mail (até 48 h).

---

## 0. Antes de começar

### O que você precisa ter

| Item | Para quê |
|---|---|
| Acesso de dono à organização no [Supabase](https://supabase.com/dashboard) | criar o projeto de produção |
| Acesso ao time na [Vercel](https://vercel.com) | hospedar a aplicação |
| Conta no [Resend](https://resend.com) | enviar e-mail |
| Acesso ao DNS do domínio que vai mandar e-mail (ex.: `3e.srv.br`) | verificar o domínio no Resend |
| Este repositório clonado, com Node 22+ e `npm install` feito | rodar os comandos abaixo |
| Um gerenciador de senhas | guardar senha do banco, chaves e o segredo do cron |

Os comandos usam o CLI do Supabase via `npx supabase` (vem nas dependências do
projeto — não precisa instalar nada) e `curl`.

### O que precisa estar decidido

Estes itens de `docs/06-decisoes-pendentes.md` afetam o que você configura aqui:

- **Plano da Vercel.** O job de avisos roda de hora em hora (`vercel.json`). O plano Hobby
  só aceita cron diário e **recusa o deploy** com o agendamento atual. Ver passo 8.
- **Administradores gerais: Arthur e Wesley** (decidido em 2026-09-30). O primeiro é
  criado à mão no passo 5; o segundo, pela tela, no passo 5.3.
- **Domínio do Portal e do e-mail** (ex.: `portal.3e.srv.br` e `nao-responda@3e.srv.br`).

### Três regras que não mudam em produção

1. **Nunca rode o seed em produção** (`supabase/seed.sql`, `--include-seed`,
   `supabase db reset`). O seed tem 30 pessoas fictícias e dez usuários com a senha
   `portal3e2026`, pública neste repositório. O passo 4 extrai dele **só** a
   configuração, sem pessoa e sem usuário.
2. **Nunca troque o link do CLI para produção.** O projeto de desenvolvimento está
   ligado ao repositório (`supabase/.temp/project-ref`) e `npm run db:reset:nuvem` apaga
   o banco ligado. Todo comando de produção abaixo usa `--db-url`, explícito, e o link
   continua apontando para o dev.
3. **A chave `service_role` nunca vai para variável `NEXT_PUBLIC_*`.** Ela ignora toda a
   segurança do banco. Só existe no servidor.

### Variáveis deste guia

Defina no terminal, uma vez, e use nos comandos (não salve em arquivo do repositório):

```bash
export PROD_REF="abcdefghijklmnopqrst"       # passo 1
export PROD_SENHA_DB="..."                    # passo 1
export PROD_URL="https://$PROD_REF.supabase.co"
export PROD_SERVICE="..."                     # passo 1 (service_role)
export PROD_DB="postgresql://postgres:$(node -p 'encodeURIComponent(process.env.PROD_SENHA_DB)')@db.$PROD_REF.supabase.co:5432/postgres"
export APP_URL="https://portal.3e.srv.br"     # passo 6
```

---

## 1. Criar o projeto Supabase

1. No painel do Supabase: **New project**.
   - **Name:** `portal3e-producao`
   - **Database password:** gere uma forte e guarde no gerenciador → `PROD_SENHA_DB`
   - **Region:** South America (São Paulo) — `sa-east-1`. Dado de funcionário brasileiro
     fica no Brasil.
   - **Plano:** o gratuito pausa o projeto após 7 dias sem uso. Para produção, Pro.
2. Espere o projeto ficar pronto (2–3 minutos).
3. Em **Project Settings › General**, copie o **Reference ID** → `PROD_REF`.
4. Em **Project Settings › API**, copie:
   - **Project URL** → `PROD_URL`
   - **anon public** → vai para a Vercel no passo 6
   - **service_role** → `PROD_SERVICE` (secreta)

**Conferir:**

```bash
npx supabase db query --db-url "$PROD_DB" "select version();"
```

Deve devolver uma linha com a versão do PostgreSQL. Erro de senha aqui é
senha com caractere especial mal codificado — o `encodeURIComponent` do `PROD_DB` resolve.

---

## 2. Configurar a autenticação

No painel do projeto de produção, **Authentication**:

1. **Sign In / Providers › Email:**
   - **Allow new users to sign up:** **desligado.** No Portal ninguém se cadastra
     sozinho: todo acesso é criado pela tela de Acessos (Admin geral), que usa a API de
     administração — ela continua funcionando com o cadastro público desligado.
   - **Confirm email:** pode ficar ligado; os acessos são criados já confirmados.
2. **URL Configuration:**
   - **Site URL:** `$APP_URL`
   - **Redirect URLs:** `$APP_URL/**`

**Conferir:** tentar criar conta pela API pública precisa ser recusado.

```bash
curl -s -X POST "$PROD_URL/auth/v1/signup" \
  -H "apikey: <anon public>" -H "content-type: application/json" \
  -d '{"email":"teste-cadastro@exemplo.invalid","password":"UmaSenhaQualquer123"}'
```

Resposta esperada: erro com `Signups not allowed for this instance`.

---

## 3. Aplicar as migrações

As migrações em `supabase/migrations/` criam o banco inteiro: tabelas, regras de acesso
(RLS), funções, e os dois buckets privados de arquivo (`documentos` e `anexos`). Elas são
aplicadas **na ordem, em banco limpo** — é exatamente o que o CI prova a cada push.

```bash
npx supabase db push --db-url "$PROD_DB"
```

O comando lista as migrações e pede confirmação. **Não** use `--include-seed`.

**Conferir:**

```bash
npx supabase migration list --db-url "$PROD_DB"
```

Toda linha tem o mesmo número nas colunas **Local** e **Remote**, e o total bate com:

```bash
ls supabase/migrations | wc -l
```

E os buckets existem e são privados:

```bash
npx supabase db query --db-url "$PROD_DB" "select id, public from storage.buckets order by id;"
```

Esperado: `anexos | false` e `documentos | false`. Se algum vier `true`, **pare**: arquivo
de funcionário estaria acessível por link público.

---

## 4. Configurar a organização

O Portal é multiempresa: tudo pertence a uma organização, que tem os seus perfis, a
matriz de permissões, os tipos de documento, o SLA das solicitações e a regra de nome dos
arquivos de espelho. Essa configuração hoje só existe dentro do seed — misturada com as
personas fictícias. Este passo extrai **só a configuração**.

### 4.1 Extrair

```bash
sed -n '/^-- Organização (tenant)/,/^-- Estrutura comercial fictícia/p' supabase/seed.sql \
  | head -n -2 > /tmp/configuracao-producao.sql
```

### 4.2 Revisar e editar

Abra `/tmp/configuracao-producao.sql`. Ele deve começar pela organização e terminar no
SLA. **Confira que não há** `auth.users`, `usuarios`, `pessoas` nem `alocacoes` no
arquivo:

```bash
grep -nE "auth\.users|into usuarios|into pessoas|into alocacoes|portal3e2026" /tmp/configuracao-producao.sql
```

Esse `grep` tem de voltar **vazio**.

Edite a linha da organização com o nome e o CNPJ reais (só dígitos). **Mantenha o `id` e
o `slug` (`3e`)**: o `id` é referenciado no resto do arquivo, e o `slug` monta o login do
funcionário (`<cpf>@func.3e.portal3e`) e tem de bater com `ORG_SLUG` na Vercel.

```sql
insert into organizacoes (id, nome, cnpj, slug) values
  ('1fac8b3c-4860-5606-836b-ca4c8dd420d0', '3e Gestão de Pessoas Ltda', '12345678000199', '3e');
```

O resto do arquivo **não é para editar aqui**:

| Bloco | O que é | De onde vem |
|---|---|---|
| `perfis`, `perfil_permissoes` | 6 perfis internos + 4 de contratante e o que cada um pode | transcrição de `docs/02-matriz-permissoes.md` |
| `perfil_categorias` | quem vê documento médico, bancário, de folha, pessoal e de jornada | idem |
| `documento_tipos` | espelho, comunicado, norma, holerite, ASO, treinamento, norma de SST | **provisório** (docs/06) |
| `regras_espelho` | como achar o CPF no nome do arquivo de espelho | **provisório**, editável na tela |
| `sla_solicitacoes` | prazo em dias úteis por tipo de pedido | **provisório** (docs/06) |

Os provisórios mudam depois por `update`, sem migração, quando o gestor e o jurídico
responderem.

### 4.3 Aplicar

```bash
npx supabase db query --db-url "$PROD_DB" -f /tmp/configuracao-producao.sql
```

**Conferir** as contagens:

```bash
npx supabase db query --db-url "$PROD_DB" "
select (select count(*) from organizacoes)      as organizacoes,
       (select count(*) from perfis)            as perfis,
       (select count(*) from perfil_permissoes) as permissoes,
       (select count(*) from perfil_categorias) as categorias,
       (select count(*) from documento_tipos)   as tipos,
       (select count(*) from sla_solicitacoes)  as sla,
       (select count(*) from regras_espelho)    as regras,
       (select count(*) from usuarios)          as usuarios,
       (select count(*) from pessoas)           as pessoas;"
```

Esperado hoje: `1 | 10 | 181 | 14 | 7 | 8 | 1 | 0 | 0`. **`usuarios` e `pessoas` têm de
ser 0.** Se `permissoes` não der 181, o seed mudou desde este guia — nesse caso o número
certo é o do projeto de desenvolvimento, com a mesma consulta.

**Conferência forte da matriz (opcional, recomendada):** o teste que compara o banco com
`docs/02`, célula a célula, só lê. Rode apontando para produção, com as variáveis só
neste comando:

```bash
NEXT_PUBLIC_SUPABASE_URL="$PROD_URL" SUPABASE_SERVICE_ROLE_KEY="$PROD_SERVICE" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon public>" \
  npx vitest run --project integracao tests/matriz-permissoes.integracao.test.ts
```

Esperado: todos os casos passam. **Só este arquivo** — os outros testes de integração
criam e apagam dados e nunca rodam contra produção.

---

## 5. Criar o primeiro administrador

O seed cria um `admin_geral@3e.com.br` fictício; em produção ele não existe. O primeiro
administrador é criado à mão, uma vez; todos os outros acessos, depois, pela tela
**Acessos** do próprio Portal.

### 5.1 A identidade de login

Escolha o e-mail real da pessoa e uma senha provisória forte (ela troca no primeiro
acesso):

```bash
curl -s -X POST "$PROD_URL/auth/v1/admin/users" \
  -H "apikey: $PROD_SERVICE" -H "Authorization: Bearer $PROD_SERVICE" \
  -H "content-type: application/json" \
  -d '{"email":"arthur@3e.srv.br","password":"<senha provisória forte>","email_confirm":true}'
```

A resposta traz `"id": "…"`. Guarde esse id → `ADMIN_ID`.

### 5.2 O usuário do Portal e o perfil

```bash
npx supabase db query --db-url "$PROD_DB" "
insert into usuarios (id, org_id, tipo, nome, email_login, precisa_trocar_senha)
values ('<ADMIN_ID>', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'interno',
        '<Nome completo>', 'arthur@3e.srv.br', true);
insert into usuario_perfis (usuario_id, perfil_id)
select '<ADMIN_ID>', id from perfis where chave = 'admin_geral';"
```

Sem linha em `usuario_escopos`: interno sem escopo enxerga a organização inteira — é o
que o Admin geral precisa.

**Conferir** — depois do passo 6, com o Portal no ar:

1. Entrar em `$APP_URL/login` com o e-mail e a senha provisória.
2. O Portal **obriga a trocar a senha** antes de qualquer tela.
3. Depois da troca, o menu mostra **Acessos** e **Auditoria**.
4. Em **Auditoria**, aparecem as linhas `login` e `trocar_senha` desse usuário.

### 5.3 O segundo administrador — antes do piloto

Em **Acessos › Novo acesso**, tipo **Equipe interna**, perfil **Administrador geral**. A
tela gera a senha provisória. Os dois administradores são **Arthur e Wesley** (docs/06,
2026-09-30): o piloto não começa com uma pessoa só capaz de mudar permissão.

---

## 6. Publicar na Vercel

### 6.1 Projeto

Na Vercel: **Add New › Project**, importar este repositório. Framework: Next.js
(detectado). Não mude comando de build nem diretório.

### 6.2 Variáveis de ambiente

Em **Settings › Environment Variables**, ambiente **Production**:

| Variável | Valor | Secreta? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `$PROD_URL` | não (vai ao navegador) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave **anon public** do passo 1 | não (vai ao navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | `$PROD_SERVICE` | **sim** — marque *Sensitive* |
| `NEXT_PUBLIC_APP_URL` | `$APP_URL` | não |
| `ORG_SLUG` | `3e` (o mesmo `slug` do passo 4) | não |
| `RESEND_API_KEY` | passo 7 | **sim** |
| `EMAIL_REMETENTE` | passo 7, ex.: `Portal 3e <nao-responda@3e.srv.br>` | não |
| `NOTIFICACOES_EMAIL` | deixe **vazio** até o passo 7 terminar; depois `ativo` | não |
| `CRON_SECRET` | passo 8 | **sim** |

**Não** crie `SUPABASE_PROJECT_REF` nem `SUPABASE_DB_PASSWORD` na Vercel: são do CLI,
não da aplicação.

**Conferir:** nenhuma variável `NEXT_PUBLIC_*` contém `service_role`. Na lista da Vercel,
a única variável com a chave de serviço é `SUPABASE_SERVICE_ROLE_KEY`.

### 6.3 Domínio

**Settings › Domains**: adicionar `portal.3e.srv.br` (ou o escolhido) e criar no DNS o
registro que a Vercel indicar. O `NEXT_PUBLIC_APP_URL` tem de ser exatamente esse
endereço, com `https://` e sem barra no fim — é o link que vai nos e-mails.

### 6.4 Deploy

Um push na branch `main` publica. Ou, em **Deployments**, **Redeploy** do último.

**Conferir:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/login"      # 200
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/admin"      # 307 (manda para o login)
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/api/jobs/notificacoes"   # 401 (sem o segredo)
```

Depois, o roteiro de conferência do passo 5.2 (login do primeiro admin).

---

## 7. Configurar o e-mail (Resend)

O Portal só **avisa** por e-mail e leva para o Portal: nunca manda documento anexo, dado
sensível ou botão de confirmar. Sem o e-mail ligado, os avisos continuam sendo criados e
aparecem no Portal; ficam como `pendente` até o envio ser ligado.

1. No Resend, **Domains › Add domain**: o domínio do remetente (ex.: `3e.srv.br`), região
   São Paulo se disponível.
2. Criar no DNS os registros que o Resend mostrar (SPF/MX e DKIM).
3. Esperar o status **Verified** (minutos a 48 h).
4. **API Keys › Create API key**, permissão **Sending access**, restrita a esse domínio.
5. Na Vercel: `RESEND_API_KEY` = a chave; `EMAIL_REMETENTE` com um endereço **desse**
   domínio; `NOTIFICACOES_EMAIL` = `ativo`. **Redeploy** para as variáveis valerem.

**Conferir:**

- No Resend, o domínio aparece como **Verified**.
- Chamando o job (passo 8), a resposta traz `"motivoRetencao": null` — ou
  `"fora_da_janela"` fora do horário de envio (8 h às 20 h de Brasília). Se vier
  `"flag_desligada"`, falta uma das três variáveis, ou o redeploy.
- No primeiro aviso real (por exemplo, um comunicado com prazo de ciência publicado para
  alguém que tem e-mail pessoal cadastrado), o envio aparece em **Emails** no Resend, e a
  linha em `notificacoes` passa a `enviada`:

```bash
npx supabase db query --db-url "$PROD_DB" "
select status, count(*) from notificacoes where canal = 'email' group by status;"
```

**Atenção:** o funcionário recebe no **e-mail pessoal** do cadastro (o login dele é
sintético e não recebe nada). Quem não tem e-mail pessoal fica com o aviso só no Portal —
é pendência aberta em docs/06.

---

## 8. Agendar o job de avisos (cron)

O job `GET /api/jobs/notificacoes` gera os lembretes de prazo de ciência, os avisos de
prazo vencido e o alerta de SST a 30 dias do vencimento, e envia a fila de e-mail. Ele
só roda com o segredo no cabeçalho `Authorization: Bearer <CRON_SECRET>` — é o que a
Vercel manda nos crons do projeto.

1. Gerar o segredo:

   ```bash
   openssl rand -hex 32
   ```

2. Na Vercel: `CRON_SECRET` = esse valor, marcado *Sensitive*. **Redeploy.**
3. O agendamento já está em `vercel.json` (`0 * * * *`, de hora em hora). **No plano
   Hobby o deploy é recusado** com esse agendamento — Hobby só aceita cron diário.
   Escolha uma:
   - plano **Pro** (recomendado): nada a mudar;
   - manter Hobby: mudar `vercel.json` para `"0 11 * * *"` (8 h de Brasília) —
     lembretes e envios passam a sair uma vez por dia;
   - agendador externo chamando a URL com o cabeçalho (qualquer serviço de cron HTTP).

**Conferir:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/api/jobs/notificacoes"             # 401
curl -s -H "Authorization: Bearer <CRON_SECRET>" "$APP_URL/api/jobs/notificacoes"
```

A segunda devolve algo como:

```json
{"avisos":{"lembretes":0,"vencidos":0},"validade":0,
 "envio":{"enviadas":0,"erros":0,"semEmail":0,"retidas":0,"motivoRetencao":null}}
```

Rodar duas vezes seguidas não duplica aviso (os lembretes e alertas são únicos por
pessoa e documento). Na Vercel, **Settings › Cron Jobs** mostra o agendamento e a última
execução; **Logs** mostra erros com o prefixo `[job notificacoes]`.

---

## 9. Antes de abrir para o piloto

Com o Portal no ar e os dois administradores entrando:

1. **Estrutura comercial:** em **Contratantes**, **Unidades** e **Contratos**, cadastrar o
   cliente do piloto, as unidades e o contrato.
2. **Quadro:** em **Pessoas › Importar planilha**, importar o quadro real do contrato do
   piloto. É o primeiro momento em que dado real de funcionário entra em algum ambiente
   do Portal — e só neste projeto. A importação confere CPF e mostra as inconsistências
   antes de gravar.
3. **Acessos:** em **Acessos**, criar os usuários da equipe interna (com o perfil e, se
   for o caso, o escopo de contrato), os do contratante (com escopo no contrato dele) e
   os dos funcionários. A tela gera a senha provisória de cada um; a entrega ao
   funcionário é decisão pendente (docs/06 sugere o supervisor, na unidade).
4. **Regra do espelho:** em **Espelhos**, ajustar a expressão que acha o CPF (ou a
   matrícula) no nome dos arquivos que saem do fechamento, e conferir com um lote real
   — a tela mostra quem casou e quem não casou antes de publicar qualquer coisa.
5. **Ensaio ponta a ponta com uma pessoa da equipe**, antes de envolver funcionário:
   - publicar um comunicado com prazo para um contrato;
   - entrar como um funcionário de teste **cadastrado no próprio piloto** (não fictício
     do seed), confirmar a ciência pelo celular e baixar o comprovante;
   - conferir em **Auditoria** a publicação, a ciência e o download;
   - conferir em **Relatórios › Pendências de ciência** que a contagem bate.

**Conferir o isolamento uma vez com dado real:** entrar como o usuário do contratante e
confirmar que a lista de pessoas mostra só nome, matrícula, CPF mascarado
(`***.***.**X-YZ`), função, unidade, situação e início — e só de quem está alocado no
contrato dele.

---

## Se algo der errado

- **Migração falhou no meio do passo 3:** o erro diz qual arquivo. **Não edite a
  migração.** O banco de produção é novo; o caminho é apagar o projeto e recomeçar do
  passo 1 — e avisar quem desenvolve, porque o CI deveria ter pegado isso.
- **Precisa mudar o banco depois do piloto começar:** sempre migração **nova**, com
  número seguinte, testada no CI, aplicada com `npx supabase db push --db-url "$PROD_DB"`.
  Nunca `db reset` em produção.
- **Alguém perdeu o acesso:** ninguém destrava bloqueio de login à mão (docs/02). Espera
  15 minutos ou recupera a senha; senha provisória nova é na tela **Acessos**.
- **Chave vazou** (`service_role`, `RESEND_API_KEY`, `CRON_SECRET`): gire no painel de
  origem, atualize na Vercel, redeploy. A `service_role` do Supabase se gira em
  **Project Settings › API**.

## Referências

- `CLAUDE.md` — invariantes do produto (o que nunca pode acontecer).
- `docs/02-matriz-permissoes.md` — quem pode o quê.
- `docs/03-modelo-de-dados.md` — o banco, a segurança e como testá-la.
- `docs/06-decisoes-pendentes.md` — o que ainda depende de decisão.
