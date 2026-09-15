# PROMPTS — execute na ordem

Arquivo operacional. Cole um bloco por sessão do Claude Code, na sequência.
A explicação de cada fase está em `docs/05-roadmap-prompts.md` — aqui só o que se cola.

**Ritual de cada sessão:**
1. `claude` na raiz do repo
2. cola o prompt
3. lê o plano de 3 linhas que ele devolve — se estiver errado, corrige **antes** de deixar codar
4. deixa executar, revisa o diff (principalmente migração e policy)
5. testa no navegador como as três personas
6. `git commit`
7. marca o `[ ]` aqui
8. `/exit` e sessão nova para o próximo

Sessão longa acumula contexto ruim e ele começa a defender a própria solução em vez de consertá-la.

---

# FASE 0 — Fundação

## [x] F0.1 — Configuração base

```
O projeto Next.js já está criado com create-next-app e o Supabase já está linkado.
Não rode create-next-app e não crie migração nova.

Leia CLAUDE.md e docs/04-design-system.md e configure apenas:
- os tokens de cor e a escala tipográfica de docs/04. Se o projeto estiver em
  Tailwind v4, use o bloco @theme em globals.css, não tailwind.config.ts
- fonte Inter via next/font, com uma classe utilitária para numerais tabulares
- shadcn/ui inicializado, tema ajustado aos tokens: radius 6px, sem sombra pesada,
  sem gradiente
- src/lib/supabase/server.ts, browser.ts e admin.ts usando @supabase/ssr
- .env.example com todas as variáveis necessárias, sem valores reais
- scripts npm: dev, build, lint, typecheck, test

Nenhuma tela ainda além do layout raiz. Ao terminar, rode build e lint e me diga
o que ficou configurado.
```

## [x] F0.2 — Seed do banco

> Antes deste: feche as decisões da seção "Trava a Fase 0–1" em `docs/06-decisoes-pendentes.md`.

```
A migração inicial já está aplicada no Supabase. Não a edite.

Crie supabase/seed.sql com:
- 1 organização: 3e Gestão de Pessoas
- os 6 perfis internos e os 4 perfis de contratante de docs/02-matriz-permissoes.md,
  com perfil_permissoes exatamente conforme as tabelas daquele documento
- os tipos de documento: espelho_ponto, comunicado, norma_interna, aso, holerite,
  termo_rescisao, contrato_trabalho — com categoria, exige_ciencia e exige_2fa
  conforme docs/02
- 2 contratantes, 3 contratos, 5 unidades e 30 pessoas fictícias com alocações
- 1 usuário de cada tipo e subperfil para teste

Depois gere os tipos TypeScript com supabase gen types e salve em
src/lib/supabase/types.ts.

Não invente permissão que não esteja na matriz. Se faltar alguma, pare e pergunte.
```

## [x] F0.3 — Autenticação

```
Leia a seção "Login por CPF" de docs/03-modelo-de-dados.md e implemente:

- /login com um campo "CPF ou e-mail" + senha, seguindo a regra de e-mail sintético
- middleware protegendo todas as rotas, redirecionando por tipo de usuário:
  funcionario → /inicio, contratante → /cliente, interno → /admin
- /primeiro-acesso: troca obrigatória de senha quando precisa_trocar_senha = true
- /recuperar-senha com código de uso único
- logout
- src/lib/auth/sessao.ts com getUsuario(), temPermissao(modulo, acao) e
  exigirPermissao()
- src/lib/audit.ts com registrarAuditoria(), já gravando login e falha de login

temPermissao consulta o banco, nunca uma constante no código.
```

**Aceite da Fase 0**
- [ ] `npm run build` e `npm run typecheck` limpos
- [ ] Login funciona com CPF e com e-mail
- [ ] Troca de senha obrigatória no primeiro acesso
- [ ] Redirecionamento correto por tipo de usuário
- [ ] Login e falha de login aparecem em `auditoria`
- [ ] Seed roda do zero em banco limpo

---

# FASE 1 — Cadastros

## [x] F1.1 — Contratantes, contratos e unidades

```
Implemente em /admin as telas de contratantes, contratos e unidades: listagem com
busca e filtro, criação, edição e desativação.

Padrões obrigatórios:
- toda mutação em Server Action: Zod → exigirPermissao → operação →
  registrarAuditoria → revalidatePath
- tabela com TanStack Table, paginação no rodapé, cabeçalho em --fundo-alt
- estado vazio com texto útil, conforme docs/04-design-system.md
- erro devolvido como { ok: false, erro } e exibido em toast

Vincular unidades a contratos pela tabela contrato_unidades, com seleção múltipla.
```

## [x] F1.2 — Pessoas e alocações

```
Implemente /admin/pessoas: listagem com filtro por contrato, unidade, função e
situação; ficha da pessoa com abas Dados, Alocações, Documentos e Solicitações
(as duas últimas ficam como placeholder por enquanto).

Regras:
- CPF com máscara na exibição e somente dígitos no banco; validar dígito verificador
- criar alocação exige contrato + unidade + função + data de início
- encerrar alocação pede data de fim e não apaga o registro
- histórico de alocações em ordem cronológica inversa na ficha
```

## [x] F1.3 — Importação por planilha

```
Implemente /admin/pessoas/importar: upload de XLSX/CSV com pré-visualização,
validação linha a linha e importação em lote.

- colunas: nome, cpf, matricula, funcao, contrato (número), unidade (nome),
  data_inicio, telefone
- antes de importar, a tela mostra quantas linhas são válidas, quantas têm erro e
  qual o erro de cada uma
- CPF já existente vira atualização, não duplicata
- importação em transação: se uma linha crítica falhar, nada é gravado
- gera registro em auditoria com o resumo (total, criados, atualizados, ignorados)
- disponibilize um modelo de planilha para download
```

**Aceite da Fase 1**
- [ ] Quadro real da 3e importado de planilha, sem digitação manual
- [ ] Contratante de teste enxerga só as pessoas do contrato dele
- [ ] Nenhuma tela de /admin acessível por usuário do tipo funcionário

---

# FASE 2 — Perfis, permissões e auditoria

## [x] F2.1 — Administração de acesso

```
Implemente /admin/acessos:
- lista de usuários com tipo, perfis, escopo e situação
- criar usuário: para funcionário, busca a pessoa e gera o e-mail sintético + senha
  provisória; para contratante e interno, e-mail real
- editar perfis do usuário (multi-seleção) e escopos (contrato e/ou unidade)
- desativar usuário (nunca excluir)
- tela de perfis: visualizar e editar a matriz modulo × acao em grade de checkboxes

Toda alteração de perfil ou escopo grava em auditoria com o estado anterior e o
novo, no campo detalhes (jsonb).
```

## [x] F2.2 — Trilha de auditoria

```
Implemente /admin/auditoria: listagem com filtro por período, usuário, ação e
entidade, mais exportação em CSV.

Visível apenas para quem tem administracao:ver. A exportação também é auditada.
Paginação numerada, limite de 100 por página. Sem scroll infinito.
```

## [ ] F2.3 — Testes de RLS

```
Crie tests/rls/ com Vitest cobrindo TODOS os cenários da tabela "Como testar a RLS"
em docs/03-modelo-de-dados.md.

Cada teste usa um client autenticado como a persona correspondente. É proibido usar
service_role dentro dos casos de teste — ela só pode aparecer no setup dos fixtures.
Adicione ao script npm test e ao CI.
```

**Aceite da Fase 2**
- [ ] Nenhuma regra de acesso hardcoded (busque comparações literais de perfil no código)
- [ ] Todos os testes de RLS verdes
- [ ] Mudança de permissão visível na auditoria com antes e depois
- [ ] Matriz do seed idêntica à de `docs/02`

---

# FASE 3 — Documentos e ciência (o coração do MVP)

> Antes desta fase: feche as decisões da seção "Trava a Fase 3" em `docs/06`.

## [ ] F3.1 — Publicação de documentos

```
Implemente /admin/documentos:
- upload com seleção de tipo, título, escopo (individual ou coletivo) e prazo de
  ciência
- individual: escolher a pessoa. Coletivo: escolher destinatários por contrato,
  unidade e/ou função
- calcular sha256 do arquivo no servidor e gravar em arquivo_hash
- salvar como rascunho, pré-visualizar e só então publicar
- publicar dispara notificação e não pode ser desfeito, apenas arquivado
- retificar documento publicado cria nova versão com substitui_id e exige nova ciência

Arquivos vão para o bucket privado 'documentos', no caminho definido em docs/03.
```

## [ ] F3.2 — Download seguro

```
Implemente GET /api/documentos/[id]/download seguindo exatamente os 6 passos da
seção "Storage" de docs/03-modelo-de-dados.md.

A consulta ao documento usa o client do usuário — quem autoriza é a RLS, não um if
no código. Se o tipo exigir 2FA e a sessão não tiver verificação válida, retorne 428
e a UI abre o modal de código.
```

## [ ] F3.3 — Código de uso único

```
Implemente a verificação reforçada:
- POST /api/verificacao/enviar: gera código de 6 dígitos, guarda apenas o hash em
  codigos_verificacao, validade de 10 minutos, envia por e-mail via Resend
- POST /api/verificacao/validar: máximo 5 tentativas, invalida após uso, marca a
  sessão como verificada por 15 minutos
- modal na UI, com reenvio liberado após 60 segundos

Nunca logar o código. Nunca devolvê-lo na resposta, nem em ambiente de dev.
```

## [ ] F3.4 — Tela de ciência

```
Leia a seção "Tela de ciência" de docs/04-design-system.md e implemente-a
exatamente como descrita, em /documentos/[id].

- documento renderizado inline (visualizador de PDF embutido), não link de download
- "Confirmar ciência" e "Registrar divergência" com peso visual igual
- divergência exige justificativa de no mínimo 20 caracteres e permite anexo
- ao responder, grava em ciencias com versão, hash, IP, user-agent e protocolo
- tela de protocolo com o número em destaque e comprovante em PDF
- divergência abre automaticamente uma solicitação vinculada ao documento

Mobile first. Teste em viewport de 360px de largura.
```

## [ ] F3.5 — Comprovante em PDF

```
Implemente a geração do comprovante com @react-pdf/renderer, contendo: protocolo,
nome e CPF mascarado do funcionário, título e versão do documento, hash sha256 do
arquivo, tipo de resposta, justificativa se houver, data e hora no fuso de Brasília,
e o CNPJ da organização no rodapé.

Gerado sob demanda, não armazenado. Rota: GET /api/ciencias/[id]/comprovante.
```

**Aceite da Fase 3**
- [ ] Publicar um comunicado para 30 pessoas e ver as 30 pendências aparecerem
- [ ] Funcionário confirma no celular em menos de 1 minuto — cronometrado de verdade
- [ ] Retificação gera versão 2 e nova pendência, com a versão 1 preservada
- [ ] Comprovante em PDF abre e o hash bate com o arquivo
- [ ] Download de documento sensível aparece na auditoria com IP
- [ ] Contratante não consegue abrir documento de categoria restrita — testado, não presumido

---

# FASE 4 — Espelho mensal e solicitações

## [ ] F4.1 — Publicação de espelhos em lote

```
Implemente /admin/jornada/publicar:
- upload de um ZIP ou de vários PDFs de espelho, mais a competência (mês/ano)
- casar cada arquivo com a pessoa por CPF ou matrícula presente no nome do arquivo,
  com regra de nomenclatura configurável e pré-visualização do casamento
- listar arquivos não casados para tratamento manual antes de publicar
- publicar cria um documento tipo espelho_ponto por pessoa, com competencia e prazo
- resumo pós-publicação: publicados, não casados, pessoas sem espelho

Se fizer sentido, extraia a separação dos PDFs para um script Python em scripts/ —
o padrão é o mesmo do splitter de contracheque que já existe no RPA.
```

## [ ] F4.2 — Solicitações

```
Implemente o módulo de solicitações nas três áreas:
- funcionário: abrir (férias, afastamento, correção de ponto, atualização cadastral,
  suporte), acompanhar e responder quando estiver pendente com ele
- contratante: abrir ocorrência e substituição dentro do escopo dele, e acompanhar
- interno: caixa de entrada com filtro por tipo, status, responsável e prazo;
  atribuir responsável, mudar status, comentar (com opção de nota interna), concluir

Toda solicitação tem protocolo, SLA por tipo e linha do tempo imutável.
A mudança de status já é registrada por trigger no banco — não duplique o evento
no código da aplicação.
```

## [ ] F4.3 — Notificações

```
Implemente notificações por e-mail via Resend para: documento publicado com prazo,
lembrete a 2 dias do prazo, prazo vencido, solicitação respondida e solicitação
concluída.

O e-mail avisa e leva ao Portal. NUNCA contém o documento em anexo, dado sensível
nem botão de confirmar. Template único, texto curto, um botão "Abrir no Portal".
Registre cada envio em notificacoes.
```

**Aceite da Fase 4**
- [ ] Uma competência real publicada de ponta a ponta
- [ ] Contestação de espelho vira solicitação com responsável e prazo
- [ ] Lembrete de prazo disparando no horário certo
- [ ] Nenhum e-mail com dado pessoal além do primeiro nome

---

# FASE 5 — Contratante, SST e relatórios

## [ ] F5.1 — Área do contratante

```
Implemente /cliente:
- painel: quadro alocado, pendências de ciência do contrato, solicitações abertas
- lista de pessoas do escopo mostrando SOMENTE os campos permitidos em docs/02
  (nome, função, matrícula, unidade, situação, início); CPF apenas com os 3
  últimos dígitos
- frequência consolidada do mês por unidade
- abertura e acompanhamento de ocorrências

Se algum campo restrito aparecer em qualquer consulta desta área, é bug de
segurança, não de UI. Cubra com teste.
```

## [ ] F5.2 — SST e comunicação

```
Implemente o módulo de SST reaproveitando a entidade documentos:
- publicação de norma, treinamento e ASO com o mesmo fluxo de ciência
- painel de conformidade: quem está com treinamento vencido ou ASO a vencer, por
  contrato e unidade
- alerta automático a 30 dias do vencimento
```

## [ ] F5.3 — Relatórios

```
Implemente /admin/relatorios com exportação em CSV e PDF:
1. Pendências de ciência por contrato, unidade e pessoa
2. Ciências registradas por competência, com protocolo
3. Solicitações por tipo, status e tempo de atendimento
4. Quadro alocado por contrato e unidade, com movimentações do período
5. Conformidade de SST
6. Acessos e downloads por usuário e período (só perfil de auditoria)

Toda exportação é auditada. Todo relatório respeita o escopo de quem exporta.
```

**Aceite da Fase 5**
- [ ] Um cliente real usando a área dele sem treinamento presencial
- [ ] Relatório de pendências batendo com a contagem no banco
- [ ] Auditoria mostrando cada exportação

---

# FASE 6 — Integrações (depois do MVP no ar)

## [ ] F6.1 — Publicação automática de espelhos

```
Automatize a etapa que hoje é manual em /admin/jornada/publicar: um script que lê a
exportação do PontoTel, separa os espelhos por pessoa e chama a rota de publicação
em lote.

Antes de codar, me pergunte qual é o formato do arquivo exportado e a regra de
nomenclatura. Não presuma.
```

## [ ] F6.2 — PWA

```
Transforme a área do funcionário em PWA instalável: manifest, ícones, service
worker com cache das telas de leitura e tela offline que explica o que está
indisponível.

Não faça cache de documento nem de dado pessoal. Notificação push fica para depois.
```

## [ ] F6.3 — Onboarding de nova empresa

```
Implemente um assistente em /admin/organizacoes/nova (visível só para super
administrador) que cria uma organização nova, gera os perfis padrão com a matriz
de docs/02 e os tipos de documento padrão, e abre a importação do quadro.

Este é o fluxo que permite vender o Portal para outra prestadora sem tocar em código.
```

---

# Prompts de apoio

## Retomar depois de um tempo parado

```
Leia CLAUDE.md e docs/05-roadmap-prompts.md. Rode git log --oneline -15, olhe o
estado do repo e me diga em até 10 linhas: em que fase estamos, o que já está
pronto e qual é a próxima tarefa. Não codifique nada ainda.
```

## Quando ele entregou algo torto

Feche a sessão e abra outra. Não discuta na mesma.

```
Na última sessão foi implementado [o quê]. Está errado em [o quê, específico].
O comportamento esperado é [o quê], conforme [qual doc, qual seção].

Investigue a causa antes de propor correção e me diga o que encontrou.
Não reescreva o que já funciona.
```

## Revisão de segurança antes de subir para produção

```
Faça uma revisão de segurança do projeto contra os 8 invariantes de CLAUDE.md e a
seção "Segurança e privacidade" de docs/01-blueprint-produto.md.

Procure especificamente por:
- tabela sem RLS habilitada ou sem policy
- uso de service_role fora de Server Action, route handler ou job
- consulta que filtra por org/contrato no código em vez de na policy
- acesso a arquivo sem passar pela rota de download auditada
- regra de permissão hardcoded
- campo restrito vazando na área do contratante

Liste os achados em ordem de gravidade. Não corrija nada ainda.
```

## Fechar a fase

```
Verifique os itens do critério de aceite da Fase [N] em docs/05-roadmap-prompts.md,
um por um, rodando o que der para rodar. Me diga quais passam, quais falham e o que
falta. Não conserte nada nesta sessão.
```
