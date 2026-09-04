# Portal 3e

Plataforma de gestão de funcionários terceirizados. Uso interno na 3e Gestão de
Pessoas primeiro; produto comercializável depois.

**Três públicos · quatro filtros de permissão · uma trilha de auditoria.**

## Como usar esta pasta

Coloque tudo na raiz do repositório novo. O Claude Code lê o `CLAUDE.md`
automaticamente em toda sessão; os `docs/` ele lê quando o prompt mandar.

```
CLAUDE.md                          contexto e regras permanentes do projeto
docs/01-blueprint-produto.md       escopo, públicos, módulos, fluxos críticos
docs/02-matriz-permissoes.md       quem pode o quê — fonte da verdade do acesso
docs/03-modelo-de-dados.md         por que o schema é assim; auth, storage, testes
docs/04-design-system.md           tokens, regras visuais e UX da tela de ciência
docs/05-roadmap-prompts.md         7 fases com prompt pronto e critério de aceite
docs/06-decisoes-pendentes.md      o que fechar com o gestor antes de cada fase
supabase/migrations/0001_init.sql  schema completo com RLS e funções de permissão
```

## Ordem de leitura

1. `docs/06` — leve para a próxima reunião com o gestor e feche as decisões da Fase 0–1.
2. `docs/01` e `docs/02` — valide o escopo e a matriz com RH, contratos e o cliente piloto.
3. `docs/05` — comece pela Fase 0, uma tarefa por sessão.

## Regras que não mudam

1. O Portal não bate ponto. Recebe o espelho mensal já fechado.
2. Estagiário está fora do escopo.
3. WhatsApp e e-mail avisam; o registro oficial é sempre dentro do Portal.
4. Dado sensível é bloqueado por padrão, e testado por persona antes de cada release.
5. Multiempresa desde a primeira migração.

## Estimativa

MVP em produção na 3e em **~8 semanas** de trabalho parcial. Caminho crítico: Fase 3
(documentos e ciência).
