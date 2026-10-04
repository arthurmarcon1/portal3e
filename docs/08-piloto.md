# 08 — Colocar em produção para o piloto

Passo a passo para subir o Portal 3e num ambiente de produção **novo**, do zero. Escrito
para quem não acompanhou o desenvolvimento: cada passo diz o que fazer, o comando, e
como conferir que deu certo antes de ir para o próximo. Não pule a conferência — um
passo que falhou em silêncio aparece três passos depois com outra cara.

Tempo estimado: meio dia.

### O piloto, como ele é (revisado em 2026-10-01)

| | |
|---|---|
| Quadro | **7 funcionários internos da 3e** |
| Estrutura comercial | só o contratante **3e Gestão de Pessoas**, contrato **3e — Quadro interno**, unidade **Sede** |
| Contrato de cliente | **nenhum** |
| Usuário do tipo contratante | **nenhum** |
| E-mail (Resend) | **desligado** — ver passo 7 |
| WhatsApp | Fase 6 — senha entregue em mãos |
| Holerite | fora do piloto (docs/06, 2026-09-30) |
| Planos | **Supabase gratuito** e **Vercel Hobby** — ver "Riscos dos planos gratuitos", no fim do passo 9 |
| SST | **fora do piloto** — entra com o primeiro contrato de cliente (docs/06, 2026-10-01) |
| Espelho de ponto | sai do PontoTel, como nos contratos de cliente |

O que isso tira do guia original: a configuração do Resend e do DNS de e-mail, os acessos
de **Contratos, Financeiro, Suporte/Auditoria e SST** (passo 9.3), a conferência de
isolamento do contratante e as conferências do SST. O que entra no lugar está marcado em
cada passo.

---

## 0. Antes de começar

### O que você precisa ter

| Item | Para quê |
|---|---|
| Acesso de dono à organização no [Supabase](https://supabase.com/dashboard) | criar o projeto de produção |
| Acesso ao time na [Vercel](https://vercel.com) | hospedar a aplicação |
| Este repositório clonado, com Node 22+ e `npm install` feito | rodar os comandos abaixo |
| Um gerenciador de senhas | guardar senha do banco, chaves e o segredo do cron |
| A planilha do quadro e a ficha da empresa (passo 9.2) preenchidas | importar as 7 pessoas |
| Um lote real de espelhos do PontoTel das 7 pessoas | ajustar a regra de espelho (passo 9.4) |

**Não precisa neste piloto:** conta no Resend e acesso ao DNS do domínio de e-mail. Ver
passo 7.

Os comandos usam o CLI do Supabase via `npx supabase` (vem nas dependências do
projeto — não precisa instalar nada) e `curl`.

### O que precisa estar decidido

- **Planos: Supabase gratuito e Vercel Hobby** (decisão do Arthur, 2026-10-04). Os dois
  têm consequência operacional — o Supabase pausa sem atividade e não tem backup, o
  Hobby só roda cron diário — descrita em "Riscos dos planos gratuitos", no fim do passo
  9. **Migrar para os pagos é obrigatório** quando entrar o primeiro cliente externo ou
  houver cobrança: o Hobby é só para uso não comercial (docs/06, "Trava a Fase 6").
- **Administradores gerais: Arthur e Wesley** (decidido em 2026-09-30). O primeiro é
  criado à mão no passo 5; o segundo, pela tela, no passo 5.3.
- **Quem da equipe opera o Portal e com qual perfil** — ficha do passo 9.2. Só existem
  Admin geral e RH/DP neste piloto (passo 9.3).
- **Domínio do Portal.** *Não trava o piloto:* sem e-mail, o endereço só aparece na barra
  do navegador. Pode começar em `https://<projeto>.vercel.app` e trocar depois (passo
  6.3 diz o que muda junto).

### O que nunca vai para produção

Tudo o que existe no dev é **fictício ou é do dev**. Produção nasce das migrações e da
configuração extraída no passo 4 — nada mais é copiado de lá.

| O quê | Onde está | Por que não |
|---|---|---|
| `supabase/seed.sql` inteiro (e `--include-seed`, `supabase db reset`) | repositório | 30 pessoas fictícias e 10 usuários com a senha `portal3e2026`, pública no repositório — inclusive `admin_geral@3e.com.br`. O passo 4 extrai **só** a configuração |
| Estrutura comercial fictícia (contrato `042`, unidades do seed) | seed | o piloto tem só o contrato interno, criado à mão no passo 9.1 |
| O `3e Gestão de Pessoas` / `3e — Quadro interno` cadastrado no dev em 2026-09-30 | banco do dev | recriado pela tela no passo 9.1, nunca copiado |
| Qualquer dump, `pg_dump` ou cópia do banco do dev | — | traz personas, auditoria e senhas fictícias junto |
| Arquivos dos buckets do dev | storage do dev | são espelhos e anexos de pessoas fictícias |
| PDFs de `demo/espelhos/` e o que sair de `scripts/gerar-espelhos-demo.mjs` | local, fora do git | espelhos inventados, com "demonstração" no rodapé. Nunca publicar em produção |
| A linha de exemplo do modelo de importação (`Maria Aparecida Ferreira`, contrato `042`) | `/api/pessoas/modelo-importacao` | CPF do seed. Apague a linha antes de preencher (passo 9.2) |
| Valores de `.env.local` | máquina de quem desenvolve | são as chaves do dev. Produção tem as suas (passo 1) |
| `npm test`, `npm run test:rls`, `npm run test:integracao` com credencial de produção | — | os testes criam e apagam dados com `service_role`. **Única exceção:** o teste da matriz no passo 4.3, que só lê |
| `npm run db:reset:nuvem`, `supabase link` para o ref de produção | — | o reset apaga o banco ligado |
| Variáveis de produção no ambiente **Preview** da Vercel | — | todo branch com PR viraria um site com a `service_role` de produção (passo 6.2) |

**Vai, mas é provisório** (configuração real, não fictícia): os tipos de documento, o SLA
das solicitações e a regra de nome do espelho (passo 4.2). Os 4 perfis de contratante
também vão: são configuração, ficam sem ninguém.

### Três regras que não mudam em produção

1. **Nunca rode o seed em produção.** Ver a tabela acima.
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
export PROD_ANON="..."                        # passo 1 (anon public)
export PROD_SERVICE="..."                     # passo 1 (service_role)
export PROD_DB="postgresql://postgres:$(node -p 'encodeURIComponent(process.env.PROD_SENHA_DB)')@db.$PROD_REF.supabase.co:5432/postgres"
export APP_URL="https://portal.3e.srv.br"     # passo 6.3 (ou o *.vercel.app)
```

---

## 1. Criar o projeto Supabase

1. No painel do Supabase: **New project**.
   - **Name:** `portal3e-producao`
   - **Database password:** gere uma forte e guarde no gerenciador → `PROD_SENHA_DB`
   - **Region:** South America (São Paulo) — `sa-east-1`. Dado de funcionário brasileiro
     fica no Brasil.
   - **Plano:** gratuito (passo 0). Ele limita a **2 projetos gratuitos ativos** por
     conta: com o dev, produção é o segundo. Um terceiro (homologação, por exemplo) não
     cabe sem pausar um dos dois.
2. Espere o projeto ficar pronto (2–3 minutos).
3. Em **Project Settings › General**, copie o **Reference ID** → `PROD_REF`.
4. Em **Project Settings › API**, copie:
   - **Project URL** → `PROD_URL`
   - **anon public** → `PROD_ANON`
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
  -H "apikey: $PROD_ANON" -H "content-type: application/json" \
  -d '{"email":"teste-cadastro@exemplo.invalid","password":"UmaSenhaQualquer123"}'
```

Resposta esperada: erro com `Signups not allowed for this instance`.

---

## 3. Aplicar as migrações

As migrações em `supabase/migrations/` criam o banco inteiro: tabelas, regras de acesso
(RLS), funções, e os dois buckets privados de arquivo (`documentos` e `anexos`). Elas são
aplicadas **na ordem, em banco limpo** — é exatamente o que o CI prova a cada push.
Nenhuma migração insere pessoa, usuário nem contrato.

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
SLA. **Confira que não há** `auth.users`, `usuarios`, `pessoas`, `alocacoes`, contrato
nem contratante no arquivo:

```bash
grep -nE "auth\.users|into usuarios|into pessoas|into alocacoes|into contratos|into contratantes|into unidades|portal3e2026" /tmp/configuracao-producao.sql
```

Esse `grep` tem de voltar **vazio**.

Edite a linha da organização com a razão social e o CNPJ reais (só dígitos) — os da
ficha do passo 9.2. **Mantenha o `id` e o `slug` (`3e`)**: o `id` é referenciado no resto
do arquivo, e o `slug` monta o login do funcionário (`<cpf>@func.3e.portal3e`) e tem de
bater com `ORG_SLUG` na Vercel.

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
| `regras_espelho` | como achar o CPF no nome do arquivo de espelho | **provisório**, editável na tela (passo 9.4) |
| `sla_solicitacoes` | prazo em dias úteis por tipo de pedido | **provisório** (docs/06) |

Os 4 perfis de contratante entram mesmo sem contratante no piloto: são configuração, a
matriz de docs/02 os descreve, e o teste do passo 4.3 os confere. Ficam sem usuário.

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
       (select count(*) from pessoas)           as pessoas,
       (select count(*) from contratos)         as contratos;"
```

Esperado hoje: `1 | 10 | 181 | 14 | 7 | 8 | 1 | 0 | 0 | 0`. **`usuarios`, `pessoas` e
`contratos` têm de ser 0.** Se `permissoes` não der 181, o seed mudou desde este guia —
nesse caso o número certo é o do projeto de desenvolvimento, com a mesma consulta.

**Conferência forte da matriz (recomendada):** o teste que compara o banco com
`docs/02`, célula a célula, **só lê**. Rode apontando para produção, com as variáveis só
neste comando (as definidas na linha de comando vencem as de `.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL="$PROD_URL" SUPABASE_SERVICE_ROLE_KEY="$PROD_SERVICE" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$PROD_ANON" \
  npx vitest run --project integracao tests/matriz-permissoes.integracao.test.ts
```

Esperado: todos os casos passam. **Só este arquivo** — os outros testes de integração
criam e apagam dados e nunca rodam contra produção.

---

## 5. Criar o primeiro administrador

O seed cria um `admin_geral@3e.com.br` fictício; em produção ele não existe. O primeiro
administrador é criado à mão, uma vez; todos os outros acessos, depois, pela tela
**Acessos** do próprio Portal.

O e-mail de login tem de ser **real e da pessoa**: quando o e-mail for ligado, é para
ele que vai o código de recuperação de senha.

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

Em **Acessos › Novo acesso**, tipo **Equipe interna**, perfil **Administrador geral**,
nenhum contrato e nenhuma unidade marcados. A tela gera a senha provisória; entregue em
mãos. Os dois administradores são **Arthur e Wesley** (docs/06, 2026-09-30): o piloto
não começa com uma pessoa só capaz de mudar permissão — e, sem e-mail, são eles que
destravam senha esquecida (passo 7).

---

## 6. Publicar na Vercel

### 6.1 Projeto

Na Vercel: **Add New › Project**, importar este repositório. Framework: Next.js
(detectado). Não mude comando de build nem diretório. **Não faça o primeiro deploy antes
de cadastrar as variáveis:** as `NEXT_PUBLIC_*` são gravadas no código no momento do
build.

### 6.2 Variáveis de ambiente

Em **Settings › Environment Variables**, marcando **só o ambiente Production** (nunca
Preview nem Development — senão todo branch com PR vira um site com a chave de serviço
de produção):

| Variável | Valor | Secreta? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `$PROD_URL` | não (vai ao navegador) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `$PROD_ANON` | não (vai ao navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | `$PROD_SERVICE` | **sim** — marque *Sensitive* |
| `NEXT_PUBLIC_APP_URL` | `$APP_URL`, com `https://` e sem barra no fim | não |
| `ORG_SLUG` | `3e` (o mesmo `slug` do passo 4) | não |
| `CRON_SECRET` | passo 8 | **sim** — marque *Sensitive* |

**Não crie neste piloto** `RESEND_API_KEY`, `EMAIL_REMETENTE` nem `NOTIFICACOES_EMAIL`
(passo 7). **Nunca crie** `SUPABASE_PROJECT_REF` nem `SUPABASE_DB_PASSWORD` na Vercel:
são do CLI, não da aplicação.

**Conferir:** são 6 variáveis, todas só em Production; nenhuma `NEXT_PUBLIC_*` contém a
`service_role`; a única com a chave de serviço é `SUPABASE_SERVICE_ROLE_KEY`.

### 6.3 Domínio

Com domínio decidido: **Settings › Domains**, adicionar `portal.3e.srv.br` (ou o
escolhido) e criar no DNS o registro que a Vercel indicar.

Sem domínio ainda: use o `https://<projeto>.vercel.app` que a Vercel deu. Quando o
domínio vier, trocar **junto**: `NEXT_PUBLIC_APP_URL` na Vercel (com redeploy) e
**Site URL** / **Redirect URLs** no Supabase (passo 2).

### 6.4 Deploy

Um push na branch `main` publica. Ou, em **Deployments**, **Redeploy** do último.

**Conferir:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/login"      # 200
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/admin"      # 307 (manda para o login)
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/api/jobs/notificacoes"   # 401 (sem o segredo)
```

Em **Logs** da Vercel, depois do primeiro acesso, aparece
`[boot] ORG_SLUG="3e" → <razão social>`. Se aparecer "não corresponde a nenhuma
organizacoes.slug", o `ORG_SLUG` ou o passo 4 está errado.

Abrir `$APP_URL/recuperar-senha`: sem as variáveis de e-mail, a tela **não tem campo
nenhum** — só o aviso de que a recuperação está indisponível e que a senha é redefinida
pelos administradores do Portal, e o link
de volta ao login. Se aparecer "CPF ou e-mail", alguma variável de e-mail foi criada na
Vercel (passo 6.2).

Depois, o roteiro de conferência do passo 5.2 (login do primeiro admin).

---

## 7. E-mail — desligado neste piloto

O Resend não está configurado e o WhatsApp é Fase 6. Com 7 pessoas na mesma sala, o piloto
roda sem nenhum envio. **Não configure as variáveis de e-mail** neste piloto.

### O que o Portal deixa de fazer

| Sem e-mail, não acontece | Compensação à mão |
|---|---|
| Aviso de documento publicado (espelho, comunicado, norma) | Quem publica avisa a equipe pessoalmente ou no grupo da equipe: "tem espelho novo no Portal". **Só o aviso** — nunca o documento, print ou dado de ninguém no grupo |
| Lembrete de prazo de ciência e aviso de prazo vencido | RH/DP abre **Relatórios › Pendências de ciência** um dia antes do prazo e no dia, e cobra quem falta, pessoalmente |
| Alerta de SST a 30 dias do vencimento de ASO/treinamento | Não se aplica: o SST está fora do piloto e nenhum ASO ou treinamento é cadastrado no Portal |
| Aviso de solicitação respondida ou concluída, para o funcionário | O funcionário vê em **Meus pedidos** ("aguardando você"); quem responde avisa pessoalmente |
| **"Esqueci minha senha"** por conta própria, para qualquer tipo de usuário | A tela não pede CPF nem e-mail: diz que a recuperação pelo Portal está indisponível e que a senha é redefinida pelos **administradores do Portal** — sem citar setor nem pessoa. No piloto são **Arthur e Wesley** (Admin geral): a pessoa vai direto a um deles, que gera a provisória em **Acessos** e entrega em mãos. Avise isso à equipe na entrega dos acessos. O RH/DP **não** recebe a tela de Acessos para isso (docs/06, 2026-10-01). Bloqueio por tentativas: esperar 15 minutos (ninguém destrava à mão, docs/02) |
| Entrega da senha inicial | Já era em mãos no piloto interno (docs/06, 2026-09-30) |

O que **continua** funcionando sem e-mail: a pendência de documento na home do
funcionário, "aguardando você" em Meus pedidos, a fila de solicitações da equipe, o
e o relatório de pendências de ciência. Nada disso depende de aviso.

Não existe hoje tela que liste os avisos (`notificacoes`, canal `portal`): eles são
gravados mas ninguém os vê (docs/06, Fase 5).

### O que se acumula enquanto isso

Cada publicação, lembrete, prazo vencido e resposta de solicitação grava uma linha
`canal = 'email'`, `status = 'pendente'`. Ela não sai enquanto o e-mail estiver
desligado — e **não sai depois também, se tiver mais de 48 horas**: na primeira rodada
com o envio ligado, o que passou da idade vira `descartada` sem envio (docs/06,
2026-10-01). Ligar o e-mail depois do piloto não despeja a fila na caixa de ninguém.
Para acompanhar:

```bash
npx supabase db query --db-url "$PROD_DB" "
select status, count(*) from notificacoes where canal = 'email' group by status;"
```

### Quando for ligar o e-mail (depois do piloto)

1. No Resend, **Domains › Add domain**: o domínio do remetente (ex.: `3e.srv.br`), região
   São Paulo se disponível.
2. Criar no DNS os registros que o Resend mostrar (SPF/MX e DKIM).
3. Esperar o status **Verified** (minutos a 48 h).
4. **API Keys › Create API key**, permissão **Sending access**, restrita a esse domínio.
5. Na Vercel, só Production: `RESEND_API_KEY` = a chave (**secreta**, *Sensitive*);
   `EMAIL_REMETENTE` com um endereço **desse** domínio, ex.:
   `Portal 3e <nao-responda@3e.srv.br>`; `NOTIFICACOES_EMAIL` = `ativo`. **Redeploy.**

**Conferir:**

- No Resend, o domínio aparece como **Verified**.
- Chamando o job (passo 8), a resposta traz `"motivoRetencao": null` — ou
  `"fora_da_janela"` fora do horário de envio (8 h às 20 h de Brasília). Se vier
  `"flag_desligada"`, falta uma das três variáveis, ou o redeploy.
- `$APP_URL/recuperar-senha` volta a pedir CPF ou e-mail, sem mudança de código; com o
  e-mail de um administrador, o código chega.
- A primeira rodada do job traz `"descartadas"` com o que estava na fila havia mais de
  48 h.

O funcionário recebe no **e-mail pessoal** do cadastro (o login dele é sintético e não
recebe nada). Quem não tem e-mail pessoal fica com o aviso só no Portal — pendência
aberta em docs/06.

---

## 8. Agendar o job de avisos (cron)

O job `GET /api/jobs/notificacoes` gera os lembretes de prazo de ciência, os avisos de
prazo vencido e o alerta de SST a 30 dias do vencimento, e envia a fila de e-mail. Ele
só roda com o segredo no cabeçalho `Authorization: Bearer <CRON_SECRET>` — é o que a
Vercel manda nos crons do projeto. Sem `CRON_SECRET`, responde 401 a tudo (falha
fechada).

**Neste piloto o job não produz nada visível para o usuário** (passo 7): só grava avisos
que ninguém lê. Mas ele tem outra função no plano gratuito: é a **única atividade diária
garantida no banco** — e o Supabase gratuito pausa o projeto depois de 7 dias sem
atividade (ver "Riscos dos planos gratuitos", no fim do passo 9). Por isso o
`CRON_SECRET` **não é opcional**: sem ele, o job responde 401 sem tocar no banco, e não
segura nada.

1. Gerar o segredo:

   ```bash
   openssl rand -hex 32
   ```

2. Na Vercel: `CRON_SECRET` = esse valor, só Production, marcado *Sensitive*. **Redeploy.**
3. O agendamento já está em `vercel.json`: **`0 11 * * *`, uma vez por dia, às 8 h de
   Brasília** — o que o Hobby aceita. No Hobby a Vercel dispara em algum momento dentro
   dessa hora (8h00–8h59), sempre dentro da janela de envio de e-mail (8 h às 20 h).
   Nada a fazer aqui.

**Diário basta**, no Hobby e no Pro: lembrete, vencido e alerta de validade são contados
**por dia** e não se duplicam, e o mais velho que um aviso chega à fila é ~24 h — abaixo
do descarte de 48 h. A exceção: se o job falhar **dois dias seguidos**, o que foi criado
antes disso é descartado, não enviado (docs/06, 2026-10-01).

**Ao migrar para o Pro**, nada é obrigatório: o mesmo `vercel.json` funciona. O que se
ganha mudando para `"0 * * * *"` (de hora em hora) é velocidade, e só com o e-mail
ligado: o aviso de publicação e o de solicitação respondida saem na hora seguinte, não na
manhã seguinte. Se mudar, é commit em `vercel.json` — e o deploy no Hobby passaria a ser
recusado, então só depois da migração.

**Conferir:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/api/jobs/notificacoes"             # 401
curl -s -H "Authorization: Bearer <CRON_SECRET>" "$APP_URL/api/jobs/notificacoes"
```

A segunda devolve, neste piloto:

```json
{"avisos":{"lembretes":0,"vencidos":0},"validade":0,
 "envio":{"enviadas":0,"erros":0,"semEmail":0,"descartadas":0,"retidas":0,"motivoRetencao":"flag_desligada"}}
```

`flag_desligada` é o esperado enquanto o e-mail estiver desligado. Rodar duas vezes
seguidas não duplica aviso. Na Vercel, **Settings › Cron Jobs** mostra o agendamento
(`0 11 * * *`) e a última execução; **Logs** mostra erros com o prefixo
`[job notificacoes]`. **No dia seguinte ao deploy**, confira lá que houve uma execução às
8 h com status 200 — é ela que mantém o Supabase acordado.

---

## 9. Antes de abrir para o piloto

Com o Portal no ar e os dois administradores entrando.

### 9.1 Estrutura comercial

O piloto é o **quadro interno da 3e** (docs/06, 2026-09-30): a 3e entra como contratante
de si mesma. Nesta ordem, porque o contrato vincula unidades que já existem:

- **Contratantes › Novo contratante:** nome `3e Gestão de Pessoas`, CNPJ da 3e;
- **Unidades › Nova unidade:** contratante `3e Gestão de Pessoas`, nome `Sede`, com o
  endereço, a cidade e a UF da sede;
- **Contratos › Novo contrato:** contratante `3e Gestão de Pessoas`, número
  `3e — Quadro interno` (com travessão, não hífen), marcando a unidade `Sede`.

**Nenhum contrato de cliente** é cadastrado neste piloto — nem um "de teste". Contrato
inventado em produção é dado fictício, e é o que mudaria o escopo dos perfis do 9.3.

Esse contratante é **interno e não entra em faturamento** quando houver cobrança
(docs/06, "Trava a Fase 6 / comercialização").

**Conferir:** em **Contratos**, há exatamente um contrato, `3e — Quadro interno`, com a
unidade `Sede`.

### 9.2 Quadro: a planilha das 7 pessoas e a ficha da empresa

É o primeiro momento em que dado real de funcionário entra em algum ambiente do Portal —
e só neste projeto. Colete **só o que está abaixo**: o que o Portal não usa no piloto não
é pedido (LGPD, minimização).

**Planilha do quadro** — uma linha por pessoa, cabeçalho exatamente assim (é o modelo da
tela **Pessoas › Importar planilha › Baixar modelo**, com a linha de exemplo apagada):

| `nome` | `cpf` | `matricula` | `funcao` | `contrato` | `unidade` | `data_inicio` | `telefone` |
|---|---|---|---|---|---|---|---|
| obrigatório | obrigatório | opcional | obrigatório | obrigatório | obrigatório | obrigatório | opcional |
| nome completo, como na folha | 11 dígitos, com ou sem pontuação | a da folha, se existir | cargo atual | `3e — Quadro interno` | `Sede` | admissão, `dd/mm/aaaa` | celular com DDD |

Cuidados:

- **Apague a linha de exemplo do modelo** (`Maria Aparecida Ferreira`, contrato `042`).
  Ela é do seed.
- `contrato` e `unidade` têm de ser **iguais** aos do 9.1 (maiúscula não importa;
  travessão sim). Copie da tela de Contratos em vez de digitar.
- **CPF:** formate a coluna como texto, ou o Excel come o zero inicial — a importação
  completa um CPF de 10 dígitos, mas é melhor não depender disso.
- **Matrícula:** se o PontoTel põe a matrícula (e não o CPF) no nome do arquivo do
  espelho, ela deixa de ser opcional — confira com o lote do 9.4 antes de importar.
- **Telefone:** opcional. Não envia nada hoje; serve ao RH e, na Fase 6, ao WhatsApp
  (que vai pedir opt-in de qualquer forma).
- **Inclua quem também opera o Portal** (Arthur, Wesley, RH/DP, se forem do quadro):
  como funcionário, a pessoa recebe e confirma o próprio espelho.

**Não colete agora:** data de nascimento, endereço, e-mail pessoal. A importação não os
lê, e no piloto nada os usa. E-mail pessoal volta a ser útil quando o e-mail for ligado
(passo 7) — aí se coleta, na ficha da pessoa.

**Ficha da empresa e da equipe** (não é importada — é o que você digita nos passos 4, 5,
9.1 e 9.3):

| Dado | Onde entra |
|---|---|
| Razão social da 3e | passo 4.2 (organização) |
| CNPJ da 3e (14 dígitos) | passo 4.2 e contratante no 9.1 |
| Endereço, cidade e UF da sede | unidade `Sede` no 9.1 |
| Início da vigência do contrato interno (opcional) | contrato no 9.1 |
| Para cada operador: nome, e-mail de login **real**, perfil (Admin geral ou RH/DP) | passos 5 e 9.3 |
| Para cada operador: se é também um dos 7 do quadro | duas contas (9.3) |

**Importar:** em **Pessoas › Importar planilha**, enviar o arquivo. A tela mostra a
pré-visualização com os erros por linha antes de gravar.

**Conferir:** a pré-visualização diz **7 a criar, 0 a atualizar, 0 com erro**; depois de
importar, **Pessoas** lista 7, todas no `3e — Quadro interno`, `Sede`; e:

```bash
npx supabase db query --db-url "$PROD_DB" "
select (select count(*) from pessoas) as pessoas, (select count(*) from alocacoes) as alocacoes;"
```

Esperado: `7 | 7`.

### 9.3 Acessos — quem existe sem contrato de cliente

A tela gera a senha provisória de cada um; **a entrega é presencial** (docs/06 —
WhatsApp é o canal definitivo, na Fase 6). Cada pessoa troca a senha no primeiro acesso.

| Perfil | Neste piloto | Escopo em **Perfis e escopo** |
|---|---|---|
| Administrador geral | **sim** — Arthur e Wesley (passos 5 e 5.3) | nenhum contrato e nenhuma unidade (alcance total) |
| RH/DP | **sim**, para quem faz DP na 3e | nenhum contrato e nenhuma unidade (alcance total) |
| SST | **não** — entra com o primeiro contrato de cliente | — |
| Contratos, Financeiro, Suporte/Auditoria | **não** | — |
| Funcionário | **sim, os 7** — tipo **Funcionário**, escolhendo a pessoa | sem perfil e sem escopo (fixo no próprio cadastro) |
| Contratante | **não** | — |

> ⛔ **Não crie acesso de Contratos, Financeiro ou Suporte/Auditoria enquanto não houver
> contrato de cliente cadastrado.** Neste piloto, isso quer dizer: **nenhum**.
>
> Para a equipe interna, **nenhum contrato marcado é alcance total**, não "nenhum
> acesso". O escopo desses três perfis é "todos os contratos de cliente, sem o
> interno" (docs/02) — e sem contrato de cliente, não há o que marcar. Criado agora, o
> acesso fica sem escopo e **vê o ponto de toda a equipe interna**: a decisão de
> restrição (docs/06, 2026-09-30) **se reverte em silêncio** — a tela não avisa, o login
> funciona, e nada parece errado. Marcar a unidade `Sede` dá no mesmo, porque o quadro
> inteiro está nela; cadastrar um contrato de cliente fictício só para "ter o que
> marcar" é dado inventado em produção.
>
> O que esses perfis fariam no piloto fica com o Admin geral: a estrutura comercial
> (9.1), a trilha de **Auditoria** e os relatórios.
>
> Quando o primeiro cliente entrar, a verificação antes de criar cada um desses acessos:
> 1. Em **Contratos**, existe ao menos um contrato **que não é** `3e — Quadro interno`?
>    Se não, **pare**: o acesso espera.
> 2. Depois de salvar, a coluna de escopo da linha em **Acessos** mostra contratos de
>    cliente — **nunca vazia** para esses três perfis — e `3e — Quadro interno` não
>    aparece em **Perfis e escopo**.
> 3. Entrando como o novo usuário, **Pessoas** não lista ninguém do `3e — Quadro
>    interno`.
>
> E **todo contrato de cliente novo** precisa ser marcado no escopo de Contratos,
> Financeiro, SST e Suporte/Auditoria — senão fica invisível para eles.

**SST fora do piloto** (decisão do Arthur, 2026-10-01): o quadro interno é
administrativo, sem treinamento de NR para controlar, e o módulo foi pensado para quem
está alocado em cliente. Nenhum acesso recebe o perfil SST. O **perfil** continua no
banco, como os outros sem usuário: é configuração do passo 4 (a matriz de docs/02, que o
teste do 4.3 confere), e não um passo deste guia. O SST entra **junto com o primeiro
contrato de cliente**, com o escopo de docs/02.

**Quem é operador e também funcionário do quadro tem duas contas, e assim devem
permanecer** (docs/06, 2026-09-30). O acesso de operador entra pelo **e-mail**, com
o perfil da equipe; o de funcionário entra pelo **CPF**, e é por ele que a pessoa
recebe e confirma o próprio espelho. São logins separados: não junte, não
reaproveite a senha de um no outro, e não dê perfil de equipe à conta de CPF. Ao
entregar os acessos, explique à pessoa qual login serve para quê.

**Conferir:** em **Acessos**, há os 2 administradores, o(s) RH/DP e 7 funcionários —
nada mais. Nenhuma linha de SST, Contratos, Financeiro, Suporte/Auditoria ou
contratante.

```bash
npx supabase db query --db-url "$PROD_DB" "
select u.tipo, coalesce(p.chave, '—') as perfil, count(*)
  from usuarios u
  left join usuario_perfis up on up.usuario_id = u.id
  left join perfis p on p.id = up.perfil_id
 group by 1, 2 order by 1, 2;"
```

Esperado: `funcionario | — | 7`, `interno | admin_geral | 2`, `interno | rh_dp | …` — e
nenhuma outra chave de perfil.

### 9.4 Espelho: formato do export e regra de nome

O espelho sai do fechamento do **PontoTel**, como nos contratos de cliente.

**Antes de tudo, conferir o formato do export real** do mês, antes de levar qualquer
arquivo ao Portal:

- **Um PDF por pessoa:** segue para a regra de nome, abaixo.
- **Um PDF único com todos:** **pare** — o Portal publica um arquivo por pessoa e não
  separa PDF. O arquivo precisa ser dividido antes, uma pessoa por PDF, com o CPF (ou a
  matrícula) no nome. O caminho é o mesmo do separador de contracheque que já existe no
  RPA da 3e. A separação acontece fora do Portal e o PDF único **não** é enviado a ele.

**Conferir:** são 7 PDFs, um por pessoa do quadro, e abrir cada um mostra só aquela
pessoa — um PDF com duas pessoas publicaria o ponto de uma para a outra.

**Regra de nome.** Em **Espelhos**, ajustar a expressão que acha o CPF (ou a matrícula) no nome dos arquivos
que saem do fechamento do PontoTel, e conferir com o lote real das 7 pessoas — a tela
mostra quem casou e quem não casou antes de publicar qualquer coisa.

**Conferir:** os 7 arquivos casam, cada um com a pessoa certa, e nenhum fica sem par.

### 9.5 Ensaio ponta a ponta com uma pessoa da equipe

Antes de entregar os acessos dos outros. Tudo o que o ensaio grava fica em produção para
sempre (a ciência é imutável), então ele usa **conteúdo real**, não "teste":

- publicar um comunicado **real** com prazo para o `3e — Quadro interno` — por exemplo,
  o de boas-vindas ao Portal, que todos vão receber de qualquer forma;
- entrar com a conta de **funcionário** de alguém do quadro que já esteja com o acesso
  (de preferência o Arthur ou o Wesley, na conta de CPF), confirmar a ciência pelo
  celular e baixar o comprovante;
- conferir em **Auditoria** a publicação, a ciência e o download;
- conferir em **Relatórios › Pendências de ciência** que a contagem bate: 1 confirmada,
  as demais pendentes.

### 9.6 Conferir o escopo com dado real

- Como **RH/DP**: **Pessoas**, **Documentos**, **Solicitações** e **Relatórios › Quadro**
  mostram as 7 pessoas, inclusive o espelho de ponto.
- Como **funcionário**: só o próprio cadastro, os próprios documentos e o comunicado.

SST, Contratos, Financeiro, Suporte/Auditoria e contratante não têm o que conferir: não
existem neste piloto. Quando o primeiro cliente entrar, as três conferências que
ficaram de fora passam a ser obrigatórias: restritos não veem o quadro interno; o SST
vê pessoas e ASO, mas nenhum espelho de ponto; contratante vê só nome, matrícula, CPF
mascarado, função, unidade, situação e início de quem está no contrato dele.

### Riscos dos planos gratuitos

O piloto roda no **Supabase gratuito** e na **Vercel Hobby** (passo 0). Três riscos
operacionais, que não existem nos planos pagos:

**1. O Supabase pausa o projeto depois de 7 dias sem atividade.** Com 7 pessoas
entrando uma vez por mês para o espelho, sem nada mais, isso acontece. Pausado, o Portal
não abre para ninguém até alguém reativar no painel (**Restore project**, alguns
minutos; os dados ficam). O Supabase manda e-mail ao dono da organização antes de pausar.

- **O que segura, sem custo:** o job do passo 8 consulta o banco todo dia às 8 h. É
  atividade real no banco, diária — e é a forma simples de evitar a pausa. O Supabase não
  publica o critério exato de "inatividade", então trate como proteção, não como
  garantia, até ver funcionar.
- **Rotina, toda segunda-feira, nas primeiras semanas:** um administrador abre
  `$APP_URL` e entra. Se o Portal não abrir, o projeto pausou: reativar no painel e
  conferir em **Settings › Cron Jobs** da Vercel se o job das 8 h está rodando com 200.
  Depois de um mês sem pausa, a rotina pode virar mensal.
- **Conferir que o job está segurando:** em **Settings › Cron Jobs** da Vercel, uma
  execução por dia com status 200. Status 401 é `CRON_SECRET` faltando ou errado — e aí
  o banco fica sem atividade.

**2. O Supabase gratuito não tem backup.** Backup diário é do plano pago. O banco do
piloto guarda o que não se refaz: a ciência dos funcionários (imutável, com protocolo,
data, IP e versão) e a trilha de auditoria. Os PDFs dos espelhos se refazem do PontoTel;
a ciência, não.

- **Mitigação: `npm run backup:producao`**, depois de cada publicação de espelho e de
  cada prazo de ciência encerrado. Um comando só:

  ```bash
  npm run backup:producao
  ```

  O que ele faz (detalhes no cabeçalho de `scripts/backup-producao.mjs`):
  - copia **só** o banco de `PROD_DB`, a variável deste guia — nunca o link do
    repositório nem o `.env.local`. Recusa o dev (ref de `.env.local`), o local e URL
    que não seja Supabase;
  - grava em `~/portal3e-backups/<data>_<hora>/` dois arquivos: `…-dados.sql` (o que
    importa: dados de `public`, `app`, `auth` e metadados do `storage`) e `…-esquema.sql`
    (conferência). Pasta com permissão 700, arquivos 600;
  - confere que o arquivo de dados traz organização e usuários, e diz se já há pessoas,
    ciências e auditoria;
  - no fim, **avisa onde salvou e manda cifrar**, com o comando pronto (`gpg
    --symmetric`) e o `shred` do original em texto puro.

  Precisa do **Docker Desktop aberto**: o `supabase db dump` roda o `pg_dump` num
  contêiner. Sem ele, o script para e diz isso.

  **Conferir:** a saída termina em verde com "Salvo em …" e os dois arquivos com tamanho;
  depois de cifrar, só os `.gpg` ficam na pasta.

  Os arquivos do Storage (PDFs) **não** entram no dump: guarde os originais do PontoTel
  do mês. Para restaurar: projeto novo, migrações na ordem (as do commit da época, passo
  3) e o arquivo de dados por cima.

> ⛔ **O arquivo do backup NUNCA entra no repositório** — nem cifrado, nem "só um
> instante", nem num branch. É dado pessoal de funcionário real: CPF, ciência com IP e
> data, logins. Commitado, seria o **primeiro vazamento de verdade deste projeto**,
> depois de todo o trabalho de RLS, e o histórico do git não esquece.
>
> - O padrão do script já é **fora** do repositório (`~/portal3e-backups`).
> - Com `--saida=` apontando para dentro do repositório, o script **recusa** se o git
>   não ignorar o caminho.
> - O `.gitignore` é a segunda barreira: ignora `/backups/`, `portal3e-*-dados.sql`,
>   `portal3e-*-esquema.sql` e `*.sql.gpg` em qualquer pasta.
> - Nunca `git add -f` num desses. Nunca anexar a issue, PR, chat ou e-mail.
> - Guardar o `.gpg` fora de pasta sincronizada sem controle de acesso; a senha do gpg,
>   no gerenciador de senhas.

**3. A Vercel Hobby só roda o job uma vez por dia.** Já ajustado (passo 8). Sem e-mail
ligado, não muda nada para o usuário.

**Fim do gratuito:** entrou o primeiro cliente externo, ou passou a haver cobrança,
migra-se **os dois** — Vercel Pro e Supabase pago. Não é opcional (docs/06, "Trava a
Fase 6 / comercialização"). No Supabase, a mudança de plano é no mesmo projeto, sem
migrar dados; na Vercel, idem. O que muda no `vercel.json` está no passo 8.

---

## Se algo der errado

- **Migração falhou no meio do passo 3:** o erro diz qual arquivo. **Não edite a
  migração.** O banco de produção é novo; o caminho é apagar o projeto e recomeçar do
  passo 1 — e avisar quem desenvolve, porque o CI deveria ter pegado isso.
- **Precisa mudar o banco depois do piloto começar:** sempre migração **nova**, com
  número seguinte, testada no CI, aplicada com `npx supabase db push --db-url "$PROD_DB"`.
  Nunca `db reset` em produção.
- **Alguém perdeu o acesso:** ninguém destrava bloqueio de login à mão (docs/02). Espera
  15 minutos. Sem e-mail, a tela de recuperação manda falar com os administradores do
  Portal; senha provisória
  nova é com o Admin geral, na tela **Acessos**, entregue em mãos.
- **Importação recusou linha:** a pré-visualização diz o motivo por linha. Corrija a
  planilha e envie de novo; nada é gravado enquanto houver erro.
- **Chave vazou** (`service_role`, `CRON_SECRET`): gire no painel de origem, atualize na
  Vercel, redeploy. A `service_role` do Supabase se gira em **Project Settings › API**.

## Referências

- `CLAUDE.md` — invariantes do produto (o que nunca pode acontecer).
- `docs/02-matriz-permissoes.md` — quem pode o quê; "Quadro interno da 3e".
- `docs/03-modelo-de-dados.md` — o banco, a segurança e como testá-la.
- `docs/06-decisoes-pendentes.md` — o que ainda depende de decisão.
