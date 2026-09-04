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

Restrições adicionais por categoria de documento (aplicadas em cima da tabela acima):

| Categoria | Quem enxerga |
|---|---|
| `medico` (ASO, CID, atestado) | Admin geral, SST, RH/DP |
| `bancario` | Admin geral, Financeiro |
| `folha` (holerite, benefícios) | Admin geral, Financeiro, RH/DP |
| `pessoal` (RG, CPF, comprovantes) | Admin geral, RH/DP |
| `contratual`, `geral`, `sst` | Todos os perfis internos com `documentos:ver` |

O **próprio funcionário** sempre vê os documentos dele, inclusive das categorias
restritas. Restrição é sobre terceiros, não sobre o titular do dado.

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

## Checklist para validar com o gestor antes de codar a Fase 2

- [ ] A lista de subperfis internos está completa? Falta algum (ex.: jurídico)?
- [ ] Fiscal do contrato pode abrir solicitação de substituição, ou só registrar ocorrência?
- [ ] Contratante pode ver o espelho de ponto individual ou só a frequência consolidada?
- [ ] Quem aprova férias: RH, coordenação, ou depende do contrato?
- [ ] Qual o SLA por tipo de solicitação?
- [ ] Prazo de guarda por categoria de documento (meses)?
- [ ] O funcionário desligado mantém acesso por quanto tempo? (sugestão: 90 dias, só leitura)
