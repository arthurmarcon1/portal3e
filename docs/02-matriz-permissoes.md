# 02 — Matriz de permissões

Esta matriz é a **fonte da verdade**. Ela é carregada no seed
(`perfis` + `perfil_permissoes`) e nenhum código deve conter regra de acesso hardcoded.

**Conferida por teste, não por olho.** `tests/matriz-permissoes.integracao.test.ts` lê
as tabelas deste arquivo e compara com `perfil_permissoes` e `perfil_categorias` do
banco, célula a célula, apontando cada divergência (ex.: `Fiscal (fiscal) ·
pessoas:exportar — docs/02 marca R, o banco NÃO tem`). Por isso o **formato** das tabelas
é contrato: cabeçalho `| Módulo | …perfis |`, uma linha por módulo canônico, células com
as letras `V C E X R` separadas por espaço ou `—`. Perfil novo = coluna nova aqui + linha
em `COLUNA_PARA_PERFIL` no teste + seed; mudar só um dos três quebra a suíte.

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
`pessoal`, Contratos/Coordenação — que lê espelho e trata contestação — ficaria
sem acesso ao que mais usa. **Publicar espelho em lote é ato de DP** (`jornada:criar`,
Admin geral e RH/DP); a Coordenação trata a contestação, que é outra coisa. **SST não recebe `jornada`**: jornada não é assunto de
saúde e segurança.

O **próprio funcionário** sempre vê os documentos dele, inclusive das categorias
restritas **e inclusive arquivados** — a versão que ele confirmou continua legível depois
de uma retificação (0016). Rascunho, nunca. Restrição é sobre terceiros, não sobre o
titular do dado. A ciência segue a mesma lógica: o titular lê a própria sempre; terceiro
precisa da categoria do documento.

**O teto do contratante não está nesta tabela e não é configurável.** Ele vive no ramo
`contratante` de `app.categoria_permitida()`, que libera apenas `geral`, `contratual` e
`sst`. Inserir linha em `perfil_categorias` para um perfil de contratante não tem
efeito — o bloqueio prevalece. Isso é deliberado: é invariante de produto (CLAUDE.md,
item 4), não configuração de cliente. Mudar esse teto exige migração e decisão de
produto.

**Única exceção, por documento e não por categoria: o espelho confirmado** (decisão do
gestor, 2026-09-30; migração 0027). O contratante lê o `espelho_ponto` individual de
pessoa com alocação vigente no escopo **depois que o funcionário confirma a ciência
daquela versão**. Sem resposta, invisível; com divergência, invisível — até uma
retificação ser publicada e confirmada. `jornada` continua fora do teto: nenhum outro
documento da categoria, e nenhuma ciência (nem a confirmação, nem a justificativa da
divergência), chega ao contratante.

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

**Solicitações:** o contratante lê as do **contrato** (e unidade) do escopo — ocorrência,
substituição, o que for do contrato. Pedido pessoal de funcionário (férias, afastamento,
correção de ponto, atualização cadastral) nasce sem contrato e **não chega a ele**, mesmo
que a pessoa esteja alocada no contrato (0021). O `E` de `solicitacoes` do contratante é
responder quando a 3e pede — situação e responsável só a equipe interna muda (0020).

O que o contratante **vê de uma pessoa**: nome, função, matrícula, unidade, situação
(ativo/afastado/férias/desligado), data de início da alocação, foto (se houver) e
frequência consolidada do mês.

**Como isso é garantido (F5.1, 0023):** o contratante não lê a tabela `pessoas` nem
`ciencias` — RLS corta linha, não coluna. Ele lê pessoa por `quadro_do_contratante()`,
que devolve exatamente nome, matrícula, CPF final (3 dígitos, cortados no banco),
função, contrato, unidade, situação e início, **só de alocação vigente**. Por isso
"desligado" não aparece: o bloqueio de "pessoa sem alocação ativa" vale sobre a lista
acima. Foto ainda não existe (não há bucket de foto); frequência consolidada é
provisória (docs/06). Pendência de ciência chega agregada por documento, sem nomes.

---

## Escopo, documento coletivo e estrutura comercial — regra explícita

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

**Estrutura comercial também não é segregada para quem a edita.** Interno com escopo e
`contratos:editar` lê e cadastra contratante, unidade e contrato da organização inteira
(migração 0013) — sem isso não conseguiria criar nenhum dos três, porque o registro novo
nasce fora do escopo. Com só `contratos:ver`, vê a estrutura do escopo. Em nenhum dos
casos isso abre pessoa ou documento individual de fora do escopo.

**Para o contratante a regra é a oposta:** coletivo só quando dirigido a contrato ou
unidade do escopo dele (`app.documento_no_escopo`). Coletivo de outro cliente, ou sem
escopo nenhum, é 0 linhas — inclusive no público-alvo (`documento_destinatarios`).

## Quadro interno da 3e — quem enxerga (decisão de 2026-09-30)

O quadro interno da 3e é alocado no contratante **3e Gestão de Pessoas**, contrato
**3e — Quadro interno**, unidade **Sede** (docs/06). Quem enxerga esse quadro:

| Perfil | Escopo | Enxerga o quadro interno? |
|---|---|---|
| Admin geral, RH/DP | nenhum (alcance total) | sim, inclusive o ponto |
| SST | **todos os contratos de cliente e o contrato interno** | sim — mas **não o ponto** |
| Contratos, Financeiro, Suporte/Auditoria | **todos os contratos de cliente, sem o contrato interno** | não |

**Motivo:** num quadro interno pequeno, ver o ponto de colegas e de superiores é diferente
de ver o de um terceirizado alocado em cliente. Privilégio mínimo vale mais aqui, não
menos.

Como o escopo segrega **pessoa**, não categoria, o recorte vale para tudo o que é da
pessoa, não só para o espelho: cadastro, alocação, documentos individuais de qualquer
categoria, solicitações e relatórios. Conferido perfil a perfil em 2026-09-30 (docs/06).
O que as regras acima continuam abrindo aos três perfis restritos é o **comunicado
coletivo** dirigido ao quadro interno, e, para Contratos (`contratos:editar`), o
**cadastro** do contratante, do contrato e da unidade internos (sem pessoa nenhuma).

**Por que o SST é a exceção (correção do Arthur, 2026-09-30).** Na primeira versão desta
decisão o SST estava entre os restritos. Mas o escopo corta a pessoa inteira, não só o
ponto: o SST deixava de ver o ASO e o treinamento da equipe interna, e o alerta de
vencimento de 30 dias de alguém da equipe ia **só para o Admin geral** — risco
ocupacional. Com o contrato interno no escopo, o SST vê colega, ASO e treinamento, e
**não** o espelho: a categoria `jornada` não está no perfil dele (tabela de categorias,
acima), e é ela que barra o ponto, não o escopo. Conferido em 2026-09-30: o alerta do ASO
de alguém do quadro interno chega ao SST, e o espelho continua invisível para ele.
O SST também passa a ver as **solicitações** da equipe interna (férias, afastamento,
atualização cadastral), porque a leitura de solicitação segue o escopo da pessoa.

**Contrato de cliente novo precisa entrar no escopo dos quatro perfis** (Contratos,
Financeiro, SST e Suporte/Auditoria). O escopo é
lista explícita de contratos: um contrato cadastrado amanhã fica invisível a eles
(falha fechada) até alguém marcá-lo em **Acessos › Perfis e escopo**.

---

## Documentos: que ação cada passo da publicação pede

A matriz acima dá `documentos:V C E` juntos a todo perfil que publica; esta tabela diz
qual das três cada passo confere (F3.1). A RLS é a mesma para todos os passos de
escrita — interno, `documentos:editar`, categoria liberada e pessoa no escopo (0015).

| Passo | Tela | Server Action | Banco |
|---|---|---|---|
| Listar e abrir documento | `ver` | — | `documentos_leitura` / rascunho só com `editar` |
| Criar rascunho (upload) | `criar` | `criar` | insert só de `rascunho` |
| Pré-visualizar rascunho | — | rota confere `editar` | leitura de rascunho |
| Publicar | `ver` (detalhe) | `editar` | rascunho → publicado |
| Arquivar | `ver` (detalhe) | `editar` | publicado → arquivado |
| Retificar | `editar` | `editar` | insert de rascunho com `substitui_id` |
| Descartar rascunho | `ver` (detalhe) | `editar` | delete só de `rascunho` |

**Descartar rascunho pede `editar`, não `excluir`** — decidido em 2026-09-28 (docs/06).
Rascunho nunca alcançou ninguém. `excluir` fica reservado para destruir registro
publicado, que o sistema não permite de propósito.

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

## Relatórios: quem vê e quem exporta (F5.3)

Cada relatório pede `relatorios:ver` (tela) ou `relatorios:exportar` (arquivo) **e** a
permissão do módulo de onde o dado sai — relatório não é atalho para ler o que o perfil
não lê. O dado é lido com o client do usuário: o escopo e as categorias de quem exporta
são os da RLS.

| Relatório | Módulo exigido | Exportar exige também |
|---|---|---|
| Pendências de ciência | `documentos:ver` | — |
| Ciências registradas | `documentos:ver` | — |
| Solicitações | `solicitacoes:ver` | — |
| Quadro alocado | `pessoas:ver` | — |
| Conformidade de SST | `sst:ver` | — |
| Acessos e downloads | `administracao:ver` | `administracao:exportar` |

O de acessos e downloads é recorte da trilha de auditoria: pela decisão de 2026-09-15,
Suporte/Auditoria **lê** (na tela) e **não exporta**. É também o único auditado **ao ser
aberto**, não só ao exportar (decisão do Arthur, 2026-09-30): é o relatório que audita
quem audita, e ler a trilha de todos precisa deixar rastro nela. Se o registro falhar, a
tela não mostra o dado. Toda exportação grava `exportar` em
`auditoria` (relatório, formato, recorte, linhas) antes de o arquivo sair. Contratante
não usa `/admin/relatorios`; o `R` de `relatorios` na matriz dele ainda não tem tela
(docs/06).

---

## Checklist para validar com o gestor antes de codar a Fase 2

- [ ] A lista de subperfis internos está completa? Falta algum (ex.: jurídico)?
- [ ] Fiscal do contrato pode abrir solicitação de substituição, ou só registrar ocorrência?
- [x] Contratante pode ver o espelho de ponto individual ou só a frequência consolidada?
      **Decidido em 2026-09-30:** vê o individual depois da ciência confirmada (acima).
- [ ] Quem aprova férias: RH, coordenação, ou depende do contrato?
- [ ] Qual o SLA por tipo de solicitação?
- [ ] Prazo de guarda por categoria de documento (meses)?
- [ ] O funcionário desligado mantém acesso por quanto tempo? (sugestão: 90 dias, só leitura)
