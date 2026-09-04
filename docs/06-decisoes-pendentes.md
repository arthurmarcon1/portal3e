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

## Trava a Fase 2 (decidir antes de codar acessos)

- [ ] **Subperfis internos definitivos.** A lista de seis está completa? Falta jurídico,
      comercial, qualidade?
- [ ] **Fiscal do contrato** pode abrir solicitação de substituição, ou apenas registrar
      ocorrência para a 3e tratar?
- [ ] **Contratante vê espelho individual?** Ou apenas frequência consolidada? Isso muda
      a policy de `documentos` e é o ponto mais sensível da matriz.
- [ ] **Funcionário desligado:** mantém acesso por quanto tempo, e a quê? (Sugestão: 90
      dias, somente leitura dos próprios documentos.)
- [ ] **Quem é o administrador geral** na 3e? Precisa ser mais de uma pessoa (nunca
      exatamente uma, por continuidade).

## Trava a Fase 3 (decidir antes de documentos)

- [ ] **Documentos do MVP.** Quais entram na primeira versão? Sugestão mínima:
      espelho de ponto, comunicado geral, norma interna. Holerite e ASO na Fase 4.
- [ ] **Prazo padrão de ciência** em dias corridos ou úteis, e qual valor.
- [ ] **Quais tipos exigem código de uso único.** Sugestão: folha, bancário e rescisão.
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

## Riscos mapeados

| Risco | Impacto | Como reduzir |
|---|---|---|
| Funcionário não adota e continua no WhatsApp | Mata o projeto | Piloto pequeno, senha entregue presencialmente, supervisor treinado como primeiro suporte, e a 3e parar de aceitar confirmação por WhatsApp naquele contrato |
| Escopo inflar com "só mais essa telinha" | Atrasa o MVP | Fases fechadas com critério de aceite; o que não está no blueprint vira Fase 5+ |
| PontoTel sem integração viável | Atrasa a Fase 4 | Publicação em lote resolve desde o dia 1; integração é otimização, não requisito |
| Vazamento de dado sensível | Grave, jurídico e comercial | Testes de RLS por persona no CI, bucket privado, log de download, revisão da matriz antes de cada release |
| Cadastro inicial sujo (CPF errado, pessoa desligada) | Trava o primeiro acesso | Validação na importação, relatório de inconsistências antes de publicar qualquer coisa |
| Você virar o único que sabe operar | Risco de continuidade | Dois administradores gerais, documentação nesta pasta sempre atualizada |
