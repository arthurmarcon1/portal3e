# 01 — Blueprint do produto

## O problema

Hoje a relação com o funcionário terceirizado acontece em canais avulsos: WhatsApp,
e-mail, papel assinado na unidade, planilha de controle. Isso gera três custos:

1. **Sem prova.** Ninguém consegue mostrar, meses depois, que o funcionário recebeu e
   leu um comunicado, um espelho de ponto ou uma norma de segurança.
2. **Retrabalho.** RH e coordenação repetem a mesma informação dezenas de vezes.
3. **Risco de LGPD.** Documento com dado médico ou bancário circulando em grupo de
   mensagem, sem controle de quem viu.

## A solução

Um ambiente único onde cada pessoa entra, vê **só o que lhe compete**, resolve o que
precisa e deixa registro do que fez.

> Três públicos · quatro filtros de permissão · uma trilha de auditoria.

## Limites de escopo — decididos, não negociáveis

| Fica dentro | Fica fora |
|---|---|
| Cadastro e documentos do funcionário | Batida diária de ponto |
| Solicitações, comunicados e ciência | Ajuste e apuração de jornada |
| Gestão por contrato, unidade e perfil | Folha de pagamento (cálculo) |
| Espelho mensal **já fechado** | Gestão de estagiários (segue no site atual) |
| Relatórios, protocolos e auditoria | Recrutamento e seleção |

O PontoTel continua sendo o sistema oficial da jornada. O Portal recebe o resultado.

---

## Públicos

### 1. Funcionário terceirizado
Entra com **CPF + senha**. Vê apenas os próprios dados.

- Consultar perfil, contrato e unidade de alocação
- Baixar documentos e espelhos mensais
- Solicitar férias, afastamento, correção e suporte
- Enviar anexos, justificativas e registrar divergências
- Confirmar ciência e receber comprovante com protocolo
- Acessar comunicados, treinamentos e conteúdo de SST

Autenticação reforçada (código de uso único) quando o documento exigir.

### 2. Contratante (cliente)
Perfil vinculado a **contrato + unidade**. Acompanha a operação sem tocar em dado
sensível.

Subperfis: gestor do contrato · fiscal do contrato · gestor da unidade ·
administrativo/financeiro.

**Pode:** consultar o quadro por contrato/unidade, acompanhar frequência consolidada,
registrar ocorrências e solicitações, validar substituições e movimentações, acessar
documentos e relatórios contratuais.

**Nunca pode:** documento médico ou CID, dado bancário, informação pessoal sem
finalidade contratual, qualquer contrato ou unidade fora da sua autorização.

### 3. Equipe interna (3e)
Perfil por especialidade. Ninguém recebe acesso total automaticamente.

| Subperfil | Responsabilidade |
|---|---|
| Administrador geral | Usuários, permissões, parâmetros, auditoria |
| RH / DP | Cadastro, admissão, desligamento, férias, documentos |
| Contratos / Coordenação | Contratos, unidades, alocação, ocorrências, atendimento |
| Financeiro / Folha | Documentos de pagamento e benefícios (acesso restrito) |
| SST | Treinamentos, ASO, controles e documentos ocupacionais |
| Suporte / Auditoria | Chamados ou consulta somente leitura |

---

## A regra de acesso

```
PERFIL  ×  CONTRATO  ×  UNIDADE  ×  MÓDULO
   │          │           │          │
 quem é   a qual está   onde pode   o que pode
 o usuário  vinculado     atuar     ver/alterar
                    ↓
    visualização mínima  +  ação autorizada  +  registro em log
```

Exemplo: um fiscal enxerga somente funcionários e documentos do contrato/unidade
atribuídos, e não altera cadastro trabalhista.

A matriz completa está em `docs/02-matriz-permissoes.md`.

---

## Origem dos dados (quem alimenta o quê)

| Origem | Alimenta | Como |
|---|---|---|
| Equipe 3e | Contratos, cadastros, documentos, férias, SST, fluxos, comunicados | Telas do Portal + importação por planilha |
| Funcionário | Correções, anexos, justificativas, divergências, confirmações | Telas do Portal |
| Contratante | Ocorrências, solicitações contratuais, validações, ciência | Telas do Portal |
| PontoTel | Espelho mensal fechado | Fase 1: upload em lote (PDF). Fase 6: arquivo/API |

**Regra:** notificação por e-mail ou WhatsApp apenas avisa. O registro oficial acontece
dentro do Portal. Confirmação por WhatsApp não tem valor e não é aceita.

---

## Módulos

| # | Módulo | Escopo |
|---|---|---|
| 01 | Pessoas e contratos | Cadastro, admissão, alocação, movimentação, desligamento |
| 02 | Documentos | Modelos, versões, publicação, acesso, histórico |
| 03 | Jornada e ausências | Espelho mensal, férias, afastamentos, substituições |
| 04 | Solicitações | Fluxos com responsável, prazo, anexos e status |
| 05 | Comunicação e SST | Avisos, treinamentos, normas, conteúdo ocupacional |
| 06 | Gestão e controle | Relatórios, protocolos, permissões, logs, integrações |

---

## Fluxo crítico 1 — Espelho de ponto

```
1 PontoTel      registra a jornada diária          (fora do Portal)
2 Fechamento    3e confere e fecha o período       (fora do Portal)
3 Publicação    espelho entra no Portal            (upload em lote / integração)
4 Funcionário   consulta e confirma ou contesta    (no Portal)
5 Protocolo     evidência e histórico guardados    (no Portal)
```

Regras:
- O Portal **não** permite batida, ajuste ou apuração diária.
- Espelho só existe no Portal depois de fechado. Não há estado "em apuração".
- Contestação abre automaticamente uma solicitação do tipo `correcao_ponto`,
  com responsável e prazo.
- Retificação de espelho gera **nova versão** e **nova ciência**. A anterior é
  preservada e fica visível no histórico.

## Fluxo crítico 2 — Confirmação de ciência

```
1 Publicar     3e define público, versão e prazo
2 Notificar    mensagem avisa o usuário (e-mail/WhatsApp) — só um aviso
3 Autenticar   CPF + senha; código de uso único se o documento exigir
4 Ler          documento completo é aberto dentro do Portal
5 Responder    confirmar ciência OU registrar divergência com justificativa
6 Protocolar   data, hora, IP, user-agent, versão, hash e comprovante em PDF
```

Regras:
- Nova versão = nova confirmação. O histórico anterior nunca é apagado.
- Divergência não bloqueia o registro: ela **é** o registro, com outro tipo.
- O comprovante em PDF traz o protocolo e o hash SHA-256 do arquivo confirmado.
- O prazo de ciência gera lembrete automático e entra no relatório de pendências.

## Fluxo crítico 3 — Solicitação

```
Abertura → Em análise → (Pendente solicitante) → Aprovada/Recusada → Concluída
```

Toda solicitação tem: tipo, protocolo, solicitante, contrato/unidade, responsável,
prazo (SLA por tipo), anexos e uma linha do tempo imutável de eventos.
Quem abre pode ser o funcionário, o contratante ou a própria 3e.

---

## Segurança e privacidade — requisitos funcionais

Categorias de dado mais restritas: **médico/CID · bancário · folha e benefícios ·
documentos pessoais · credenciais e códigos**.

Controles obrigatórios, entregues junto com o produto e não depois:

1. Privilégio mínimo e bloqueio por padrão
2. Criptografia em trânsito e em repouso; senha com hash forte; código de uso único com validade
3. Registro de acessos, alterações e downloads
4. Prazo de guarda e descarte por categoria de documento
5. Segregação total entre contratos e unidades
6. Perfil de auditoria somente leitura
7. Segregação total entre empresas (multi-tenant) — cliente A nunca enxerga cliente B

LGPD: cada acesso precisa ter **finalidade, necessidade e rastreabilidade**.

---

## Métricas de sucesso do MVP

| Indicador | Meta na 1ª competência |
|---|---|
| Funcionários com primeiro acesso feito | ≥ 80% do quadro |
| Espelhos com ciência registrada em até 5 dias | ≥ 70% |
| Solicitações abertas pelo Portal (vs. WhatsApp) | ≥ 50% |
| Tempo médio de resposta a solicitação | ≤ 3 dias úteis |
| Documentos entregues sem prova de recebimento | 0 |

---

## Visão de comercialização

O Portal é multiempresa desde o schema. Vender para a próxima prestadora significa:
criar a organização, cadastrar contratos/unidades, importar o quadro e configurar os
perfis. Nenhum fork de código, nenhuma instância separada.

Fica como diferencial de venda: prova de ciência auditável, segregação por contrato e
o fato de não competir com o sistema de ponto que o cliente já usa.
