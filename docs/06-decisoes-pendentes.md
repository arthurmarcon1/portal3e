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

- [ ] **Escopo de interno restringe a estrutura comercial?** Achado na varredura que
      a 0008 exigiu. Antes dela, o `for all` da `*_escrita` dava leitura irrestrita, então
      um interno com escopo enxergava TODOS os contratos, unidades e contratantes da
      organização. Agora vale a `*_leitura`, que filtra por `app.contratos_permitidos()`
      — ou seja, passou a valer o escopo, o que provavelmente é o certo, mas é mudança
      de comportamento que ninguém decidiu.
      Duas consequências a decidir juntas: (a) interno com escopo no contrato 042 deixa
      de ver o contrato 077 nas telas de Contratos e Unidades; (b) ele não consegue
      **criar** contrato, unidade ou contratante, porque o registro novo nasce fora do
      escopo dele e o `INSERT ... RETURNING` não o enxerga de volta — mesmo ovo e galinha
      da 0005 e da 0007.
      **Hoje não aparece:** nenhum interno do seed tem escopo. Vira problema real quando
      a F2.1 passar a cadastrar interno com escopo — o que a tela já permite.
      Decidir: (a) escopo de interno não se aplica a `contratos`/`unidades`/`contratantes`,
      só a pessoas e documentos; (b) aplica-se, e quem cadastra estrutura comercial tem
      de ser interno sem escopo; ou (c) aplica-se, com o mesmo remendo da 0007 para o
      registro recém-criado. Não implementei nada: é regra de permissão.

- [ ] **`editar` sem `ver` deixou de enxergar.** Também da varredura da 0008. Em
      `alocacoes`, `usuarios`, `usuario_perfis` e `usuario_escopos` a `*_leitura` exige a
      ação `ver` (ou `administracao:ver`), enquanto a `*_escrita` exigia só `editar`. Um
      perfil com `editar` e sem `ver` agora escreve e não lê — inclusive falhando em
      `INSERT ... RETURNING`. Nenhum perfil do seed é assim, e a matriz de docs/02 sempre
      dá V junto com E, então é latente. Decidir se vira invariante explícita ("toda ação
      forte pressupõe `ver` no mesmo módulo") ou se as policies passam a aceitar `editar`
      como suficiente para ler.

## Trava a Fase 2 (decidir antes de codar acessos)

- [ ] **Subperfis internos definitivos.** A lista de seis está completa? Falta jurídico,
      comercial, qualidade?
- [ ] **Fiscal do contrato** pode abrir solicitação de substituição, ou apenas registrar
      ocorrência para a 3e tratar?
- [ ] **Contratante vê espelho individual?** Ou apenas frequência consolidada? Isso muda
      a policy de `documentos` e é o ponto mais sensível da matriz.
      **Estado atual da implementação: NÃO, por padrão.** O espelho ficou na categoria
      `jornada` (migração 0004) e o ramo `contratante` de `app.categoria_permitida()`
      libera apenas `geral`, `contratual` e `sst` — então a pergunta segue em aberto,
      mas em aberto pelo lado seguro. Responder **SIM** exige migração nova incluindo
      `jornada` naquela lista; é migração e não `insert` de propósito, porque mudar o
      teto do contratante é decisão de produto, não configuração de cliente.
- [ ] **Funcionário desligado:** mantém acesso por quanto tempo, e a quê? (Sugestão: 90
      dias, somente leitura dos próprios documentos.)
- [ ] **Quem é o administrador geral** na 3e? Precisa ser mais de uma pessoa (nunca
      exatamente uma, por continuidade).

## Trava a Fase 3 (decidir antes de documentos)

- [ ] **Documentos do MVP.** Quais entram na primeira versão? Sugestão mínima:
      espelho de ponto, comunicado geral, norma interna. Holerite e ASO na Fase 4.
- [ ] **Prazo padrão de ciência** em dias corridos ou úteis, e qual valor.
- [ ] **Quais tipos exigem código de uso único.** Sugestão: folha, bancário e rescisão.
      No seed, `exige_2fa = true` apenas em `holerite` e `termo_rescisao`.

- [ ] **Confirmar a categoria de 3 tipos de documento.** O seed precisou de um valor e
      eu escolhi pelo lado fechado, mas nenhum dos três está decidido em docs/02:
      | Tipo | Categoria no seed | Consequência | Alternativa |
      |---|---|---|---|
      | `termo_rescisao` | `folha` | Admin, RH/DP e Financeiro veem; contratante não | `pessoal` tira o Financeiro |
      | `contrato_trabalho` | `pessoal` | só Admin e RH/DP; contratante não vê salário | `contratual` abriria para o contratante |
      | `norma_interna` | `geral` | aberta a todo perfil com `documentos:ver` | `sst`, se norma for sempre de segurança |
      As duas primeiras importam: `contratual` e `geral` são visíveis ao contratante.
      Se qualquer uma estiver errada, é um `update` em `documento_tipos`, sem migração.

- [ ] **`exige_ciencia` por tipo.** O seed marcou `true` nos 7 tipos, por falta de
      definição em docs/02. Se ASO ou contrato de trabalho não devem gerar pendência
      de ciência, corrigir antes da Fase 3.
- [ ] **Prazo de guarda por categoria** (em meses), com o jurídico:
      contratual __ · pessoal __ · médico __ · folha __ · SST __ · geral __
- [ ] **O que fazer com quem não confirma** dentro do prazo. Cobra o supervisor?
      Escala para a coordenação? Gera relatório e para por aí?
- [ ] **Valor jurídico da ciência.** Conferir com o jurídico se protocolo + hash + log
      basta, ou se algum documento precisa de assinatura com certificado. Isso decide se
      a Fase 6 tem custo de certificadora.

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

## Decisões já tomadas (registro)

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
  contrário (0012). Escrito como regra explícita em docs/02, "Escopo e documento
  coletivo", e travado por teste em `tests/rls/documentos.integracao.test.ts`.

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

---

## Riscos mapeados

| Risco | Impacto | Como reduzir |
|---|---|---|
| Funcionário não adota e continua no WhatsApp | Mata o projeto | Piloto pequeno, senha entregue presencialmente, supervisor treinado como primeiro suporte, e a 3e parar de aceitar confirmação por WhatsApp naquele contrato |
| Escopo inflar com "só mais essa telinha" | Atrasa o MVP | Fases fechadas com critério de aceite; o que não está no blueprint vira Fase 5+ |
| PontoTel sem integração viável | Atrasa a Fase 4 | Publicação em lote resolve desde o dia 1; integração é otimização, não requisito |
| Vazamento de dado sensível | Grave, jurídico e comercial | Testes de RLS por persona no CI, bucket privado, log de download, revisão da matriz antes de cada release |
| Cadastro inicial sujo (CPF errado, pessoa desligada) | Trava o primeiro acesso | Validação na importação, relatório de inconsistências antes de publicar qualquer coisa |
| Você virar o único que sabe operar | Risco de continuidade | Dois administradores gerais, documentação nesta pasta sempre atualizada |
