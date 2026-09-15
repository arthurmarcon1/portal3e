# 02 — Matriz de permissões

Esta matriz é a **fonte da verdade**. Ela é carregada no seed
(`perfis` + `perfil_permissoes`) e nenhum código deve conter regra de acesso hardcoded.

Legenda: `V` ver · `C` criar · `E` editar · `X` excluir · `R` exportar/relatório · `—` sem acesso

---

## Equipe interna (tipo de usuário: `interno`)

| Módulo | Admin geral | RH/DP | Contratos | Financeiro | SST | Suporte/Auditoria |
|---|---|---|---|---|---|---|
| pessoas | V C E X R | V C E R | V R | V | V | V |
| contratos | V C E X R | V | V C E R | V R | V | V |
| documentos | V C E X R | V C E R | V C E R | V C E R | V C E R | V |
| jornada | V C E X R | V C E R | V R | V R | — | V |
| solicitacoes | V C E X R | V C E R | V C E R | V R | V C E | V |
| comunicacao | V C E X R | V C E R | V C E R | — | V C E R | V |
| sst | V C E X R | V | V | — | V C E X R | V |
| relatorios | V R | V R | V R | V R | V R | V R |
| administracao | V C E X R | — | — | — | — | V |

Restrições adicionais por categoria de documento (aplicadas em cima da tabela acima).

Esta tabela é carregada em **`perfil_categorias`** (migração 0003), no mesmo espírito
de `perfil_permissoes`: categoria de documento é dado, não `case` em função. Cliente
com organograma diferente é `insert`, não migração.

| Categoria | Quem enxerga | Linha em `perfil_categorias` |
|---|---|---|
| `medico` (ASO, CID, atestado) | Admin geral, SST, RH/DP | sim |
| `bancario` | Admin geral, Financeiro | sim |
| `folha` (holerite, benefícios) | Admin geral, Financeiro, RH/DP | sim |
| `pessoal` (RG, CPF, comprovantes) | Admin geral, RH/DP | sim |
| `jornada` (espelho de ponto) | Admin geral, RH/DP, Contratos, Financeiro | sim |
| `contratual`, `geral`, `sst` | Todos os perfis internos com `documentos:ver` | não — são abertas |

`jornada` (migração 0004) existe porque espelho de ponto não cabe em nenhuma das
outras: não é pagamento, não é documento pessoal e não é aberto. Fosse `folha` ou
`pessoal`, Contratos/Coordenação — que publica espelho e trata contestação — ficaria
sem acesso ao que mais usa. **SST não recebe `jornada`**: jornada não é assunto de
saúde e segurança.

O **próprio funcionário** sempre vê os documentos dele, inclusive das categorias
restritas. Restrição é sobre terceiros, não sobre o titular do dado.

**O teto do contratante não está nesta tabela e não é configurável.** Ele vive no ramo
`contratante` de `app.categoria_permitida()`, que libera apenas `geral`, `contratual` e
`sst`. Inserir linha em `perfil_categorias` para um perfil de contratante não tem
efeito — o bloqueio prevalece. Isso é deliberado: é invariante de produto (CLAUDE.md,
item 4), não configuração de cliente. Mudar esse teto exige migração e decisão de
produto.

---

## Contratante (tipo de usuário: `contratante`)

Sempre limitado ao(s) contrato(s) e unidade(s) do escopo do usuário.

| Módulo | Gestor do contrato | Fiscal | Gestor da unidade | Adm./Financeiro |
|---|---|---|---|---|
| pessoas | V R | V | V | V |
| contratos | V R | V | V | V R |
| documentos | V R | V | V | V R |
| jornada | V R | V | V | V R |
| solicitacoes | V C E R | V C E | V C E | V C |
| comunicacao | V | V | V | — |
| sst | V R | V | V | — |
| relatorios | V R | V | V R | V R |
| administracao | — | — | — | — |

**Bloqueio absoluto para todo perfil de contratante**, independente da tabela acima:

- documentos das categorias `medico`, `bancario`, `folha`, `pessoal`
- campos: CPF completo (só últimos 3 dígitos), data de nascimento, endereço
  residencial, telefone pessoal, e-mail pessoal, dados bancários, salário
- qualquer pessoa sem alocação ativa no contrato/unidade do escopo
- qualquer registro de auditoria

O que o contratante **vê de uma pessoa**: nome, função, matrícula, unidade, situação
(ativo/afastado/férias/desligado), data de início da alocação, foto (se houver) e
frequência consolidada do mês.

---

## Escopo e documento coletivo — regra explícita

**O escopo de um interno segrega pessoa e documento individual. Não segrega aviso
geral.** Interno com escopo (ex.: só o contrato 042) **lê** comunicado coletivo dirigido a
qualquer contrato ou unidade da organização, publicado ou — se tiver
`documentos:editar` — em rascunho. Continua sem ler pessoa e documento individual de
quem está fora do escopo.

**Isto não é vazamento, e não deve ser "consertado".** Decidido em 2026-09-15: aviso geral
não é dado de pessoa, e esconder de um coordenador o comunicado que outro contrato
recebeu não protege ninguém. O ramo `app.tipo() = 'interno'` em `documentos_leitura`
(migração 0012) existe por esta regra, e `tests/rls/documentos.integracao.test.ts`
("interno com escopo e comunicado coletivo") falha se ele sumir.

**Para o contratante a regra é a oposta:** coletivo só quando dirigido a contrato ou
unidade do escopo dele (`app.documento_no_escopo`). Coletivo de outro cliente, ou sem
escopo nenhum, é 0 linhas — inclusive no público-alvo (`documento_destinatarios`).

---

## Funcionário (tipo de usuário: `funcionario`)

Não usa a tabela de perfis. O acesso é fixo e sempre restrito a `pessoa_id = o próprio`:

| Pode | Não pode |
|---|---|
| Ver o próprio cadastro e alocação | Ver qualquer outra pessoa |
| Baixar os próprios documentos e espelhos | Ver documento coletivo fora do seu contrato/unidade |
| Abrir solicitação em nome próprio | Alterar o próprio cadastro trabalhista |
| Anexar arquivo à própria solicitação | Alterar ou apagar ciência já registrada |
| Confirmar ciência / registrar divergência | Ver auditoria, relatórios ou dados de terceiros |
| Ver comunicados e conteúdo de SST direcionados a ele | Exportar em lote |

Edição de dados de contato (telefone, e-mail, endereço) pelo funcionário: **permitida,
mas como solicitação** — cria um pedido de atualização cadastral que o RH aprova. Isso
mantém o cadastro trabalhista sob controle do DP e ainda assim dá autonomia.

---

## Autenticação reforçada (código de uso único)

Exigida quando `documento_tipos.exige_2fa = true`. Recomendado para:

- Documentos de folha e benefícios
- Documentos bancários
- Termos de desligamento e rescisão
- Qualquer documento que gere ciência com efeito trabalhista relevante

Regras: código de 6 dígitos, validade de 10 minutos, máximo 5 tentativas, enviado por
e-mail ou WhatsApp cadastrado, invalidado após uso. Uma verificação libera a sessão
por 15 minutos para documentos do mesmo tipo.

---

## Bloqueio de login por tentativas

Vale para todo tipo de usuário, por identificador (CPF ou e-mail), exista cadastro ou
não. Decidido em 2026-09-15:

- **5 falhas em 15 minutos bloqueiam.** Janela deslizante; login certo e senha
  redefinida pela recuperação zeram a contagem.
- **Sem desbloqueio manual.** Ninguém — nem RH, nem Admin geral — destrava um acesso
  bloqueado. Viraria fila de chamado por algo que se resolve esperando. Os caminhos são
  esperar ou recuperar a senha.
- **A tela de login mostra até quando** (horário e contagem regressiva) e diz que a conta
  não foi desativada — senão a pessoa acha que o acesso morreu.

Mecânica em docs/03, "Bloqueio de login por tentativas".

---

## Auditoria: quem lê e quem exporta

| Perfil | Lê a trilha (`/admin/auditoria`) | Exporta CSV |
|---|---|---|
| Admin geral | sim (`administracao:ver`) | sim (`administracao:exportar`) |
| Suporte/Auditoria | sim (`administracao:ver`) | **não** |
| Demais | não | não |

Decidido em 2026-09-15, **mantido de propósito:** perfil de auditoria é leitura, e trilha
exportada é cópia de dado sensível saindo do sistema. Não é esquecimento na matriz — não
dê `administracao:exportar` a Suporte/Auditoria sem nova decisão.

---

## Checklist para validar com o gestor antes de codar a Fase 2

- [ ] A lista de subperfis internos está completa? Falta algum (ex.: jurídico)?
- [ ] Fiscal do contrato pode abrir solicitação de substituição, ou só registrar ocorrência?
- [ ] Contratante pode ver o espelho de ponto individual ou só a frequência consolidada?
- [ ] Quem aprova férias: RH, coordenação, ou depende do contrato?
- [ ] Qual o SLA por tipo de solicitação?
- [ ] Prazo de guarda por categoria de documento (meses)?
- [ ] O funcionário desligado mantém acesso por quanto tempo? (sugestão: 90 dias, só leitura)
