# 06 — Decisões pendentes

A apresentação encerra pedindo três definições: **matriz de acessos**, **donos dos
dados** e **documentos/fluxos do MVP**. Esta é a lista completa, ordenada pelo momento
em que ela trava o desenvolvimento.

Formato de uso: leve para a reunião, decida, escreva a resposta aqui mesmo e marque a
caixa. O que estiver em branco vira pergunta do Claude Code no meio da tarefa — e aí
custa mais caro.

---

## Trava a Fase 0–1 (decidir esta semana)

- [ ] **Fonte do cadastro inicial.** De onde sai o quadro atual: planilha, sistema de
      folha, PontoTel? Quem entrega o arquivo e em que formato?
- [ ] **Matrícula.** Existe número de matrícula único hoje? Ele vem da folha? É estável
      quando a pessoa muda de contrato?
- [x] **Como o quadro interno da 3e entra no modelo** — decidido em 2026-09-30: opção
      (a), a 3e como contratante de si mesma. Ver "Decisões já tomadas".

- [ ] **Trilha de auditoria e o quadro interno** — da conferência do escopo
      (2026-09-30). Suporte/Auditoria não vê ninguém do quadro interno, mas a trilha de
      auditoria não tem escopo por desenho ("quem audita quem"): ele continua vendo os
      eventos da equipe interna — quem registrou ciência e de que tipo (inclusive
      divergência de espelho), quem baixou qual documento, com data e IP. Não vê o
      conteúdo do espelho nem a justificativa. Manter assim, ou a trilha passa a ter
      recorte? Decisão do Arthur.
      **Resolvidos da mesma conferência:** o SST sem o quadro interno (corrigido —
      ver "Decisões já tomadas") e o escopo vazio em produção (passo obrigatório em
      docs/08, 9.3). **Só registro:** o comunicado coletivo dirigido ao quadro interno
      é lido pelos três perfis restritos, pela regra de 2026-09-15 (escopo de interno
      não segrega aviso geral) — aviso não é ponto.

- [ ] **Onde o quadro real é importado pela primeira vez.** O critério de aceite da
      Fase 1 pede "o quadro real da 3e importado de planilha", e o CLAUDE.md proíbe
      dado real de funcionário no projeto Supabase atual — inclusive "para testar a
      importação da F1.3". Os dois não podem valer ao mesmo tempo.
      **Estado da implementação:** a F1.3 está pronta e provada com dado fictício
      (`src/features/pessoas/importacao.integracao.test.ts` cobre a atomicidade, a
      releitura do XLSX e o CSV em windows-1252). Falta só a carga real.
      Decidir: (a) antecipar a criação do projeto de produção para fechar a Fase 1 nele,
      (b) manter o item aberto até a F3, que é quando o projeto novo nasce de qualquer
      forma — sugestão, já que nada depois da F1.3 precisa do quadro real para ser
      construído. O que **não** é opção é importar o quadro no projeto de hoje.

- [ ] **`editar` sem `ver` não enxerga o que escreve — LATENTE, não corrigir sem caso
      real** (decisão de 2026-09-15). Da varredura da 0008. Em `alocacoes`, `usuarios`,
      `usuario_perfis` e `usuario_escopos` a `*_leitura` exige `ver` (ou
      `administracao:ver`), enquanto a escrita exige só `editar`. Um perfil com `editar`
      e sem `ver` no mesmo módulo escreveria e não leria — e criar alocação, usuário,
      perfil ou escopo cairia em 42501 no `INSERT ... RETURNING`, mesma família do
      rascunho (0010) e da estrutura comercial (0013).
      **Por que fica aberto:** a matriz de docs/02 sempre dá V junto com E, e nenhum
      perfil do seed é assim. Corrigir sem caso real é adivinhar qual das duas regras
      vale. Reabrir quando alguém propuser um perfil com E sem V — aí decidir entre
      (a) invariante explícita "toda ação forte pressupõe `ver` no mesmo módulo",
      validada na grade de perfis, ou (b) policies de leitura aceitando `editar`.

## Trava a Fase 2 (decidir antes de codar acessos)

- [ ] **Subperfis internos definitivos.** A lista de seis está completa? Falta jurídico,
      comercial, qualidade?
- [ ] **Fiscal do contrato** pode abrir solicitação de substituição, ou apenas registrar
      ocorrência para a 3e tratar? **Estado (F4.2):** segue o texto da F4.2 em docs/05
      ("contratante: abrir ocorrência e substituição no escopo dele") — todo perfil de
      contratante com `solicitacoes:criar`, o Fiscal incluído, abre os dois. Se a resposta
      for "fiscal só ocorrência", a matriz precisa de granularidade que hoje não tem
      (`solicitacoes:criar` não distingue tipo): é migração, não `insert`.
- [x] **Funcionário desligado** — **PROVISÓRIA (2026-09-28)**, ver "Decisões
      provisórias". Implementação adiada para a Fase 5.

## Trava a Fase 3 (decidir antes de documentos)

- [x] **Documentos do MVP** — **PROVISÓRIA (2026-09-28)**, ver "Decisões provisórias".
      Espelho, comunicado, norma interna; ASO só cadastrado. **Holerite fora do piloto**
      (decidido em 2026-09-30): o tipo segue cadastrado, mas não se publica.
- [x] **Prazo padrão de ciência** — **PROVISÓRIA (2026-09-28)**: 5 dias corridos,
      lembrete no 3º dia, padrão por tipo e editável na publicação.
- [x] **Quais tipos exigem código de uso único** — **PROVISÓRIA (2026-09-28)**: no MVP,
      só `holerite` (categoria `folha`). Com o holerite fora do piloto (2026-09-30), a
      F3.3 **deixou de ser bloqueante** — segue no roadmap.
- [x] **Categoria dos tipos de documento** — **PROVISÓRIA (2026-09-28)** para os 5 do
      MVP. `norma_interna` fica `geral`. `termo_rescisao` e `contrato_trabalho` **saíram
      do seed**: não estão no MVP, e a pergunta sobre a categoria deles (abaixo)
      volta a valer quando entrarem:
      | Tipo | Categoria sugerida | Consequência | Alternativa |
      |---|---|---|---|
      | `termo_rescisao` | `folha` | Admin, RH/DP e Financeiro veem; contratante não | `pessoal` tira o Financeiro |
      | `contrato_trabalho` | `pessoal` | só Admin e RH/DP; contratante não vê salário | `contratual` abriria para o contratante |
- [x] **`exige_ciencia` por tipo** — **PROVISÓRIA (2026-09-28)**: `true` em espelho,
      comunicado e norma interna; `false` em holerite. ASO segue `true` no seed, mas não
      tem tela até a Fase 5 — reconfirmar quando o módulo de SST chegar.
- [ ] **Prazo de guarda por categoria** (em meses), com o jurídico. **Valores
      provisórios por tipo** desde 2026-09-28: 60 meses nos 4 tipos do MVP e 240 no
      ASO. O jurídico ainda precisa fechar por categoria:
      contratual __ · pessoal __ · médico __ · folha __ · SST __ · geral __ · jornada __
- [ ] **O que fazer com quem não confirma** dentro do prazo. Cobra o supervisor?
      Escala para a coordenação? Gera relatório e para por aí?
- [ ] **Valor jurídico da ciência.** Conferir com o jurídico se protocolo + hash + log
      basta, ou se algum documento precisa de assinatura com certificado. Isso decide se
      a Fase 6 tem custo de certificadora.

## Trava a Fase 4

- [ ] **PontoTel tem API?** Se não, o R01 exportado serve como fonte? Quem exporta e quando?
- [ ] **Nomenclatura dos arquivos de espelho** que saem do fechamento (precisa conter
      CPF ou matrícula de forma previsível). **Estado (F4.1):** o casamento é uma
      expressão regular configurável por organização (`regras_espelho`, 0019), com a
      chave no 1º grupo e o campo CPF ou matrícula. Padrão provisório no seed: o CPF,
      com ou sem pontuação, em qualquer lugar do nome. Quando a regra real vier, é
      "Salvar como padrão" na tela — sem código.
- [x] **Quem publica espelho** — **decidido pelo Arthur em 2026-09-29: a matriz está
      certa, a prosa de docs/02 estava errada.** Publicação em lote é ato de DP
      (`jornada:criar`, Admin geral e RH/DP); a Coordenação trata contestação, que é outra
      coisa. Prosa de docs/02 corrigida; nenhuma permissão mudou.
- [ ] **Calendário de fechamento:** em que dia do mês o espelho fica pronto para publicar?
- [x] **SLA por tipo de solicitação** — **PROVISÓRIO, decidido pelo Arthur (não pelo
      gestor) em 2026-09-29**. Ver "Decisões provisórias".
- [ ] **Feriados no prazo das solicitações.** O prazo conta dias úteis como segunda a
      sexta (`app.somar_dias_uteis`, 0020); feriado nacional e municipal ainda não entra.
      Decidir a fonte do calendário (tabela por organização, com os municipais de cada
      unidade?) antes de o SLA virar indicador de desempenho.
- [ ] **Quem aprova férias** — RH, coordenação, ou varia por contrato? **Estado (F4.2,
      decisão do Arthur em 2026-09-29):** sem responsável automático; o pedido cai na
      caixa de entrada interna (`/admin/solicitacoes`) como "sem responsável", e quem tem
      `solicitacoes:editar` atribui. Quando decidir, o responsável padrão por tipo (ou por
      contrato) é configuração nova — não está implementada.
- [ ] **Fluxo da contestação de espelho:** quem trata, em quanto tempo, e o que acontece
      se procede (retifica no PontoTel e republica?).

- [ ] **E-mail de verdade ainda não foi enviado nenhuma vez.** A F4.3 está completa, mas
      `RESEND_API_KEY` está vazia: os avisos ficam `pendente` em `notificacoes`. Para
      ligar: domínio verificado no Resend, `RESEND_API_KEY`, `EMAIL_REMETENTE` com esse
      domínio, `NOTIFICACOES_EMAIL=ativo` e `CRON_SECRET`. O teste da F4.3 usa um
      transporte de teste no lugar do Resend — o caminho inteiro roda, menos a chamada ao
      provedor.
- [ ] **O cron é de hora em hora (`vercel.json`), e o plano Hobby da Vercel só roda cron
      diário.** No Hobby, lembrete e envio acontecem uma vez por dia. Decidir o plano (ou
      um agendador externo chamando o job com o `CRON_SECRET`) antes do piloto.
- [ ] **Funcionário sem `email_pessoal` só recebe o aviso no Portal** — e o seed, e
      provavelmente o quadro real, não têm esse campo. O canal definitivo de **senha e
      código** já é WhatsApp (decidido em 2026-09-30, Fase 6); falta decidir se o
      **aviso** de documento novo vai pelo mesmo canal quando ele existir, ou se o aviso
      do funcionário é a pendência na home. **Não há ainda tela que
      liste os avisos do Portal** (`canal = 'portal'`): a pendência de documento aparece
      na home e o pedido "aguardando você" em Meus pedidos, mas a lista de avisos em si é
      da Fase 5.
- [x] **Avisos acumulados: mais de 48 h na fila é descartado** — decidido pelo Arthur em
      2026-10-01. Ver "Decisões já tomadas".
- [x] **"Esqueci minha senha" sem e-mail ligado: a tela aponta os administradores do
      Portal** — decidido
      pelo Arthur em 2026-10-01. Ver "Decisões já tomadas".
- [x] **Janela de envio de e-mail: 8h às 20h de Brasília** — decisão minha na F4.3
      (2026-09-29), para aviso não chegar de madrugada. Fora da janela, fica pendente
      para a próxima rodada. Reverter é mudar `dentroDaJanela`.

## Fase 5 — o que ficou provisório

- [ ] **"Frequência consolidada do mês por unidade" (F5.1) não tem fonte no Portal.**
      Frequência de verdade (dias trabalhados, faltas, atrasos) está no espelho fechado,
      que chega como PDF, e no PontoTel (invariante 5: o Portal não apura jornada). O
      painel do contratante mostra, no lugar, a **situação do quadro por unidade hoje**
      (alocados, em atividade, férias, afastados), das alocações. Decidir com o gestor:
      isso basta, ou a frequência depende da integração com o PontoTel (Fase 6)? O
      espelho individual foi decidido em 2026-09-30 (o contratante lê o que o
      funcionário **confirmou**, 0027), mas a contagem de ciência do espelho segue fora
      de `pendencias_de_ciencia_do_contratante()`: ela mostraria quantos divergiram, e
      divergência não chega ao cliente. Ainda **não há tela** do contratante que liste
      espelho — quando vier, nasce de função com lista de colunas (invariante 10).
- [ ] **Validade de ASO e treinamento não tem duração no sistema (F5.2).** Quem publica
      informa a data que está no documento ("válido até"); o Portal não calcula 12 ou 24
      meses. A periodicidade do ASO depende do PCMSO e do risco da função, e a do
      treinamento, da NR — inventar um padrão erraria em silêncio. Se o gestor quiser
      sugestão automática, é `documento_tipos.validade_meses` como padrão editável, igual
      ao prazo de ciência.
- [ ] **Alerta de vencimento vai só para a equipe de SST** — decisão minha na F5.2
      (2026-09-30): quem tem `sst:editar` (hoje Admin geral e SST) e enxerga o documento
      (categoria e escopo). O funcionário não é avisado: renovar ASO e treinamento é
      providência da empresa. O e-mail não diz de quem nem de que tipo — leva ao painel.
      Decidir com o gestor se o funcionário e o contratante (treinamento, categoria `sst`)
      também devem receber.
- [ ] **Tipos de SST no seed são provisórios** (F5.2): `treinamento` (`sst`, ciência,
      vence por título) e `norma_sst` (`sst`, ciência, não vence). Divergência dos dois
      abre `outro`, como comunicado e norma. Retenção dos dois em aberto (jurídico). ASO
      segue **sem** mapeamento de divergência: quem trata divergência de ASO (SST? médico
      do trabalho?) é pergunta para o gestor.
- [ ] **"Competência" no relatório de ciências (F5.3)** é a do documento quando ele tem
      (`documentos.competencia`, o espelho) e, sem ela, o mês da resposta. Decisão minha;
      confirmar com o gestor se comunicado deveria contar pelo mês da publicação.
- [ ] **Relatório do contratante não existe.** A matriz dá `relatorios:R` a gestor do
      contrato, gestor da unidade e adm./financeiro do cliente, mas a F5.3 é
      `/admin/relatorios`. Quando vier, nasce das funções da 0023 (quadro e pendência
      agregada), nunca das consultas internas — mesma lição da 0020/0021.
- [x] **Ver relatório na tela** — **decidido pelo Arthur em 2026-09-30:** o de acessos e
      downloads é auditado também ao ser aberto (é o relatório que audita quem audita);
      os outros cinco, só ao exportar, como diz docs/05. Estender a outro é ligar
      `auditaVisualizacao` na definição dele.
- [ ] **"Desligado" não aparece para o contratante.** docs/02 lista "desligado" entre as
      situações visíveis, mas também bloqueia "qualquer pessoa sem alocação ativa". A F5.1
      seguiu o bloqueio (falha fechada): quem saiu some do quadro. Se o cliente precisar
      ver saídas do mês, é decisão de produto nova — e pede um recorte (só nome e data de
      saída?).

## Trava a Fase 6 / comercialização

- [ ] **Senha inicial e código de uso único por WhatsApp** — canal **decidido** como
      definitivo em 2026-09-30; a pendência é de execução, na Fase 6. Exige API oficial
      (WhatsApp Business Platform), **template aprovado** pela Meta para cada mensagem e
      **opt-in registrado** do funcionário antes do primeiro envio. Cobre senha inicial,
      recuperação de senha e o código da F3.3. Enquanto não existir, vale a entrega
      presencial (piloto interno). Muda o texto de docs/05, que dizia "só aviso, nunca
      conteúdo": credencial passa a sair pelo canal; conteúdo de documento, nunca.
- [ ] **Domínio e hospedagem.** Sugestão: `portal.3e.srv.br` ou domínio próprio do
      produto, se a intenção é vender como produto independente da marca 3e.
- [ ] **Nome comercial.** "Portal 3e" funciona internamente, mas não para vender a um
      concorrente da 3e. Definir cedo evita retrabalho de marca.
- [ ] **Modelo de cobrança** para outras empresas: por funcionário ativo/mês? por
      contrato? faixa fixa? (Coerente com a estrutura de preços que você já usa.)
- [ ] **LIMITAÇÃO CONHECIDA — SST vê todo tipo de solicitação da equipe interna**
      (aceita pelo Arthur em 2026-09-30, para rever quando houver cliente externo com
      equipe grande). A leitura de solicitação segue o escopo da **pessoa**, não o
      **tipo**: com o quadro interno no escopo (para ver ASO e treinamento), o SST lê
      também férias e atualização cadastral (telefone, endereço) dos colegas. Só
      afastamento é assunto dele. No piloto de 15 pessoas, separar visibilidade por tipo
      de solicitação é complexidade que não se justifica — **não foi mexido**. Quando
      voltar: é recorte por tipo na `solicitacoes_leitura` (e em anexos e linha do tempo,
      que herdam), não ajuste de escopo — e vale para qualquer perfil que precise do
      quadro por um motivo e não pelos outros.
- [ ] **O contratante "3e Gestão de Pessoas" é interno e NÃO entra em faturamento.**
      Ele existe só para alocar o quadro interno da 3e (decisão de 2026-09-30). Quando o
      modelo de cobrança vier (por funcionário ativo, por contrato…), esse contratante,
      o contrato "3e — Quadro interno" e as pessoas alocadas nele ficam **fora** da
      conta. Hoje nada no banco marca isso — é só o nome. Quando a cobrança for
      implementada, a exclusão precisa ser explícita (uma marca no contratante, por
      exemplo), não um filtro por nome.
- [ ] **Redefinir senha como ação isolada — evolução, NÃO implementar no piloto**
      (registrado pelo Arthur em 2026-10-01). Hoje gerar senha provisória é da tela de
      **Acessos** (`administracao:editar`), que também cria usuário e muda perfil e
      escopo de qualquer um — por isso não se dá ao RH/DP. Avaliar uma ação própria de
      "redefinir senha", concedível ao RH sem abrir Acessos inteira. Perguntas para
      quando voltar: vira ação nova na matriz ou permissão em outro módulo; o RH pode
      redefinir a senha de interno (inclusive de Admin geral) ou só de funcionário;
      respeita escopo. Só faz sentido com equipe maior — no piloto de 7 pessoas, os dois
      administradores dão conta.
- [ ] **Encarregado de dados (DPO)** e política de privacidade publicada — exigência de
      LGPD quando houver cliente externo.
- [ ] **Contrato de operador de dados** entre a prestadora e as contratantes.

---

## Decisões provisórias (registro)

Fechadas para destravar a Fase 3, **todas reversíveis**. Cada uma diz quem dá a
resposta definitiva e o que muda quando ela vier. Até lá, valem como decididas.

- **2026-09-28 — PROVISÓRIA — Tipos de documento do MVP** (`documento_tipos` no seed).
  | Tipo | Categoria | `exige_ciencia` | `exige_2fa` | `retencao_meses` | `prazo_ciencia_dias` | No MVP |
  |---|---|---|---|---|---|---|
  | `espelho_ponto` | `jornada` | sim | não | 60 | 5 | sim |
  | `comunicado` | `geral` | sim | não | 60 | 5 | sim |
  | `norma_interna` | `geral` | sim | não | 60 | 5 | sim |
  | `holerite` | `folha` | **não** | **sim** | 60 | — | **fora do piloto** (2026-09-30) — cadastrado, não publicado |
  | `aso` | `medico` | sim | não | 240 | 5 | sim desde a F5.2 — vence por pessoa |
  | `treinamento` | `sst` | sim | não | — | 5 | F5.2 — vence por título |
  | `norma_sst` | `sst` | sim | não | — | 5 | F5.2 |
  Holerite é recibo de pagamento, não documento de anuência: não pede ciência. Sendo
  `folha`, exige código de uso único — por isso a F3.3 tinha virado dependência da F3.1.
  **Desde 2026-09-30 o holerite está fora do piloto** e a F3.3 deixou de ser bloqueante
  (docs/05). Não publicar holerite antes da F3.3: sem ela, a rota de download devolve
  428 para todo tipo com `exige_2fa`, e o documento fica sem caminho de abertura.
  **Quem decide:** gestor da 3e (lista e ciência) e jurídico (retenção).
  **O que muda na resposta definitiva:** flags, categoria e retenção são `update` em
  `documento_tipos`, sem migração — mas documento já publicado não muda de prazo
  retroativamente. Tipo novo (ex.: `termo_rescisao`, `contrato_trabalho`, que saíram do
  seed) é `insert`, depois de decidida a categoria dele. A única mudança que seria
  migração é tirar o 2FA de `folha` como regra, e isso não está em discussão.

- **2026-09-28 — PROVISÓRIA — Prazo de ciência: 5 dias corridos da publicação,
  lembrete no 3º dia.** Padrão por tipo em `documento_tipos.prazo_ciencia_dias` (migração
  0014); a tela de publicação preenche `documentos.prazo_ciencia` com esse padrão e
  deixa editar. Tipo sem ciência não tem prazo. O lembrete é da F4.3 — com o prazo
  padrão, "3º dia" e "2 dias antes do prazo" (texto da F4.3 em docs/05) são o mesmo dia;
  quando o prazo for editado, vale **3º dia da publicação**, até decisão em contrário.
  **Quem decide:** gestor da 3e.
  **O que muda:** outro valor é `update` em `prazo_ciencia_dias`. Se o definitivo vier em
  **dias úteis**, é código (cálculo com calendário de feriados), não configuração.

- **2026-09-28 — PROVISÓRIA — NÃO IMPLEMENTADA — Funcionário desligado: 90 dias após o
  encerramento da alocação, somente leitura dos próprios documentos.** Pendência da
  **Fase 5**, não bloqueia nada da Fase 3. Envolve três peças que não existem: saber
  quando a última alocação encerrou, contar o prazo, e rebaixar o acesso (sem ciência
  nova, sem solicitação, só leitura dos individuais) e depois desativar o usuário.
  **Estado hoje:** nada rebaixa acesso. Enquanto o usuário estiver ativo, ele lê os
  próprios documentos individuais; coletivo já some quando a alocação encerra
  (`app.documento_alcanca_pessoa` ignora alocação `encerrada`).
  **Quem decide:** gestor da 3e, com o jurídico (acesso a holerite após desligamento).
  **O que muda:** o prazo vira parâmetro; o escopo do acesso define as policies.

- **2026-09-28 — PROVISÓRIA — Divergência abre solicitação, por tipo de documento.**
  Mapeamento em `documento_tipos.tipo_solicitacao_divergencia` (migração 0017) — dado,
  não `switch` no código:
  | Tipo de documento | Solicitação aberta pela divergência |
  |---|---|
  | `espelho_ponto` | `correcao_ponto` |
  | `comunicado`, `norma_interna` | `outro` |
  | `holerite` | — (não pede ciência) |
  | `aso` | — (sem mapeamento até ganhar tela, na Fase 5; a divergência fica só na ciência) |
  **Nunca `ocorrencia`:** em docs/02 ocorrência é o tipo que o contratante abre sobre a
  operação e cai na fila dele. Divergência de funcionário sobre um documento é outro
  assunto e outro responsável; misturar suja a fila do cliente.
  A solicitação nasce **sem responsável**, com a justificativa como descrição, na mesma
  transação da ciência (`public.registrar_ciencia`). Desde a 0020 nasce **com o prazo do
  SLA** do tipo (ex.: `correcao_ponto`, 3 dias úteis).
  **Quem decide:** gestor da 3e, junto com o SLA da Fase 4.
  **SLA:** decidido (provisório) em 2026-09-29 — a divergência já nasce com o prazo do
  tipo. Falta o responsável padrão, que segue em aberto. Quando holerite e ASO
  ganharem fluxo, é `update` no mapeamento; tipo novo de solicitação (ex.: uma
  "contestação de documento" própria, no lugar de `outro`) é migração de enum.

- **2026-09-29 — PROVISÓRIA (decidida pelo Arthur, não pelo gestor) — SLA por tipo de
  solicitação, em dias úteis.** Em `sla_solicitacoes` (0020), por organização:
  | Tipo | Dias úteis |
  |---|---|
  | `correcao_ponto` | 3 |
  | `ferias` | 5 |
  | `afastamento` | 2 |
  | `substituicao` | 2 |
  | `atualizacao_cadastral` | 5 |
  | `ocorrencia` | 3 |
  | `suporte`, `outro` | 3 |
  O banco calcula o prazo na abertura (hoje em Brasília + N dias úteis, segunda a sexta)
  e quem abre não escolhe. Vale também para a solicitação que a divergência de ciência
  abre — que até a 0020 nascia sem prazo.
  **Quem decide:** gestor da 3e.
  **O que muda:** outro valor é `update` em `sla_solicitacoes`, sem código; prazo de
  solicitação já aberta não muda retroativamente. Feriados e responsável padrão por tipo
  estão em aberto (Trava a Fase 4).

## Decisões já tomadas (registro)

- **2026-09-30 — Contratante vê o espelho individual depois que o funcionário confirma
  a ciência** (decisão do gestor; migração 0027). Era a leitura (a) da pendência "pode
  ver após aprovação". Exceção **por documento**, não liberação de categoria: `jornada`
  segue fora do teto do contratante em `app.categoria_permitida()`, e o ramo novo de
  `documentos_leitura` vale só para contratante, só para `espelho_ponto` individual e
  publicado, só para pessoa com alocação vigente no escopo, e só com ciência
  `confirmacao` **daquela versão**. **Divergência não libera:** o espelho divergido fica
  invisível; a retificação é versão nova e fica invisível até ser confirmada; a v1
  divergida vira `arquivado`, que o contratante nunca lê. Sem resposta, invisível — mesmo
  depois do prazo. A ciência em si continua ilegível ao contratante (`ciencias_leitura`
  não mudou). Coberto em `tests/rls/espelho-contratante.integracao.test.ts`, com a
  titular e o RH como contraponto de cada "invisível". Ainda não há tela do contratante
  que liste espelho (ver "Fase 5").

- **2026-09-30 — O piloto é com a equipe interna da 3e**, não com cliente externo
  (decisão do gestor). Substitui a pergunta "quantos contratos e unidades entram no
  piloto".
  **Revisto em 2026-10-01:** 7 funcionários internos, **nenhum contrato de cliente e
  nenhum usuário contratante**, e-mail desligado. Consequência (docs/08, 9.3): os
  acessos de Contratos, Financeiro e Suporte/Auditoria **não são criados** no piloto —
  sem contrato de cliente, o escopo deles ficaria vazio, que para interno é alcance
  total. O trabalho deles fica com o Admin geral. Existem só Admin geral, RH/DP, SST
  (escopo: o contrato interno) e os 7 funcionários. Também fica sem efeito, enquanto
  durar, o item "Trilha de auditoria e o quadro interno": não há Suporte/Auditoria.

- **2026-10-01 — Aviso de e-mail com mais de 48 h na fila é descartado, não enviado**
  (decisão do Arthur). Prazo de ciência que já venceu e publicação de semanas atrás não
  têm valor chegando atrasados, e a fila acumulada de uma vez pareceria spam — que é o
  que aconteceria ao ligar o e-mail depois de um piloto inteiro sem ele. Vale sempre, não
  só na ligação. A linha vira `descartada` (situação nova, migração 0028), distinta de
  `erro`: "decidimos não mandar" não é "não conseguimos". A idade conta de `criado_em`, e
  o descarte só acontece na rodada que enviaria (flag ligada, dentro da janela). Lembrete
  e vencido descartados não voltam: continuam ocupando o índice único da 0022.

- **2026-10-01 — "Esqueci minha senha" sem e-mail ligado: a tela não pede nada e diz que
  a senha é redefinida pelos administradores do Portal** (decisão do Arthur). Uma tela que pede o CPF e nunca
  entrega o código é pior que a função ausente: a pessoa espera um e-mail que não vem e
  conclui que o Portal quebrou. A regra é a mesma da fila de avisos (`emailAtivo()`: as
  três variáveis de e-mail); `pedirCodigo` recusa do mesmo jeito para quem chamar direto.
  Ligado o e-mail, volta ao fluxo do código sem mudança de código.
  **Sem setor nem pessoa no texto** (correção do Arthur no mesmo dia): a primeira versão
  dizia "fale com o RH", mas o RH/DP não gera senha — só quem tem `administracao:editar`
  (Admin geral) usa **Acessos**. No piloto os administradores são Arthur e Wesley; em
  outra prestadora serão outros, e a tela não promete quem.
  **O RH/DP não ganha `administracao`** para isso: na tela de Acessos se cria usuário e
  se muda perfil e escopo de qualquer um — privilégio demais por causa de senha. A
  alternativa fica como evolução (ver "Redefinir senha como ação isolada", em "Trava a
  Fase 6 / comercialização").

- **2026-09-30 — O quadro interno é alocado na 3e como contratante de si mesma**
  (decisão do Arthur, opção (a) da análise). Contratante **3e Gestão de Pessoas**,
  contrato **3e — Quadro interno**, unidade **Sede** — cadastro pela tela, sem migração;
  todo o caminho que já existe (coletivo por contrato, escopo, relatórios, lote de
  espelho) vale como está. A alternativa (b), alocação sem contratante, exigiria migrar
  `alocacoes` e toda função de escopo, coletivo e relatório. **Não entra em
  faturamento** — ver "Trava a Fase 6 / comercialização". Cadastrado no dev em
  2026-09-30; em produção, docs/08, passo 9.1.

- **2026-09-30 — Quem da equipe vê o espelho dos colegas: só Admin geral e RH/DP**
  (decisão do Arthur). Os dois ficam com alcance total. Contratos, Financeiro e
  Suporte/Auditoria têm escopo **restrito aos contratos de cliente, sem o contrato
  interno**. O SST tem os contratos de cliente **e** o interno (correção abaixo).
  **Motivo:** num quadro interno pequeno, ver o ponto de colegas e de superiores é
  diferente de ver o de um terceirizado alocado em cliente. Privilégio mínimo vale mais
  aqui, não menos. É a primeira vez que escopo limitado existe fora de teste. Regra e
  efeitos em docs/02, "Quadro interno da 3e"; está no seed desde 2026-09-30, então a
  suíte roda com ela.
  **Correção no mesmo dia — o SST volta a ver o quadro interno** (decisão do Arthur).
  Ele estava entre os restritos, mas o escopo corta a pessoa inteira, não só o ponto: o
  SST deixava de ver ASO e treinamento da equipe, e o alerta de vencimento de alguém da
  equipe ia só para o Admin geral (medido na conferência) — risco ocupacional. Com o
  contrato interno no escopo, o SST vê colega, ASO e treinamento; o espelho continua
  barrado pela categoria `jornada`, que o perfil dele não tem (medido depois da
  correção: alerta chega ao SST, espelho invisível). Efeito colateral **aceito com
  ressalva**: o SST também vê as solicitações da equipe interna — afastamento faz
  sentido (saúde ocupacional), férias e atualização cadastral não. Limitação conhecida,
  ver "Trava a Fase 6 / comercialização".

- **2026-09-30 — Teste só apaga o que ele próprio criou** (decisão do Arthur). Achado
  na conferência do escopo: o `afterAll` de `tests/rls/estrutura-comercial` apagava
  **todos** os escopos do Contratos e do RH/DP, inclusive quando o `beforeAll` tinha
  falhado — rodar a suíte no dev desfez em silêncio a configuração do piloto. Com
  `service_role`, nada no banco impede; contra produção, apagaria configuração real de
  acesso sem aviso. **Regra:** a limpeza apaga pelo id do que o teste criou, e tem de
  sobreviver a falha na preparação sem destruir estado alheio. Estado que o teste
  precisa mudar (escopo, permissão de perfil, regra de espelho) é lido inteiro antes e
  devolvido igual; se a leitura não aconteceu, a limpeza não toca nele. Escopo muda só
  por `trocarEscopo()` (`tests/rls/apoio.ts`). A varredura achou o mesmo defeito em mais
  oito arquivos, todos corrigidos:
  | Arquivo | O que apagava sem ter criado |
  |---|---|
  | `tests/rls/estrutura-comercial` | todos os escopos do Contratos e do RH/DP, mesmo com o `beforeAll` falho |
  | `tests/rls/documentos` | todos os escopos do RH/DP, mesmo com o `beforeAll` falho |
  | `features/pessoas/escopo` | todos os escopos do RH/DP — sem nem conferir se ele já tinha |
  | `features/relatorios` | todos os escopos do RH/DP |
  | `features/sst` | todos os escopos do SST (e falhava com o escopo do piloto) |
  | `features/acessos` | todas as permissões do perfil SST, sem repor nada se a leitura das originais falhasse |
  | `features/jornada/espelhos` | a regra de casamento de espelhos da organização, se a leitura da original falhasse |
  | `features/auth/bloqueio` | **toda** a trilha de login do Financeiro (login também grava `chave_login`), não só as falhas semeadas; e gravava `null` no `ultimo_acesso` se a leitura falhasse |
  | `features/contratante` | (estreitado) a permissão `administracao` do fiscal por módulo, e não pela linha que inseriu |
  O avesso também foi corrigido — o que os testes **criavam e não apagavam**: cada
  rodada deixava ~25 linhas em `auditoria` (o rastro das Server Actions, com o IP
  dublado do arquivo) e 4 avisos apontando para solicitação já apagada. Agora cada
  arquivo marca o maior id da auditoria no início e apaga, no fim, só o que veio depois
  com o IP de teste dele (`marcarAuditoria`/`apagarAuditoriaDoArquivo`, mesmo apoio).
  **Conferido em 2026-09-30:** fotografia do dev antes e depois de `npm test` inteiro
  (450/450) — escopos, perfis, permissões, categorias, usuários, estrutura, regra de
  espelho, tipos, SLA linha a linha, e a contagem de tudo o mais: **sem diferença**, e
  nenhuma linha de auditoria acima da marca.
  Risco que sobra: se o processo morrer **entre** a troca e a devolução, o escopo
  original fica fora do lugar — no local o `db reset` repõe; no dev, conferir
  `usuario_escopos` com o seed.

- **2026-09-30 — Quem é operador e também funcionário do quadro tem duas contas**
  (decisão do Arthur). O e-mail de operador (tipo `interno`) e o CPF de funcionário
  (tipo `funcionario`) são logins separados e assim devem permanecer: um login tem um
  tipo só (`usuarios.tipo`), e cada tipo entra na sua área. Nada a mudar no código. Instrução em docs/08, passo 9.3.

- **2026-09-30 — Administradores gerais: Arthur e Wesley** (decisão do gestor). Encerra
  a decisão provisória de 2026-09-28 ("só o Arthur") e o ponto único de falha que ela
  deixava. As duas contas nascem **em produção** (docs/08, passo 5), nunca no seed — que
  tem senha pública no repositório e continua com a persona fictícia
  `admin_geral@3e.com.br`, da qual a suíte depende.

- **2026-09-30 — Senha inicial e código de uso único: WhatsApp é o canal definitivo;
  no piloto interno, entrega presencial** (decisão do gestor). Encerra "Senha inicial" e
  "Canal da recuperação de senha do funcionário" (antes em "Trava a Fase 0–1"). O envio
  por WhatsApp é pendência da Fase 6 (ver lá). Até ela, a senha provisória é gerada pela
  tela de acessos e entregue em mãos, e a recuperação de quem não tem `email_pessoal` é
  presencial — a opção (c) que já valia na prática.

- **2026-09-30 — Holerite fora do piloto** (decisão do gestor). O tipo `holerite` segue
  cadastrado e a F3.3 segue no roadmap, mas deixou de ser bloqueante (docs/05). Não
  publicar holerite antes da F3.3 (ver a decisão provisória dos tipos, acima).

- **2026-09-30 — Todo o quadro do piloto tem celular com internet** (decisão do gestor).
  Encerra "Quem tem celular com internet" e remove o risco de precisar de totem ou ponto
  de acesso na unidade. Vale para o quadro do piloto; cliente externo, depois, pede a
  mesma pergunta de novo.

- **2026-09-29 — Contratante lê solicitação pelo contrato, nunca pela pessoa**
  (migração 0021). O teste da F4.2 mediu: o fiscal do 042 lia o pedido de férias da
  Maria e **baixava o atestado** do pedido de afastamento dela. `solicitacoes_leitura`
  (0001) liberava a terceiros as solicitações de toda pessoa do escopo — certo para o
  interno que trata o pedido, errado para o contratante, que via férias, afastamento
  (dado de saúde), correção de ponto e atualização cadastral (telefone, endereço). Agora
  contratante lê só pelo contrato (e unidade) do escopo; o pedido pessoal do funcionário
  nasce sem contrato e não chega a ele. Anexos e linha do tempo herdam.

- **2026-09-29 — Linha do tempo de solicitação à prova de falsificação** (migração
  0020). `eventos_insert` (0001) deixava qualquer um que visse a solicitação gravar
  qualquer evento — um funcionário forjava `mudanca_status` ou "nota interna". Agora só
  interno com `solicitacoes:editar` insere, e só comentário; status e atribuição vêm dos
  triggers; o solicitante responde por `public.responder_solicitacao`. UPDATE e DELETE
  revogados (42501). E `solicitacoes_update` passou a ser só de interno — contratante
  tinha `editar` e mudava status e responsável de solicitação do contrato dele.

- **2026-09-28 — Ciência só é gravada pelo servidor** (migração 0018). O IP e o
  user-agent da ciência eram informados por quem gravava: `ciencias_insert` (0001) e
  `registrar_ciencia` (0017) aceitavam os valores como vinham, e um funcionário com o
  próprio token gravava a ciência dele com IP escolhido. **Não é questão de peso
  jurídico: evidência que o próprio interessado escolhe não é evidência, e a ciência é
  o produto.** `authenticated` perdeu o `insert` em `ciencias` (REVOKE, como a
  `auditoria`) e a execução de `registrar_ciencia`, que virou SECURITY DEFINER só para
  `service_role`. O único caminho é a Server Action, que tira o usuário da sessão
  validada e o IP/user-agent do request. A função confere sozinha que o usuário é
  funcionário ativo e que o documento chega à pessoa dele. Coberto em
  `src/features/documentos/ciencia.integracao.test.ts` (insert direto e chamada direta
  → 42501; a action continua gravando, ignorando o que o navegador manda).

- **2026-09-28 — Confirmar ciência pede dois toques.** O botão da tela abre um diálogo
  ("Confirmar ciência?"), e só o segundo toque grava. Motivo: a ciência é imutável e tem
  valor de prova, e um toque acidental — no ônibus, com o celular no bolso — virando
  prova que ninguém desfaz é pior que os ~2 segundos a mais no teste cronometrado.
  Divergência não pede o segundo toque: escrever a justificativa já é o gesto deliberado.
  Não é o "li e concordo" que docs/04 proíbe — não bloqueia o botão nem força rolagem.

- **2026-09-28 — O titular lê o próprio documento arquivado** (migração 0016). Não era
  decisão, era bug da 0015: publicar uma retificação arquiva a v1, e `documentos_leitura`
  só liberava `publicado` — o funcionário que confirmou a v1 perdia o acesso ao que
  confirmou, e a ciência dele apontava para algo invisível. Na primeira retificação de
  espelho (rotina mensal) isso apagaria da vista de quem assinou a prova que o produto
  existe para guardar. A regra "o titular sempre vê o próprio documento, qualquer
  categoria" passou a valer para qualquer status já publicado (`publicado` e
  `arquivado`; rascunho nunca). No coletivo, onde não há titular, vale para quem
  **respondeu** o documento arquivado. Terceiros não mudam. Coberto em
  `src/features/documentos/publicacao.integracao.test.ts`.

- **2026-09-28 — Ciência respeita a categoria do documento** (migração 0016).
  `ciencias_leitura` pedia `documentos:ver` e escopo, mas não categoria: a
  justificativa de divergência num ASO — que pode conter informação de saúde — era
  legível para Suporte/Auditoria e Contratos, que não abrem o ASO. Vinha da 0001.
  Terceiro agora precisa de `app.categoria_permitida()` na categoria do documento,
  como na leitura do próprio documento. O titular lê a própria ciência sempre.

- **2026-09-28 — Descartar rascunho pede `documentos:editar`, não `excluir`.**
  Confirmado pelo gestor. Rascunho nunca alcançou ninguém: descartá-lo é parte de
  editar. `excluir` fica reservado para destruir registro **publicado** — o que o
  sistema não permite, de propósito (0015: publicado só vira arquivado; ciência e
  documento publicado são a prova). Registrado em docs/02.

- **2026-09-28 — Escrita em `documentos` passou a exigir categoria e escopo**
  (migração 0015, F3.1). Até a 0014, as policies de escrita pediam só
  `documentos:editar`: Contratos/Coordenação (categoria `jornada` apenas) conseguia
  **inserir** holerite, e interno com escopo no 042 criava documento individual para
  pessoa do 077 — só não lia de volta. Agora escrever pede o mesmo que ler rascunho.
  Nenhum perfil perdeu escrita que a matriz dá. Coberto por
  `src/features/documentos/publicacao.integracao.test.ts`.

- **2026-09-15 — Interno com escopo e `contratos:editar` enxerga e cadastra a estrutura
  comercial da organização inteira** (migração 0013). Era a perda (a) da varredura da
  0008: quem editava contratos com escopo não lia contrato/unidade/contratante fora dele
  e não conseguia **criar** nenhum dos três — 42501 no `INSERT ... RETURNING`, medido com
  Contratos/Coordenação e escopo no 042. Não era latente: a F2.1 já atribui escopo pela
  tela. A leitura volta exatamente para quem a 0008 tirou (interno + `contratos:editar`);
  interno com escopo e só `contratos:ver` segue vendo o escopo. Pessoas e documentos não
  mudam — quem edita contratos com escopo no 042 continua sem ver pessoa do 077. Coberto
  por `tests/rls/estrutura-comercial.integracao.test.ts`, pelas Server Actions reais.

- **2026-09-15 — Bloqueio de login: 5 falhas em 15 minutos, sem desbloqueio manual.**
  Desbloqueio manual viraria fila de chamado no RH por algo que se resolve esperando.
  Em troca, a tela de login mostra o horário em que libera e a contagem regressiva, e diz
  que a conta não foi desativada. Vale também para login por e-mail. Registrado em
  docs/02, "Bloqueio de login por tentativas".

- **2026-09-15 — Suporte/Auditoria não exporta a trilha.** Perfil de auditoria é leitura,
  e trilha exportada é cópia de dado sensível saindo do sistema. Só Admin geral exporta
  (`administracao:exportar`). Registrado em docs/02, "Auditoria: quem lê e quem exporta".

- **2026-09-15 — Interno com escopo lê comunicado coletivo de fora do escopo.** Escopo
  segrega pessoa e documento individual, não aviso geral. Para contratante vale o
  contrário (0012). Escrito como regra explícita em docs/02, "Escopo, documento
  coletivo e estrutura comercial", e travado por teste em `tests/rls/documentos.integracao.test.ts`.

- **2026-09-14 — Pessoa sem alocação é visível para quem tem `pessoas:editar`**,
  independentemente de escopo (migrações 0007 e 0009). Pessoa não alocada não pertence
  a contrato nenhum, logo não há o que segregar; e esconder de quem cadastrou o
  registro que ele acabou de criar é absurdo operacional. Assim que ganha alocação,
  vale a regra de escopo normal. Contratante não enxerga: a decisão fala em
  `pessoas:editar`, que nenhum perfil de contratante tem na matriz de docs/02, e a
  policy ainda exige `tipo = 'interno'` para que isso não dependa de um `insert` em
  `perfil_permissoes` amanhã. Coberto por `src/features/pessoas/escopo.integracao.test.ts`.

- **2026-09-14 — `for all` em policy de escrita foi banido** (migração 0008). Descoberto
  ao cobrir a decisão acima com teste: o `USING` de um `for all` vale para SELECT, e as
  15 policies `*_escrita` do schema estavam, sem que ninguém pedisse, concedendo leitura
  irrestrita a quem tivesse a permissão de editar. Medido: interno com escopo em um
  contrato enxergava 30 pessoas em vez de 14; `documentos:editar` daria acesso a
  documento `medico` e `bancario` de qualquer pessoa — invariante 4 furada no schema.
  Todas foram trocadas por `for insert` + `for update` + `for delete` com os mesmos
  predicados; nenhuma escrita mudou de comportamento.

- **2026-09-04 — Acesso por categoria de documento virou configurável.**
  A migração inicial inferia acesso a dado sensível a partir de permissões de módulo,
  usando `relatorios:exportar` como proxy de "é do Financeiro". Como os 6 perfis
  internos têm essa permissão na matriz de `docs/02`, na prática **todos** enxergavam
  `bancario` e `folha` — o oposto do documentado e uma quebra do invariante 4 do
  CLAUDE.md. Corrigido pela migração 0003, que cria `perfil_categorias` e reescreve
  `app.categoria_permitida()` para ler dessa tabela. Efeito prático: mudar quem vê
  holerite passa a ser `insert`, não deploy. O teto do contratante continua em código
  por ser invariante de produto.

- **2026-09-04 — Categoria `jornada` criada para espelho de ponto** (migração 0004).
  Espelho não é `folha`, não é `pessoal` e não é `geral`. Encaixá-lo em `folha` ou
  `pessoal` teria tirado o acesso de Contratos/Coordenação, que é justamente o time que
  lê espelho e trata contestação. *(Corrigido em 2026-09-29: o texto original dizia que a
  Coordenação "publica" espelho; publicar em lote é ato de DP — ver "Trava a Fase 4".)* O contratante lê só o espelho confirmado — ver a decisão de 2026-09-30.

- **2026-09-04 — Prazo de guarda continua indefinido.** `documento_tipos.retencao_meses`
  está `null` no seed de propósito, até o jurídico fechar os valores desta lista.
  *Superado em 2026-09-28 por valores provisórios — ver "Decisões provisórias".*

---

## Riscos mapeados

| Risco | Impacto | Como reduzir |
|---|---|---|
| Funcionário não adota e continua no WhatsApp | Mata o projeto | Piloto pequeno, senha entregue presencialmente, supervisor treinado como primeiro suporte, e a 3e parar de aceitar confirmação por WhatsApp naquele contrato |
| Escopo inflar com "só mais essa telinha" | Atrasa o MVP | Fases fechadas com critério de aceite; o que não está no blueprint vira Fase 5+ |
| PontoTel sem integração viável | Atrasa a Fase 4 | Publicação em lote resolve desde o dia 1; integração é otimização, não requisito |
| Vazamento de dado sensível | Grave, jurídico e comercial | Testes de RLS por persona no CI, bucket privado, log de download, revisão da matriz antes de cada release |
| Segregação herdada da entidade vizinha | Vazamento entre públicos — **materializado duas vezes na Fase 4** | Ver a nota abaixo da tabela |
| Cadastro inicial sujo (CPF errado, pessoa desligada) | Trava o primeiro acesso | Validação na importação, relatório de inconsistências antes de publicar qualquer coisa |
| Você virar o único que sabe operar | Risco de continuidade | Dois administradores gerais (Arthur e Wesley, decidido em 2026-09-30, criados em produção), documentação nesta pasta sempre atualizada |

**Segregação se desenha do zero para cada entidade escrita pelos três públicos.** Padrão
exposto pela Fase 4: quando uma entidade nova é escrita por funcionário, contratante e
equipe interna, a segregação dela não pode ser herdada da entidade vizinha — nem da policy
que já existia na migração inicial, nem da regra de outra tabela que "parece igual". As
duas falhas da fase foram desse tipo:

- **0020** — `solicitacao_eventos` herdava o "quem vê a solicitação pode escrever na linha
  do tempo": qualquer um que visse o pedido inseria evento de status falso ou "nota
  interna"; e o contratante podia dar `update` em solicitação.
- **0021** — `solicitacoes_leitura` herdava de `pessoas` a leitura pelo escopo da
  **pessoa**, certa para o interno e errada para o contratante: o fiscal do 042 lia o
  pedido de férias da Maria e baixava o atestado do afastamento dela.

Como aplicar: para cada entidade nova, escrever a matriz *público × comando × escopo*
(funcionário, contratante, interno × select, insert, update, delete × por pessoa, por
contrato, por unidade) antes da migração, e ter um teste por célula com contraponto. **A
Fase 5 mexe justamente na área do contratante** — toda consulta dela entra nessa conta.
