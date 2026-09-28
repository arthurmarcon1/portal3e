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
- [ ] **Quantos contratos e unidades** entram no piloto. Sugestão forte: **um contrato
      só**, o de operação mais organizada, com o cliente mais parceiro.
- [ ] **Senha inicial:** como chega ao funcionário? (Sugestão: entregue pelo supervisor
      na unidade, contra assinatura de lista, junto com um cartão explicando o acesso.)
- [ ] **Quem tem celular com internet** no quadro alvo. Se a fatia for baixa, isso muda
      o projeto: precisa de totem na unidade ou acesso pelo supervisor.
- [ ] **Canal da recuperação de senha do funcionário.** docs/03 diz "código de uso único
      no telefone ou e-mail cadastrado", mas o Portal só tem e-mail (Resend) — e o
      e-mail sintético `<cpf>@func.<slug>.portal3e` não recebe nada.
      **Estado atual da implementação:** o código vai para `pessoas.email_pessoal`.
      Funcionário sem esse campo preenchido **não consegue se recuperar sozinho** — a
      tela manda procurar o RH ou o supervisor, que gera senha provisória nova.
      Decidir: (a) exigir e-mail pessoal no cadastro/importação da F1.3, (b) contratar
      canal de SMS/WhatsApp, ou (c) assumir que recuperação de funcionário é sempre
      presencial pelo supervisor. Enquanto não decidir, vale (c) na prática.

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
      ocorrência para a 3e tratar?
- [ ] **Contratante vê espelho individual?** Movida para "Trava a Fase 3" — é a
      única pendência daquela fase que ainda bloqueia funcionalidade. Ver lá.
- [x] **Funcionário desligado** — **PROVISÓRIA (2026-09-28)**, ver "Decisões
      provisórias". Implementação adiada para a Fase 5.
- [x] **Quem é o administrador geral** — **PROVISÓRIA (2026-09-28)**: só o Arthur, ver
      "Decisões provisórias". **Segundo nome obrigatório antes do piloto.**

## Trava a Fase 3 (decidir antes de documentos)

- [ ] **Contratante vê espelho individual? — ÚNICA PENDÊNCIA DA FASE 3 QUE AINDA
      BLOQUEIA FUNCIONALIDADE.** Quem decide: gestor da 3e.
      O gestor respondeu "pode ver após aprovação", sem dizer **aprovação de quem**.
      As duas leituras possíveis produzem policies diferentes:
      (a) após a **ciência confirmada do funcionário** — espelho contestado nunca chega
      ao cliente; (b) após o **fechamento pela 3e** — o cliente veria inclusive espelho
      que o funcionário contestou. A leitura errada expõe espelho contestado a um
      cliente, então nada foi implementado.
      **Estado atual, mantido de propósito:** `jornada` segue fora do teto do
      contratante em `app.categoria_permitida()` (só `geral`, `contratual`, `sst`), sem
      exceção condicional. Contratante não lê espelho nenhum.
      **Como será implementado quando vier a resposta:** como condição por documento na
      `documentos_leitura` — o espelho é legível ao contratante do escopo **se existir
      ciência do tipo `confirmacao`** para aquela versão (ou a condição equivalente
      da leitura escolhida). **Não** incluindo `jornada` na lista do contratante:
      isso liberaria a categoria inteira, contestado ou não. Migração nova, com teste
      de RLS dos dois lados (confirmado aparece; divergente e sem resposta, não).
- [x] **Documentos do MVP** — **PROVISÓRIA (2026-09-28)**, ver "Decisões provisórias".
      Espelho, comunicado, norma interna e holerite (só download); ASO só cadastrado.
- [x] **Prazo padrão de ciência** — **PROVISÓRIA (2026-09-28)**: 5 dias corridos,
      lembrete no 3º dia, padrão por tipo e editável na publicação.
- [x] **Quais tipos exigem código de uso único** — **PROVISÓRIA (2026-09-28)**: no MVP,
      só `holerite` (categoria `folha`). Isso fez da F3.3 dependência da F3.1.
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

- [ ] **Documento arquivado some para o próprio titular.** `documentos_leitura` só
      libera `publicado`, então a v1 de uma retificação — e qualquer documento
      arquivado — deixa de aparecer para o funcionário que deu ciência nela. O registro
      e a ciência ficam no banco, visíveis a quem edita. Achado na F3.1.
      Decidir antes da F3.4: o funcionário mantém acesso de leitura ao que ele já
      respondeu (histórico) ou só vê a versão vigente?
- [ ] **`ciencias_leitura` não olha categoria.** Interno com `documentos:ver` e escopo
      lê a ciência — inclusive a **justificativa de divergência** — de documento de
      categoria que ele não pode abrir (ex.: Suporte/Auditoria e ASO). Achado na F3.1,
      não corrigido nela (não é o escopo da tarefa). Proposta: a policy passa a exigir
      que o usuário leia o documento (`exists` em `documentos`), como o público-alvo
      (0012). Corrigir antes da F3.4, que é quando ciência passa a existir.
- [ ] **Descartar rascunho pede `documentos:editar`, não `excluir`** (F3.1, docs/02).
      Mantém o que a policy de exclusão já fazia desde a 0008. Confirmar com o gestor;
      se a resposta for `excluir`, só RH/DP perde o descarte (a matriz dá X só ao Admin).

## Trava a Fase 4

- [ ] **PontoTel tem API?** Se não, o R01 exportado serve como fonte? Quem exporta e quando?
- [ ] **Nomenclatura dos arquivos de espelho** que saem do fechamento (precisa conter
      CPF ou matrícula de forma previsível).
- [ ] **Calendário de fechamento:** em que dia do mês o espelho fica pronto para publicar?
- [ ] **SLA por tipo de solicitação** (dias úteis):
      férias __ · afastamento __ · correção de ponto __ · substituição __ · suporte __
- [ ] **Quem aprova férias** — RH, coordenação, ou varia por contrato?
- [ ] **Fluxo da contestação de espelho:** quem trata, em quanto tempo, e o que acontece
      se procede (retifica no PontoTel e republica?).

## Trava a Fase 6 / comercialização

- [ ] **Domínio e hospedagem.** Sugestão: `portal.3e.srv.br` ou domínio próprio do
      produto, se a intenção é vender como produto independente da marca 3e.
- [ ] **Nome comercial.** "Portal 3e" funciona internamente, mas não para vender a um
      concorrente da 3e. Definir cedo evita retrabalho de marca.
- [ ] **Modelo de cobrança** para outras empresas: por funcionário ativo/mês? por
      contrato? faixa fixa? (Coerente com a estrutura de preços que você já usa.)
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
  | `holerite` | `folha` | **não** | **sim** | 60 | — | só download |
  | `aso` | `medico` | sim | não | 240 | 5 | só o tipo, sem tela — Fase 5 (SST) |
  Holerite é recibo de pagamento, não documento de anuência: não pede ciência. Sendo
  `folha`, exige código de uso único — por isso **a F3.3 virou dependência da F3.1**,
  não mais opcional (docs/05).
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

- **2026-09-28 — PROVISÓRIA — Administrador geral: só o Arthur.** No seed, continua
  existindo **uma** persona `admin_geral` (`admin_geral@3e.com.br`, fictícia): a suíte
  depende dela, e credencial real não entra no seed — que tem senha pública no
  repositório. A conta real do Arthur nasce no projeto de produção, na F3.
  **Ponto único de falha:** hoje há uma pessoa só com acesso administrativo. Se ela
  estiver indisponível, ninguém muda permissão, escopo nem cria usuário interno.
  **Precisa de um segundo nome antes do piloto**, por continuidade (docs/02: "Nunca deve
  ser uma pessoa só").
  **Quem decide:** diretoria da 3e.
  **O que muda:** segunda conta com perfil `admin_geral` em produção, criada pela tela
  de acessos (F2.1) — sem código.

## Decisões já tomadas (registro)

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
  publica espelho e trata contestação. Ver a nota na pergunta sobre o contratante acima.

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
| Cadastro inicial sujo (CPF errado, pessoa desligada) | Trava o primeiro acesso | Validação na importação, relatório de inconsistências antes de publicar qualquer coisa |
| Você virar o único que sabe operar | Risco de continuidade — **materializado**: hoje há um administrador geral só (decisão provisória de 2026-09-28) | Segundo administrador geral **antes do piloto**, documentação nesta pasta sempre atualizada |
