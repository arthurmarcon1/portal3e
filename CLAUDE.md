# Portal 3e — contexto do projeto

Você está trabalhando no **Portal 3e**, uma plataforma web de gestão de funcionários
terceirizados. O produto nasce para uso interno da 3e Gestão de Pessoas e será
comercializado depois para outras empresas de terceirização — por isso é
**multiempresa (multi-tenant) desde a primeira linha de código**.

Leia `docs/01-blueprint-produto.md` antes de qualquer tarefa de produto e
`docs/03-modelo-de-dados.md` antes de qualquer tarefa de banco.

---

## Stack

| Camada | Escolha | Observação |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict | Server Components por padrão |
| Estilo | Tailwind CSS v4 + shadcn/ui | tokens no `@theme` de `src/app/globals.css`; regras visuais em `docs/04-design-system.md` |
| Banco / Auth / Storage | Supabase (Postgres + RLS + Auth + Storage privado) | |
| Validação | Zod em toda entrada (form, Server Action, route handler) | |
| Formulários | react-hook-form + zodResolver | |
| Tabelas | TanStack Table | |
| E-mail | Resend | |
| PDF (comprovantes) | `@react-pdf/renderer` no server | |
| Testes | Vitest (unidade) + Playwright (E2E dos fluxos críticos) | |
| Deploy | Vercel | |

Sem Prisma, sem ORM extra: usar `@supabase/supabase-js` + `@supabase/ssr`, com tipos
gerados por `supabase gen types typescript`.

---

## Invariantes — nunca quebrar

1. **RLS ligado em toda tabela.** Nenhuma tabela nova sem policy. Nenhuma consulta que
   dependa de o app "lembrar" de filtrar por empresa.
2. **`service_role` nunca chega ao browser.** Só existe em Server Actions/route handlers
   e em jobs. Se precisar dela, explique no PR por quê.
3. **Bucket privado sempre.** Arquivo só sai por URL assinada de TTL curto, gerada por
   rota de servidor que (a) checa permissão e (b) grava o download em `auditoria`.
4. **Dado sensível é bloqueado por padrão.** Documento das categorias `medico`,
   `bancario`, `folha` e `pessoal` nunca aparece para usuário do tipo `contratante`,
   independentemente do perfil.
5. **Nada de batida de ponto.** O Portal não registra, não ajusta e não apura jornada
   diária. Ele recebe o espelho mensal já fechado. Se uma tarefa parecer pedir isso,
   pare e pergunte.
6. **Toda ação relevante gera log** em `auditoria`: leitura de dado sensível, download,
   publicação, mudança de permissão, ciência, mudança de status de solicitação.
7. **Ciência é imutável.** Registro de confirmação/divergência nunca é editado nem
   apagado. Documento novo = versão nova = ciência nova; o histórico anterior fica.
8. **Nada de soft delete inventado.** Use `status` explícito nas entidades que preveem
   ciclo de vida (`ativo`, `inativo`, `arquivado`), documentado no modelo de dados.
9. **Autorização mora no que renderiza, nunca no proxy.**
   Fronteira de área é o layout do grupo de rotas (tipo de usuário).
   Fronteira de módulo é o layout do módulo (`exigirPermissao`).
   Todo route handler valida sozinho — o proxy nunca é a única barreira, nem para rota
   de API.
   Server Action que não seja pré-sessão começa com `exigirUsuario()`.

---

## Convenções de código

- **Idioma:** banco, rotas e UI em **português** (`pessoas`, `solicitacoes`,
  `/documentos`). Código em inglês (`function getDocuments`). Sem mistura dentro do
  mesmo identificador.
- **Banco:** `snake_case`, plural nas tabelas, `id uuid default gen_random_uuid()`,
  `criado_em`/`atualizado_em timestamptz`, FK sempre com nome explícito.
- **Arquivos:** `kebab-case.tsx`. Componentes em PascalCase.
- **Estrutura:**
  ```
  src/app/(auth)/…            login, primeiro acesso, troca de senha
  src/app/(funcionario)/…     área do funcionário — mobile first
  src/app/(contratante)/…     área do cliente
  src/app/(admin)/…           área da equipe interna
  src/components/ui/…         shadcn
  src/components/…            componentes de domínio
  src/lib/supabase/…          clientes server/browser/admin
  src/lib/auth/…              sessão, perfis, guards
  src/lib/audit.ts            helper único de log
  src/features/<modulo>/      queries, actions, schemas por módulo
  ```
- **Toda mutação passa por Server Action** com: validação Zod → checagem de permissão
  → operação → log de auditoria → `revalidatePath`.
- **Onde cada guarda entra** (invariante 9, detalhado em `docs/03`):

  | Camada | Arquivo | Chamada |
  |---|---|---|
  | Área | `src/app/(admin)/layout.tsx` e irmãos | `exigirTipo("interno")` |
  | Módulo | `src/app/(admin)/pessoas/layout.tsx` | `exigirPermissao("pessoas", "ver")` |
  | Server Action | `src/features/<modulo>/actions.ts` | `exigirUsuario()` e depois `exigirPermissao(...)` para a ação específica |
  | Route handler | `src/app/api/**/route.ts` | valida sozinho, sempre |

  A raiz de `/admin` fica em `exigirTipo` de propósito: ela é fronteira de **área**, e
  não existe permissão única que sirva para os nove módulos. Exigir
  `administracao:ver` ali trancaria RH/DP e Contratos fora do próprio painel — a matriz
  de `docs/02` dá esse módulo só a Admin geral e Suporte/Auditoria.

  **Módulo novo sob `/admin` nasce com o próprio `layout.tsx`** chamando
  `exigirPermissao("<modulo>", "ver")`. Um layout cobre a subárvore inteira, então a
  page de listagem, a de detalhe e as aninhadas ficam protegidas de uma vez — e a
  ação mais forte (`criar`, `editar`, `excluir`, `exportar`) é checada de novo na
  Server Action que a executa.
- **Erro no formato `{ ok: false, erro: string }`.** Mensagem em português, voltada ao
  usuário, dizendo o que fazer. Nunca vazar erro cru do Postgres para a tela.

---

## Como trabalhar comigo

O Arthur é o líder do projeto. Você executa uma tarefa por vez.

- **Uma tarefa = um commit.** Mensagem no padrão `feat(documentos): publicação com versão`.
- **Antes de codar tarefa nova:** releia o critério de aceite dela em
  `docs/05-roadmap-prompts.md` e diga em 3 linhas o que vai fazer. Só então codifique.
- **Depois de codar:** rode `npm run build`, `npm run lint` e os testes. Se quebrou,
  conserte antes de entregar. Relate o que foi feito e o que ficou pendente.
  `npm test` precisa de `.env.local` preenchido: parte da suíte autentica as personas
  do seed no Supabase de verdade, porque permissão é dado e testar contra dublê
  provaria só o dublê. Teste que depende do banco falha alto — nunca é pulado.
- **Migração de banco nunca é editada depois de aplicada.** Corrija com migração nova
  e numeração sequencial: `0007_ajusta_perfis.sql`.
- **Se a tarefa exigir uma decisão de negócio que não está nos docs**, pare e pergunte.
  Não invente regra de permissão, prazo, categoria de documento ou fluxo de aprovação.
  Registre a dúvida em `docs/06-decisoes-pendentes.md`.
- **Se você mudar uma regra que está nos docs, atualize o doc no mesmo commit.**

---

## Módulos (nomes canônicos usados em permissões)

`pessoas` · `contratos` · `documentos` · `jornada` · `solicitacoes` · `comunicacao` ·
`sst` · `relatorios` · `administracao`

Ações: `ver` · `criar` · `editar` · `excluir` · `exportar`

---

## Glossário

- **Contratante** — empresa cliente que contrata a mão de obra terceirizada.
- **Contrato** — instrumento comercial entre a prestadora e a contratante.
- **Unidade** — local físico de alocação (uma contratante pode ter várias).
- **Alocação** — vínculo de uma pessoa a um contrato + unidade, com função e vigência.
- **Espelho** — relatório mensal de ponto, já fechado e conferido, publicado no Portal.
- **Ciência** — confirmação (ou divergência) registrada pelo funcionário sobre um
  documento, com protocolo, data, hora, IP e versão.
- **PontoTel** — sistema externo de ponto. Fonte oficial da jornada. Fora do Portal.
