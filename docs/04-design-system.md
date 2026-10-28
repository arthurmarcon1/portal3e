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

Sistema de registro corporativo, com superfície. A informação continua em primeiro
plano — legível, sóbria, previsível —, mas a tela se organiza em blocos brancos sobre um
fundo levemente cinza, com respiro entre eles: a pessoa enxerga de relance onde começa e
onde termina cada coisa.

**Revisão de 2026-10-27** (pedido da gestão, aprovado pelo Arthur). A versão anterior
tinha como referência "o extrato do banco" e proibia sombra em card; na prática a tela
ficou chapada, sem hierarquia de superfície. Mudaram: o fundo da página (cinza, não mais
branco), a sombra do card (agora permitida, junto da borda), o respiro e a navegação da
equipe (barra lateral). O que **não** mudou está em "O que ficou de propósito", logo
abaixo das regras.

### Tokens

```css
/* superfícies */
--fundo:            #FFFFFF;   /* card, tabela, navegação, modal, campo */
--fundo-alt:        #F6F7F8;   /* cabeçalho de tabela e faixas DENTRO de uma superfície */
--fundo-pagina:     #F4F5F7;   /* atrás das superfícies, nas três áreas */
--fundo-pagina-funcionario: var(--fundo-pagina);  /* ver "Área do funcionário" */
--fundo-hover:      #EEF0F2;   /* hover de linha e de item de navegação */

/* contorno */
--borda:            #DDE1E6;   /* divisória e contorno de superfície */
--borda-campo:      #7E8792;   /* input, select, textarea, checkbox — 3:1 */

/* texto e ação */
--texto:            #1A1D21;
--texto-suave:      #5B6570;
--acao:             #14532D;   /* verde institucional 3e — botão primário, links */
--acao-hover:       #0F3D22;
--acao-suave:       #E8F0EB;   /* item de navegação ativo */
--alerta:           #B45309;   /* pendência, prazo vencendo */
--erro:             #B42318;
--sucesso:          #15803D;

/* profundidade: duas sombras e só duas */
--sombra-card:      0 1px 2px rgb(16 24 40 / .06);   /* card, sempre com borda */
--sombra-elevada:   0 4px 12px rgb(16 24 40 / .08);  /* dropdown, popover, modal */
```

Contraste conferido (WCAG):

| Par | Contraste |
|---|---|
| `--texto` sobre `--fundo-pagina` | 15.5:1 |
| `--texto-suave` sobre `--fundo` / `--fundo-pagina` / `--fundo-hover` | 5.93 / 5.44 / 5.19:1 |
| `--acao` sobre `--fundo` / `--fundo-pagina` / `--acao-suave` | 9.11 / 8.35 / 7.85:1 |
| `--alerta` e `--sucesso` sobre `--fundo` | 5.02:1 |
| `--alerta` e `--sucesso` sobre `--fundo-pagina` | 4.6:1 — no limite |
| `--borda-campo` sobre `--fundo` / `--fundo-pagina` | 3.64 / 3.34:1 |

Consequência do 4.6:1: **texto em cor de status não fica solto no fundo da página**. Ele
vai dentro de uma superfície, ou no badge, que tem fundo branco próprio. Antes de
2026-10-27 a borda de campo usava `--borda` (1.3:1), abaixo do piso de 3:1 desta própria
página; `--borda-campo` corrige isso.

Ajustar `--acao` ao verde exato da marca 3e assim que o manual chegar. Cor só carrega
significado junto com texto ou ícone — nunca sozinha (daltonismo e impressão em P&B).

### Superfície e respiro

- **Superfície** é a classe `superficie` (`src/app/globals.css`): fundo branco, borda
  `--borda`, raio 8px, `--sombra-card`. Card, tabela, lista, painel e formulário solto
  na página são superfícies. Borda e sombra andam juntas: a borda segura a forma onde a
  sombra some (impressão, tela ruim, luz forte).
- Superfície dentro de superfície não leva sombra: o que está dentro de um card é faixa
  (`--fundo-alt`) ou divisória, não outro card.
- Respiro na área interna e na do contratante: 32px de margem na página a partir de
  1024px (16px abaixo), 24px entre blocos, 20px dentro de card.
- A tabela padrão (`TabelaDados`) é uma superfície só: busca e filtros no topo, tabela,
  paginação no rodapé.

### Avatar

Iniciais em círculo ao lado do nome, em toda lista e ficha de pessoa da área interna
(Pessoas, ficha, Acessos, SST, pé da navegação). Componente
`src/components/avatar-pessoa.tsx`; regra em `src/lib/avatar.ts`, com teste.

- **Tamanhos:** 24 (navegação), 32 (lista), 64 (ficha).
- **Iniciais:** primeira letra do primeiro nome + primeira do último; partículas (da,
  de, do, das, dos, e) não contam; uma palavra só dá uma letra; acento fica.
- **Cor estável:** FNV-1a 32 bits do **id** da pessoa, módulo 8. Id, e não nome
  (homônimos teriam a mesma cor, e corrigir a grafia trocaria a cor), nem CPF (não vira
  insumo de nada no navegador). Usuário funcionário usa o id da pessoa, para ter a mesma
  cor em Acessos e em Pessoas.
- **Paleta** (`--avatar-N-fundo` / `--avatar-N-texto`): fundo claro, texto escuro do
  mesmo tom, todos acima de 6:1 — ardósia, azul, índigo, violeta, ameixa, petróleo,
  sépia, grafite. **Sem verde, âmbar e vermelho**: já significam ação, alerta e erro.
- **A cor não significa nada.** O avatar é `aria-hidden`; o nome está sempre escrito
  ao lado.
- **Sem avatar na área do funcionário**: quem já sabe quem é não ganha nada com as
  próprias iniciais, e o espaço no celular é disputado.
- **Só iniciais por enquanto.** Foto precisa de caminho próprio no Storage, decidido à
  parte (docs/06, "Foto de perfil exige caminho próprio").
- Listas cujo assunto é o pedido ou o documento (Solicitações, Documentos) não levam
  avatar.

**Hierarquia na lista de pessoas:** nome em 14px peso 500 na cor de texto (link de
verdade, sublinhado no hover e no foco), linha de apoio em 12px `--texto-suave`
(matrícula · CPF). Alocação também em duas linhas: contrato · unidade, e função embaixo,
com a situação da alocação escrita quando não é "Alocado".

### Tipografia

- **Inter** (variável), uma família só. Corporativo, alta legibilidade em tela pequena,
  numerais tabulares para as tabelas: `font-variant-numeric: tabular-nums`.
- Escala: 12 / 14 / 16 / 20 / 24 / 32. Corpo **16px na área do funcionário** (14 só na
  área interna, onde a densidade compensa).
- Sentence case em tudo. Sem ALL CAPS em rótulo.

### Regras rígidas

Estas existem porque o padrão gerado por ferramenta de IA é reconhecível e passa
impressão de protótipo. O Portal precisa parecer sistema corporativo confiável.

- `border-radius` máximo **8px**. Botão e input: 6px. Card: 8px. Nada arredondado além
  disso. **Exceção nomeada: o avatar**, que é círculo (ver "Avatar").
- **Sem glassmorphism**, sem `backdrop-blur`, sem transparência decorativa.
- **Duas sombras e só duas.** `--sombra-card` no card, sempre junto da borda;
  `--sombra-elevada` no que flutua (dropdown, popover, modal). Nenhuma outra, nenhuma
  maior, nenhuma colorida.
- **Sem gradiente** em fundo, botão ou card.
- **Sem barra de destaque colorida** na lateral ou no topo de card, nem em item de
  navegação ativo, e sem linha de acento embaixo de título.
- **Sem emoji** na interface.
- **Sem animação de entrada.** Transição só responde a ação do usuário (abrir, expandir,
  confirmar) e dura no máximo 150ms. Respeitar `prefers-reduced-motion`.
- Ícones: **lucide-react**, traço 1.5px, tamanho 16 ou 20. Sempre acompanhados de texto
  em ação destrutiva ou ambígua.

### O que ficou de propósito

A revisão de 2026-10-27 mexeu em superfície, sombra, respiro e navegação. Estas regras
foram reavaliadas e **mantidas de propósito** — não sobreviveram por esquecimento. Quem
quiser mudá-las precisa de um motivo novo, não do mesmo pedido de "mais moderno":

| Regra | Por que fica |
|---|---|
| Sem emoji | O Portal registra ciência com valor de prova. Emoji infantiliza o registro e muda de desenho entre celulares — o mesmo texto aparece diferente para quem confirma e para quem audita. |
| Sem gradiente decorativo | Gradiente não informa nada, piora a legibilidade do texto por cima e é a marca mais reconhecível de tela gerada por ferramenta. Profundidade vem de superfície e sombra sutil, não de cor. |
| Raio até 8px, avatar como única exceção | Cantos muito redondos são o sinal visual de "app de startup", que é o que a 3e não quer parecer para cliente de contrato público. O avatar é círculo porque rosto e iniciais em círculo são convenção — e por ser a única exceção, não abre precedente. |
| Contraste mínimo 4.5:1 | O funcionário lê na portaria, no sol, num celular antigo, às vezes com vista cansada. Abaixo disso o texto some — não é estética, é a pessoa não conseguir responder. |
| Alvo de toque de 44px | Mesmo público, com dedo e pressa. Botão menor vira toque errado, e toque errado numa ciência é registro errado. |
| Foco de teclado visível | A equipe interna trabalha o dia inteiro no teclado, e há quem dependa dele. Sem foco visível a tela fica inoperável para essas pessoas. |
| Nada que dependa só de cor | Daltonismo e impressão em preto e branco. Badge, item ativo, contador e avatar levam texto, peso ou forma além da cor. |

---

## Padrões de interface

**Status** — um badge com texto, fundo claro, borda fina, sem cor sólida:
`Pendente` (âmbar) · `Confirmado` (verde) · `Em divergência` (vermelho) ·
`Vencido` (vermelho) · `Arquivado` (cinza). Na área do funcionário o texto é outro, a cor é
a mesma: `Falta responder` · `Confirmado` · `Você apontou erro` · `Prazo passou` (ver
"Linguagem da área do funcionário").

**Tabela** — cabeçalho em `--fundo-alt`, linha com borda inferior de 1px, zebrado só
acima de 15 linhas. Coluna de ação sempre à direita. Paginação no rodapé, nunca scroll
infinito (o usuário precisa saber quantos itens existem). No celular, tabela vira lista
de cards.

**Estado vazio** — uma frase que diz o que aconteceu e o que fazer, em `--texto-suave`,
com a ação principal como botão. Sem ilustração.
Exemplo: *"Nenhum espelho publicado ainda. Os espelhos aparecem aqui depois do
fechamento mensal."*

**Erro** — diz o que houve e como resolver, na voz do sistema, sem pedir desculpa.
Nunca só o que falhou. *"Não conseguimos abrir o documento. Pode ser a internet. Toque em
Tentar de novo. Se continuar, faça um pedido de Dúvida."* Não mande a pessoa a um canal
que ela não tem: o funcionário não abre "chamado", ele faz um pedido.

**Confirmação destrutiva** — modal com o nome do item digitado ou botão nomeado pela
ação (`Desativar usuário`), nunca "OK/Cancelar".

**Botão** — o rótulo diz o que acontece: `Publicar documento`, `Abrir solicitação` e, na
área do funcionário, `Está tudo certo`. O toast repete o verbo: `Confirmação registrada`.
Um único botão primário por tela.

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
- **Número zerado não some** — no painel de início. Esta regra e a seguinte valem para
  os contadores do início, não para badge de item de menu (ver "Navegação da equipe").
  "0 solicitações vencidas" é informação; o bloco
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

### Navegação da equipe

Barra lateral fixa de 240px a partir de 1024px; abaixo disso, um botão "Menu" na barra
superior abre o mesmo conteúdo num painel (`src/components/nav-lateral.tsx`). Itens
agrupados por assunto — Início, **Dia a dia** (Solicitações, Documentos, Espelhos),
**Acompanhamento** (Relatórios, SST), **Cadastro** (Pessoas, Contratantes, Contratos,
Unidades), **Administração** (Acessos, Auditoria). Rótulo de grupo em 12px,
`--texto-suave`, sentence case. Item que o perfil não abre não aparece, e grupo vazio
some (filtro de tela; quem barra é `paginaProtegida`). Nome de quem entrou e Sair no pé
da barra.

Item ativo: fundo `--acao-suave`, texto `--acao`, peso 500 e `aria-current="page"` —
fundo e peso além da cor, sem barrinha lateral.

**Badge** (decisão do Arthur, 2026-10-27):

- **Informa e some no zero.** Badge "0" em todo item é ruído; o início continua
  mostrando os zeros.
- **Não é o contador do início.** O que leva ao recorte exato é o contador do início.
  Mas o item com badge **abre a tela num filtro onde os itens contados aparecem de
  primeira** — badge dizendo 2 e lista mostrando 47 sem destaque é pior que badge
  nenhum: Solicitações → `?responsavel=comigo`, Documentos → `?situacao=rascunho`, SST →
  `?situacao=vencido`. Com o badge em zero, o item abre a tela inteira.
- Mesmas consultas do início, com o client do usuário (a RLS decide o número). Neutro
  por padrão; `--alerta` só no que conta algo vencido. O número entra no nome acessível
  ("Solicitações, 2 em aberto com você").
- Badge é adorno: se a contagem falhar, o item aparece sem ele, e a navegação não cai.
- O layout persiste entre navegações, então o badge se atualiza ao recarregar ou quando
  uma Server Action chama `revalidatePath` — o que outra pessoa fez não aparece na hora.

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
│  │ 1 documento esperando │  │   ← card só aparece se houver
│  │ sua resposta          │  │
│  │ Espelho de ponto de   │  │
│  │ agosto de 2026        │  │
│  │ Responda até 10 de    │  │
│  │ setembro.             │  │
│  │ [ Abrir e responder ] │  │   ← nunca "Ver e confirmar": empurra a confirmar
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

0. **Uma linha antes do documento** dizendo o que fazer e o que acontece depois. No
   espelho: *"Confira os dias e os horários abaixo. Se estiver tudo certo, toque em Está
   tudo certo. Se algo estiver errado, toque em Tem algo errado e explique: o RH vai
   analisar."*
1. **O documento**, aberto e rolável na própria tela — não um link para download. A
   pessoa precisa ter lido para confirmar, e "abrir em outro app" é onde o fluxo morre.
2. **A pergunta**, direta. Espelho: *"Seus dias e horários deste mês estão certos?"*.
   Comunicado: *"Você leu este comunicado?"*.
3. **Duas ações de peso igual**. Espelho: `Está tudo certo` (primário) e `Tem algo
   errado` (secundário). Comunicado e norma: `Confirmar que li` e `Tem algo errado`.
   "Tem algo errado" abre um campo de explicação obrigatório com mínimo de caracteres, e
   opção de anexar foto. Confirmar pede um segundo toque, num diálogo que diz o que fica
   registrado e qual é a saída depois (*"Se achar um erro depois, faça um pedido de
   Correção de ponto"*).

**Por que "Está tudo certo", e não "Confirmar que recebi"** (decisão do Arthur,
2026-10-22): no espelho, confirmar grava que a pessoa **concorda com a jornada** — não só
que recebeu o arquivo. "Confirmar que recebi" diz menos do que o registro grava: quem
tocasse achando que só acusou recebimento ficaria registrado como de acordo com os
horários. O rótulo tem de dizer exatamente o que o registro vai provar. Pelo mesmo motivo
o comunicado usa "Confirmar que li", e não "recebi": o diálogo registra leitura.

Depois de responder: tela com o **número do comprovante**, data, hora e botão para baixar
o comprovante em PDF. O número aparece **grande** — é o que a pessoa vai fotografar para
guardar.

Nada de rolagem forçada, contagem regressiva ou checkbox "li e concordo" antes de
liberar o botão. Isso irrita e não agrega valor jurídico nenhum além do que o log já
registra.

---

## Linguagem da área do funcionário

Quem lê é auxiliar de limpeza, porteiro, vigia — gente que pode nunca ter usado um
portal. **Acolhedor não é colorido**: tudo o que está abaixo é texto, e as regras rígidas
de "Direção visual" continuam valendo inteiras.

Os textos moram em `src/features/funcionario/textos.ts`. Quem atende o funcionário ("o
RH da 3e") é **uma constante só** (`ATENDIMENTO`) — num cliente futuro quem atende pode
ser outro (docs/06).

### Vocabulário

O vocabulário de RH continua no banco, no código, na área da equipe e no comprovante em
PDF — que tem valor de prova e pode chegar a advogado, por isso segue com "Comprovante de
ciência" e "Protocolo", mais a linha *"Este é o comprovante da sua resposta no Portal
3e."*. Na tela do funcionário:

| Equipe e banco | Funcionário |
|---|---|
| Confirmar ciência (espelho) | Está tudo certo |
| Confirmar ciência (comunicado, norma) | Confirmar que li |
| Registrar divergência | Tem algo errado |
| Competência `08/2026` | agosto de 2026 (título: "Espelho de ponto de agosto de 2026") |
| Protocolo | Número do comprovante (documento) · Pedido nº (pedido) |
| Pendente · Vencido · Em divergência | Falta responder · Prazo passou · Você apontou erro |
| Solicitação, no feminino (Aberta, Aprovada…) | Pedido, no masculino: Enviado · O RH está vendo · Esperando você · Aprovado · Recusado · Concluído · Cancelado |
| Atualização cadastral · Suporte | Atualizar meus dados · Dúvida ou problema no Portal |
| Data `10/09/2026` | 10 de setembro (o ano só quando não é o corrente) |

Prazo vencido nunca tranca: *"O prazo era 10 de setembro. Você ainda pode responder."* — a
mesma frase no início e na tela do documento.

Contador de mínimo diz só o número (*"faltam 12"*), sem "letras" nem "caracteres": a
contagem inclui espaço e pontuação, e "12 letras" não bateria com o que a pessoa vê.

### Dizer o que vai acontecer

Antes de cada ação, uma linha dizendo o que ela faz e o que vem depois: na tela de
resposta, antes do documento; no formulário de erro, que o RH recebe e responde em Meus
pedidos; em Fazer um pedido; ao responder um pedido, que ele volta para o RH. No
**primeiro acesso** do funcionário, antes da senha: o que é o Portal, o que ele vai
encontrar ali, e que o ponto continua sendo batido como sempre — dito na afirmativa
(*"Você continua batendo o ponto como sempre. Aqui você só confere o resumo do mês."*):
a negativa deixa a dúvida de para que o Portal serve.

### Nunca sem saída

- Toda tela do funcionário termina com a linha de ajuda: *"Precisa de ajuda? Faça um
  pedido de Dúvida ou fale com o RH da 3e."* (vem do layout da área).
- "Portal 3e", no cabeçalho, leva ao início.
- Documento ou pedido que não existe: tela própria com "Voltar ao início"
  (`(funcionario)/not-found.tsx`); endereço que não existe: `app/not-found.tsx`. Nunca a
  página padrão do Next, em inglês.
- Erro inesperado: "Tentar de novo" e "Voltar ao início" (`(funcionario)/error.tsx`).
- Link de arquivo que falha (`/api/documentos/…/download`, `/api/ciencias/…/comprovante`,
  `/api/anexos/…`) abre uma página mínima com a mensagem e "Voltar ao Portal" — nunca texto
  puro numa aba.

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
