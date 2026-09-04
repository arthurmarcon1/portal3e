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

## Área do funcionário — desenho

Menu inferior fixo, quatro itens, nada de menu hambúrguer:

```
┌─────────────────────────────┐
│  Portal 3e          [sair]  │
├─────────────────────────────┤
│  Olá, Maria                 │
│                             │
│  ┌───────────────────────┐  │
│  │ 1 pendência           │  │   ← card só aparece se houver
│  │ Espelho de agosto     │  │
│  │ Confirmar até 10/09   │  │
│  │ [ Ver e confirmar ]   │  │
│  └───────────────────────┘  │
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
