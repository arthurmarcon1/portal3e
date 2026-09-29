# 04 — Design system e UX

## Quem usa e onde

| Público | Dispositivo | Frequência | Consequência de projeto |
|---|---|---|---|
| Funcionário | Celular, muitas vezes conexão ruim, na portaria ou no ônibus | 1–3× por mês | Mobile first de verdade, poucas telas, texto grande, zero jargão |
| Contratante | Desktop, no escritório | Semanal | Tabela, filtro, exportação |
| Equipe 3e | Desktop, o dia inteiro | Diária | Densidade, atalho, ação em lote |

A área do funcionário é a que decide o sucesso do projeto. Se ele não conseguir dar
ciência no espelho sozinho, no celular, em menos de um minuto, o Portal não substitui
o WhatsApp e o projeto falha.

---

## Direção visual

Sistema de registro corporativo. A referência não é SaaS de startup — é o extrato do
banco: legível, sóbrio, previsível, com a informação em primeiro plano.

### Tokens

```css
--fundo:            #FFFFFF;
--fundo-alt:        #F6F7F8;   /* faixas, cabeçalho de tabela, cards */
--borda:            #DDE1E6;
--texto:            #1A1D21;
--texto-suave:      #5B6570;
--acao:             #14532D;   /* verde institucional 3e — botão primário, links */
--acao-hover:       #0F3D22;
--alerta:           #B45309;   /* pendência, prazo vencendo */
--erro:             #B42318;
--sucesso:          #15803D;
```

Ajustar `--acao` ao verde exato da marca 3e assim que o manual chegar. Cor só carrega
significado junto com texto ou ícone — nunca sozinha (daltonismo e impressão em P&B).

### Tipografia

- **Inter** (variável), uma família só. Corporativo, alta legibilidade em tela pequena,
  numerais tabulares para as tabelas: `font-variant-numeric: tabular-nums`.
- Escala: 12 / 14 / 16 / 20 / 24 / 32. Corpo **16px na área do funcionário** (14 só na
  área interna, onde a densidade compensa).
- Sentence case em tudo. Sem ALL CAPS em rótulo.

### Regras rígidas

Estas existem porque o padrão gerado por ferramenta de IA é reconhecível e passa
impressão de protótipo. O Portal precisa parecer sistema corporativo confiável.

- `border-radius` máximo **8px**. Botão e input: 6px. Card: 8px. Nada arredondado além disso.
- **Sem glassmorphism**, sem `backdrop-blur`, sem transparência decorativa.
- **Sem sombra pesada.** No máximo `0 1px 2px rgba(0,0,0,.06)` e só em dropdown, modal e popover. Card usa borda, não sombra.
- **Sem gradiente** em fundo, botão ou card.
- **Sem barra de destaque colorida** na lateral ou no topo de card, e sem linha de
  acento embaixo de título.
- **Sem emoji** na interface.
- **Sem animação de entrada.** Transição só responde a ação do usuário (abrir, expandir,
  confirmar) e dura no máximo 150ms. Respeitar `prefers-reduced-motion`.
- Ícones: **lucide-react**, traço 1.5px, tamanho 16 ou 20. Sempre acompanhados de texto
  em ação destrutiva ou ambígua.

---

## Padrões de interface

**Status** — um badge com texto, fundo claro, borda fina, sem cor sólida:
`Pendente` (âmbar) · `Confirmado` (verde) · `Em divergência` (vermelho) ·
`Vencido` (vermelho) · `Arquivado` (cinza).

**Tabela** — cabeçalho em `--fundo-alt`, linha com borda inferior de 1px, zebrado só
acima de 15 linhas. Coluna de ação sempre à direita. Paginação no rodapé, nunca scroll
infinito (o usuário precisa saber quantos itens existem). No celular, tabela vira lista
de cards.

**Estado vazio** — uma frase que diz o que aconteceu e o que fazer, em `--texto-suave`,
com a ação principal como botão. Sem ilustração.
Exemplo: *"Nenhum espelho publicado ainda. Os espelhos aparecem aqui depois do
fechamento mensal."*

**Erro** — diz o que houve e como resolver, na voz do sistema, sem pedir desculpa.
*"Não foi possível abrir o documento. Tente novamente em alguns minutos ou fale com o
RH pelo chamado."*

**Confirmação destrutiva** — modal com o nome do item digitado ou botão nomeado pela
ação (`Desativar usuário`), nunca "OK/Cancelar".

**Botão** — o rótulo diz o que acontece: `Confirmar ciência`, `Publicar documento`,
`Abrir solicitação`. O toast repete o verbo: `Ciência confirmada`. Um único botão
primário por tela.

---

## Página inicial de cada área

A tela de início não é estática: ela mostra **o que pede atenção**, dá **sensação de
progresso** e leva **rápido para onde a pessoa vai trabalhar**. Tudo dentro das regras
rígidas acima — nada aqui as relaxa.

- **Sem mecânica de jogo.** Nada de pontos, medalhas, ranking, sequência de dias ou
  mensagem de parabéns. Progresso é informação, não prêmio.
- **Progresso é barra sóbria mais número.** Trilho neutro com borda, preenchimento em
  `--texto-suave`, sem gradiente, sem cor forte, sem animação de entrada — e sempre o
  número escrito ao lado ("312 de 340 responderam · 92%"). A barra dá a proporção de
  relance; quem informa é o número. Componente: `src/components/barra-progresso.tsx`.
  Percentual arredonda para baixo: 100% só quando ninguém falta.
- **Número zerado não some.** "0 solicitações vencidas" é informação; o bloco
  desaparecido parece defeito. O que some é o bloco inteiro de um módulo que o perfil não
  tem.
- **Todo contador leva à tela correspondente já filtrada** no recorte que ele conta:
  "3 ciências vencidas" abre o relatório de pendências com `?situacao=vencidas`, não a
  tela genérica. O número do contador e o total da tela de destino são o mesmo — há teste
  de integração para isso.
- **Cor de alerta só em contador que pede ação e passou de zero**, e sempre com o rótulo.
- **Texto de tela nunca cita arquivo interno de desenvolvimento** (`docs/…`, fase do
  roadmap, número de migração). Quem lê é o usuário.

### A ciência nunca é incentivada

**O Portal nunca premia rapidez de confirmação** — nem com ponto, selo, ranking,
destaque, elogio ("Você está em dia!") ou comparação com colegas. Ciência é ato de
registro: o valor dela está em a pessoa ter lido e concordado, ou registrado
divergência. Incentivar a confirmar empurra a clicar sem ler, desestimula a divergência
e enfraquece o protocolo. O início do funcionário pode **informar** a situação ("12 de 14
documentos respondidos"); nunca premiar, apressar ou comparar.

### Início da equipe interna (`/admin`)

```
Bom dia, Arthur
Terça-feira, 29 de setembro · Nada aguardando você hoje.   ← só se tudo zerado

Sua fila
  Solicitações                      Ciência
  [ 2  em aberto com você   > ]     [ 41  ciências pendentes > ]
  [ 0  sem responsável      > ]     [  3  ciências vencidas  > ]
  [ 1  solicitação vencida  > ]
  Documentos                        SST
  [ 1  rascunho a publicar  > ]     [ 0 ASOs e treinamentos vencidos > ] ...

Ciência em andamento                          Ver todas as pendências
  Espelho de ponto — 08/2026      Espelho de ponto · prazo 10/09
  [██████████████████░░]  92%
  312 de 340 responderam · 28 pendentes

Atalhos
  [ Novo documento ] [ Publicar espelhos ] [ Caixa de solicitações ] ...
```

Cada bloco conforme o perfil (filtro de tela; quem barra é `paginaProtegida` no destino e
a RLS no número). "Ciência em andamento" agrupa os espelhos individuais de um fechamento
por tipo + título, e mostra cada comunicado coletivo sozinho — as quatro campanhas de
prazo mais próximo.

### Painel do contratante (`/cliente`)

Cada pendência de ciência do quadro leva a barra de progresso com "X de Y responderam" —
**responderam**, não "confirmaram": a contagem de `pendencias_de_ciencia_do_contratante`
inclui divergência. O dado continua vindo só das funções de banco de lista explícita
(invariante 10); a barra não pede campo novo.

## Área do funcionário — desenho

Menu inferior fixo, quatro itens, nada de menu hambúrguer:

```
┌─────────────────────────────┐
│  Portal 3e          [sair]  │
├─────────────────────────────┤
│  Olá, Maria                 │
│  12 de 14 documentos        │   ← situação: informa, não premia
│  respondidos                │
│                             │
│  ┌───────────────────────┐  │
│  │ 1 pendência           │  │   ← card só aparece se houver
│  │ Espelho de agosto     │  │
│  │ Confirmar até 10/09   │  │
│  │ [ Ver e confirmar ]   │  │
│  └───────────────────────┘  │
│                             │
│  ┌──────────┐ ┌──────────┐  │   ← atalhos grandes, depois
│  │ Fazer um │ │ Meus     │  │     da pendência
│  │ pedido   │ │ pedidos  │  │
│  │          │ │ 1 esper. │  │
│  └──────────┘ └──────────┘  │
│                             │
│  Sua alocação               │
│  Contrato 042 · Hospital X  │
│  Auxiliar de limpeza        │
│                             │
│  Últimos documentos         │
│  • Espelho jul/2026    ✓    │
│  • Comunicado de férias ✓   │
│                             │
├─────────────────────────────┤
│ Início  Docs  Pedidos  Perfil│
└─────────────────────────────┘
```

Princípio: **a pendência é a home.** Quem abre o Portal abre porque tem algo para
resolver. Se não tem pendência, a tela diz isso em uma linha e some do caminho.

A linha de situação logo abaixo da saudação é só o número ("12 de 14 documentos
respondidos") — sem "parabéns", sem "você está em dia", sem cor de sucesso (ver "A
ciência nunca é incentivada"). Os atalhos vêm **depois** das pendências, nunca antes:
"Meus pedidos" mostra quantos pedidos esperam resposta da pessoa, ou quantos estão em
andamento.

### Tela de ciência (a mais importante do produto)

Uma coluna, três blocos, nesta ordem:

1. **O documento**, aberto e rolável na própria tela — não um link para download. A
   pessoa precisa ter lido para confirmar, e "abrir em outro app" é onde o fluxo morre.
2. **A pergunta**, direta: *"Você confere as informações deste espelho?"*
3. **Duas ações de peso igual**: `Confirmar ciência` (primário) e `Registrar
   divergência` (secundário). Divergência abre um campo de justificativa obrigatório com
   mínimo de caracteres, e opção de anexar foto.

Depois de responder: tela de protocolo com número, data, hora e botão para baixar o
comprovante em PDF. O protocolo aparece **grande** — é o que a pessoa vai fotografar
para guardar.

Nada de rolagem forçada, contagem regressiva ou checkbox "li e concordo" antes de
liberar o botão. Isso irrita e não agrega valor jurídico nenhum além do que o log já
registra.

---

## Acessibilidade — piso não negociável

- Contraste mínimo 4.5:1 em texto, 3:1 em ícone e borda de input.
- Alvo de toque mínimo 44×44px na área do funcionário.
- Foco de teclado visível em tudo, nunca `outline: none` sem substituto.
- Todo input com `<label>` de verdade; placeholder não é rótulo.
- Erro de formulário anunciado com `aria-live` e ligado ao campo.
- Testar com zoom de 200% e com uma fonte de sistema aumentada.

O público inclui gente com baixa escolaridade digital e celular antigo. Isso não é
detalhe de acabamento: é requisito de funcionamento.
