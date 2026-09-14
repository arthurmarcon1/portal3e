# 05 — Roadmap e prompts de execução

Sete fases. Cada uma tem tarefas numeradas, um prompt pronto para colar no Claude Code
e um critério de aceite. **Não avance de fase com critério de aceite em aberto** — foi
assim que a apresentação definiu: "homologação acompanha todas as etapas".

Regra de sessão: **uma tarefa por sessão do Claude Code**. Cole o prompt, revise o que
ele diz que vai fazer, deixe executar, revise o diff, commit. Sessão nova para a
próxima tarefa.

---

## Fase 0 — Fundação (3–5 dias)

### F0.1 Bootstrap do projeto

```
Leia CLAUDE.md e docs/04-design-system.md.

Crie o projeto Next.js 16 com App Router, TypeScript strict, Tailwind e ESLint na raiz
do repositório. Configure:
- os tokens de cor e a escala tipográfica de docs/04 no bloco @theme de
  src/app/globals.css (Tailwind v4 não usa tailwind.config.ts)
- fonte Inter via next/font, com numerais tabulares habilitados por classe utilitária
- shadcn/ui inicializado, tema ajustado aos tokens (radius 6px, sem sombra pesada)
- src/lib/supabase/{server,browser,admin}.ts usando @supabase/ssr
- .env.example com todas as variáveis necessárias
- scripts npm: dev, build, lint, typecheck, test

Não crie nenhuma tela ainda além de um layout raiz vazio. Ao terminar, rode build e
lint e me diga o que ficou configurado.
```

### F0.2 Banco e seed

```
Aplique supabase/migrations/0001_init.sql no projeto Supabase local (supabase start).

Depois crie supabase/seed.sql com:
- 1 organização: 3e Gestão de Pessoas
- os 6 perfis internos e os 4 perfis de contratante de docs/02-matriz-permissoes.md,
  com perfil_permissoes exatamente conforme as tabelas daquele documento
- os tipos de documento: espelho_ponto, comunicado, norma_interna, aso, holerite,
  termo_rescisao, contrato_trabalho — com categoria, exige_ciencia e exige_2fa
  conforme docs/02
- 2 contratantes, 3 contratos, 5 unidades e 30 pessoas fictícias com alocações
- 1 usuário de cada tipo/subperfil para teste

Gere os tipos TypeScript com supabase gen types e salve em src/lib/supabase/types.ts.
Não invente permissão que não esteja na matriz — se faltar alguma, pergunte.
```

### F0.3 Autenticação

```
Leia a seção "Login por CPF" de docs/03-modelo-de-dados.md.

Implemente:
- /login com um campo "CPF ou e-mail" + senha, conforme a regra de e-mail sintético
- middleware que protege todas as rotas e redireciona por tipo de usuário:
  funcionario → /inicio, contratante → /cliente, interno → /admin
- /primeiro-acesso: troca obrigatória de senha quando precisa_trocar_senha = true
- /recuperar-senha com código de uso único
- logout
- src/lib/auth/sessao.ts: helpers getUsuario(), temPermissao(modulo, acao), exigirPermissao()
- src/lib/audit.ts com registrarAuditoria(), gravando login e falha de login

O helper temPermissao consulta o banco, não uma constante no código.
```

**Critério de aceite da Fase 0**
- [ ] `npm run build` e `npm run typecheck` limpos
- [ ] Login funciona com CPF e com e-mail
- [ ] Troca de senha obrigatória no primeiro acesso
- [ ] Redirecionamento correto por tipo de usuário
- [ ] Login e falha de login aparecem em `auditoria`
- [ ] Seed roda do zero em banco limpo

---

## Fase 1 — Cadastros (1–2 semanas)

### F1.1 CRUD de estrutura comercial

```
Implemente em /admin as telas de contratantes, contratos e unidades:
listagem com busca e filtro, criação, edição e desativação.

Padrões obrigatórios:
- toda mutação em Server Action: Zod → exigirPermissao → operação → registrarAuditoria
  → revalidatePath
- tabela com TanStack Table, paginação no rodapé, cabeçalho em --fundo-alt
- estado vazio com texto útil conforme docs/04
- erro devolvido como { ok: false, erro } e exibido em toast

Vincular unidades a contratos pela tabela contrato_unidades, com seleção múltipla.
```

### F1.2 Pessoas e alocações

```
Implemente /admin/pessoas: listagem com filtro por contrato, unidade, função e
situação; ficha da pessoa com abas Dados, Alocações, Documentos e Solicitações
(as duas últimas podem ficar como placeholder por enquanto).

Regras:
- CPF com máscara na exibição e somente dígitos no banco; validar dígito verificador
- criar alocação exige contrato + unidade + função + data de início
- encerrar alocação pede data de fim e não apaga o registro
- na ficha, o histórico de alocações aparece em ordem cronológica inversa
```

### F1.3 Importação por planilha

```
Implemente /admin/pessoas/importar: upload de XLSX/CSV com pré-visualização,
validação linha a linha e importação em lote.

- colunas: nome, cpf, matricula, funcao, contrato (número), unidade (nome),
  data_inicio, telefone
- a tela mostra, antes de importar: quantas linhas são válidas, quantas têm erro e
  qual o erro de cada uma
- CPF já existente vira atualização, não duplicata
- importação roda em transação; se qualquer linha crítica falhar, nada é gravado
- gera um registro em auditoria com o resumo (total, criados, atualizados, ignorados)
- disponibilize um modelo de planilha para download
```

**Critério de aceite da Fase 1**
- [ ] O quadro real da 3e importado de planilha, sem digitação manual
      — **não pode ser feito no projeto Supabase de hoje**, que é dev permanente e
      não recebe dado real (CLAUDE.md). A F1.3 está implementada e coberta por teste
      com dado fictício; este item só fecha no projeto de produção da F3. Ver
      `docs/06-decisoes-pendentes.md`.
- [ ] Testes de RLS da tabela em `docs/03` passando para os cenários de `pessoas`,
      `alocacoes`, `contratos` e `unidades`
- [ ] Contratante de teste enxerga só as pessoas do contrato dele
- [ ] Nenhuma tela de admin acessível por usuário do tipo funcionário

---

## Fase 2 — Perfis, permissões e auditoria (1 semana)

### F2.1 Administração de acesso

```
Implemente /admin/acessos:
- lista de usuários com tipo, perfis, escopo e situação
- criar usuário: para funcionário, busca a pessoa e gera o e-mail sintético +
  senha provisória; para contratante e interno, e-mail real
- editar perfis do usuário (multi-seleção) e escopos (contrato e/ou unidade)
- desativar usuário (nunca excluir)
- tela de perfis: visualizar e editar a matriz modulo × acao em grade de checkboxes

Toda alteração de perfil ou escopo grava em auditoria com o estado anterior e o novo,
em detalhes (jsonb).
```

### F2.2 Trilha de auditoria

```
Implemente /admin/auditoria: listagem com filtro por período, usuário, ação e
entidade; exportação em CSV.

Visível apenas para quem tem administracao:ver. A exportação também é auditada.
Sem paginação infinita: paginação numerada, limite de 100 por página.
```

### F2.3 Testes de RLS

```
Crie tests/rls/ com Vitest, cobrindo TODOS os cenários da tabela "Como testar a RLS"
em docs/03-modelo-de-dados.md.

Cada teste usa um client autenticado como a persona correspondente. É proibido usar
service_role dentro dos casos de teste — ela só pode aparecer no setup dos fixtures.
Adicione o comando ao script npm test e ao CI.
```

**Critério de aceite da Fase 2**
- [ ] Nenhuma regra de acesso hardcoded no código (busque por comparações de perfil literais)
- [ ] Todos os testes de RLS verdes
- [ ] Mudança de permissão visível na auditoria com antes e depois
- [ ] Matriz do seed idêntica à de `docs/02`

---

## Fase 3 — Documentos e ciência (2 semanas) — **coração do MVP**

### F3.1 Publicação de documentos

```
Implemente /admin/documentos:
- upload com seleção de tipo, título, escopo (individual ou coletivo) e prazo de ciência
- individual: escolher a pessoa. Coletivo: escolher destinatários por contrato,
  unidade e/ou função
- calcular sha256 do arquivo no servidor e gravar em arquivo_hash
- salvar como rascunho, pré-visualizar e só então publicar
- publicar dispara notificação e não pode ser desfeito (só arquivado)
- retificar documento publicado cria nova versão com substitui_id e exige nova ciência

Arquivos vão para o bucket privado 'documentos' no caminho definido em docs/03.
```

### F3.2 Download seguro

```
Implemente GET /api/documentos/[id]/download seguindo exatamente os 6 passos da seção
"Storage" de docs/03-modelo-de-dados.md.

A consulta ao documento usa o client do usuário — quem autoriza é a RLS, não um if.
Se o tipo exigir 2FA e a sessão não tiver verificação válida, retorne 428 e a UI
abre o modal de código.
```

### F3.3 Código de uso único

```
Implemente a verificação reforçada:
- POST /api/verificacao/enviar: gera código de 6 dígitos, guarda apenas o hash em
  codigos_verificacao, validade de 10 minutos, envia por e-mail (Resend)
- POST /api/verificacao/validar: máximo 5 tentativas, invalida após uso, marca a
  sessão como verificada por 15 minutos
- modal na UI, com reenvio após 60 segundos

Nunca logar o código. Nunca devolver o código na resposta, nem em ambiente de dev.
```

### F3.4 Tela de ciência

```
Leia a seção "Tela de ciência" de docs/04-design-system.md e implemente-a exatamente
como descrita, em /documentos/[id].

- documento renderizado inline (PDF via visualizador embutido), não link de download
- Confirmar ciência / Registrar divergência com peso visual igual
- divergência exige justificativa com no mínimo 20 caracteres e permite anexo
- ao responder: grava em ciencias com versão, hash, IP, user-agent e protocolo
- tela de protocolo com o número em destaque e comprovante em PDF
- divergência abre automaticamente uma solicitação vinculada ao documento

Mobile first. Teste em viewport de 360px de largura.
```

### F3.5 Comprovante em PDF

```
Implemente a geração do comprovante com @react-pdf/renderer:
protocolo, nome e CPF mascarado do funcionário, título e versão do documento,
hash sha256 do arquivo, tipo de resposta, justificativa se houver, data/hora com
fuso de Brasília, e o CNPJ da organização no rodapé.

Gerado sob demanda, não armazenado. Rota: GET /api/ciencias/[id]/comprovante.
```

**Critério de aceite da Fase 3**
- [ ] Publicar um comunicado para 30 pessoas e ver as 30 pendências aparecerem
- [ ] Funcionário confirma no celular em menos de 1 minuto, cronometrado
- [ ] Retificação gera versão 2 e nova pendência, com a versão 1 preservada
- [ ] Comprovante em PDF abre e o hash bate com o arquivo
- [ ] Download de documento sensível aparece na auditoria com IP
- [ ] Contratante não consegue abrir documento de categoria restrita — testado, não presumido

---

## Fase 4 — Espelho mensal e solicitações (2 semanas)

### F4.1 Publicação de espelhos em lote

```
Implemente /admin/jornada/publicar:
- upload de um ZIP ou de vários PDFs de espelho, mais a competência (mês/ano)
- casar cada arquivo com a pessoa por CPF ou matrícula presente no nome do arquivo,
  com regra de nomenclatura configurável e pré-visualização do casamento
- listar arquivos não casados para tratamento manual antes de publicar
- publicar cria um documento tipo espelho_ponto por pessoa, com competencia e prazo
- resumo pós-publicação: publicados, não casados, pessoas sem espelho

Reaproveite a lógica do splitter de contracheque que já existe no RPA: mesmo padrão de
separação por CPF. Se fizer sentido, extraia para um script Python em scripts/.
```

### F4.2 Solicitações

```
Implemente o módulo de solicitações nas três áreas:
- funcionário: abrir (férias, afastamento, correção de ponto, atualização cadastral,
  suporte), acompanhar e responder quando estiver pendente com ele
- contratante: abrir ocorrência e substituição no escopo dele, acompanhar
- interno: caixa de entrada com filtro por tipo, status, responsável e prazo;
  atribuir responsável, mudar status, comentar (com opção de nota interna) e concluir

Toda solicitação tem protocolo, SLA por tipo e linha do tempo imutável.
A mudança de status já é registrada pelo trigger — não duplique o evento no código.
```

### F4.3 Notificações

```
Implemente notificações por e-mail (Resend) para: documento publicado com prazo,
lembrete a 2 dias do prazo, prazo vencido, solicitação respondida, solicitação
concluída.

O e-mail avisa e leva ao Portal. Ele NUNCA contém o documento em anexo, dado sensível,
nem botão de confirmar. Template único, texto curto, um botão "Abrir no Portal".
Registre cada envio em notificacoes.
```

**Critério de aceite da Fase 4**
- [ ] Uma competência real publicada de ponta a ponta
- [ ] Contestação de espelho vira solicitação com responsável e prazo
- [ ] Lembrete de prazo disparando no horário certo
- [ ] Nenhum e-mail com dado pessoal além do primeiro nome

---

## Fase 5 — Portal do contratante, SST e relatórios (1–2 semanas)

### F5.1 Área do contratante

```
Implemente /cliente:
- painel: quadro alocado, pendências de ciência do contrato, solicitações abertas
- lista de pessoas do escopo, mostrando SOMENTE os campos permitidos em docs/02
  (nome, função, matrícula, unidade, situação, início) — CPF apenas com os 3 últimos dígitos
- frequência consolidada do mês por unidade
- abertura e acompanhamento de ocorrências

Se algum campo restrito aparecer em qualquer consulta desta área, é bug de segurança,
não de UI. Cubra com teste.
```

### F5.2 SST e comunicação

```
Implemente o módulo de SST reaproveitando documentos:
- publicação de norma, treinamento e ASO com o mesmo fluxo de ciência
- painel de conformidade: quem está com treinamento vencido ou ASO a vencer,
  por contrato e unidade
- alerta automático a 30 dias do vencimento
```

### F5.3 Relatórios

```
Implemente /admin/relatorios com exportação CSV e PDF:
1. Pendências de ciência por contrato/unidade/pessoa
2. Ciências registradas por competência, com protocolo
3. Solicitações por tipo, status e tempo de atendimento
4. Quadro alocado por contrato e unidade, com movimentações do período
5. Conformidade de SST
6. Acessos e downloads por usuário e período (só perfil de auditoria)

Toda exportação é auditada. Relatório respeita o escopo de quem exporta.
```

**Critério de aceite da Fase 5**
- [ ] Um cliente real usando a área dele sem treinamento presencial
- [ ] Relatório de pendências batendo com a contagem no banco
- [ ] Auditoria mostrando cada exportação

---

## Fase 6 — Integrações e escala comercial (contínua)

| Item | O que envolve |
|---|---|
| PontoTel | Confirmar se há API. Se não houver, automatizar a exportação R01 e publicar direto — o RPA em Python/Playwright já faz esse tipo de leitura hoje |
| WhatsApp | API oficial, template aprovado, opt-in registrado. Só aviso, nunca conteúdo |
| Assinatura eletrônica | Avaliar se a ciência com protocolo + hash já basta juridicamente antes de contratar certificadora |
| Onboarding de nova empresa | Assistente que cria organização, perfis padrão e importa o quadro |
| App / PWA | PWA instalável com notificação push resolve o caso do funcionário sem custo de loja |

---

## Cronograma realista

| Fase | Duração | Acumulado |
|---|---|---|
| 0 — Fundação | 1 semana | 1 |
| 1 — Cadastros | 2 semanas | 3 |
| 2 — Acessos | 1 semana | 4 |
| 3 — Documentos e ciência | 2 semanas | 6 |
| 4 — Espelho e solicitações | 2 semanas | 8 |
| **MVP em produção na 3e** | | **~8 semanas** |
| 5 — Cliente, SST, relatórios | 2 semanas | 10 |
| 6 — Integrações | contínua | |

Contando com você dedicando tempo parcial. O caminho crítico é a **Fase 3** — é ali que
o produto passa a valer alguma coisa. Se apertar o prazo, corte da Fase 5, nunca da 2
ou da 3.

---

## Como conduzir cada sessão

1. Abra o Claude Code na raiz do repo (ele lê o `CLAUDE.md` sozinho).
2. Cole o prompt da tarefa.
3. Leia o plano de 3 linhas que ele devolve. Se estiver errado, corrija **antes** de
   deixar codar. É o momento mais barato de corrigir.
4. Deixe executar. Revise o diff — principalmente migração e policy.
5. Rode o app e teste como as três personas.
6. Commit único com a mensagem no padrão.
7. Marque o item no critério de aceite.

Quando ele travar ou entregar algo torto: não discuta na mesma sessão. Feche, escreva
um prompt novo dizendo o que está errado e o que você espera. Sessão longa acumula
contexto ruim e ele passa a defender a própria solução em vez de consertá-la.
