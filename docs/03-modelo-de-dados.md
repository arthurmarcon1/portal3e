# 03 — Modelo de dados e segurança

A migração está em `supabase/migrations/0001_init.sql`. Este documento explica **por
que** cada decisão foi tomada. Se você for mudar o schema, leia isto antes.

> **Ambiente.** O projeto Supabase linkado hoje é **dev permanente**. Ele foi usado como
> rascunho — migração aplicada e depois corrigida por cima, schema mexido com o banco no
> ar — e hospeda o seed do qual a suíte de testes depende. **Nenhum dado real de
> funcionário entra nele, em nenhuma fase.** Produção é um projeto novo, criado na F3,
> com as migrações reaplicadas do zero em banco limpo; se a sequência não subir sozinha
> lá, é sinal de que alguma correção só existe no histórico deste projeto e precisa
> virar migração de verdade.

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

**Eventos obrigatórios:** login, falha de login, download, visualização de documento
sensível, publicação, mudança de permissão, mudança de escopo, ciência, mudança de
status de solicitação, exportação de relatório, criação/desativação de usuário.

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

Sem esses testes passando, a fase não é considerada entregue.

---

## Retenção e descarte

`documento_tipos.retencao_meses` define o prazo por categoria. Uma rotina mensal
(cron da Vercel ou pg_cron) marca como `arquivado` o que venceu e move o arquivo para
storage frio ou apaga, conforme a política. O registro em `documentos` e as `ciencias`
**permanecem** — o que se descarta é o arquivo, não a prova de que ele existiu e foi
lido.

Valores a definir com o jurídico antes da Fase 3: ver `docs/06-decisoes-pendentes.md`.
