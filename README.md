# UniFlow

MVP de um sistema pessoal de organizacao academica para acompanhar o semestre.

## Stack

- Next.js App Router + React + TypeScript
- Supabase Auth e Postgres com Row Level Security
- CSS global com componentes reutilizaveis leves
- `lucide-react` para icones

## Como executar

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

Sem variaveis do Supabase, o app entra em modo demo e usa dados mockados em `localStorage`. Isso existe apenas para desenvolvimento visual. Com Supabase configurado, os dados passam a vir do banco.

## Variaveis de ambiente

Crie um arquivo `.env.local` baseado em `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Supabase

1. Crie um projeto no Supabase.
2. Copie `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` para `.env.local`.
3. No SQL Editor, execute `supabase/schema.sql`.
4. Em Authentication, habilite email/senha.

Se voce ja executou o schema antigo do MVP, rode tambem:

```text
supabase/migrations/20260820_academic_structure.sql
supabase/migrations/20260820_order_tasks_materials.sql
supabase/migrations/20260820_task_progress.sql
```

A migration `20260820_order_tasks_materials.sql` tambem cria o bucket privado `subject-materials` no Supabase Storage e as policies para arquivos por usuario.

## Estrutura

- `src/app`: rotas do App Router.
- `src/components`: shell, providers, modais e componentes de UI.
- `src/lib`: Supabase, repositorio, datas, labels e logica de prioridade.
- `src/types`: tipos de dominio.
- `supabase/schema.sql`: modelo inicial do banco e politicas RLS.
- `supabase/migrations`: mudancas incrementais para bancos ja criados.

## Funcionalidades do MVP

- Autenticacao com Supabase Auth.
- Dashboard inicial com Hoje, Proximos prazos e Situacao das materias.
- CRUD de materias.
- CRUD de demandas, filtros e concluir demanda.
- CRUD de topicos por materia, com status e ordenacao simples.
- Avaliacoes separadas de notas obtidas, com vinculo a topicos cobrados.
- Ordenacao manual das materias na sidebar.
- Materiais por materia, com links e arquivos via Supabase Storage.
- Visao semanal simples.
- Pagina individual de materia com progresso, proxima avaliacao, conteudos, demandas e materiais futuros.
- Tela de notas com proximas avaliacoes, resultados e media parcial.

## Proximos passos

- Criar onboarding guiado para as 8 materias reais.
- Melhorar validacoes e mensagens de erro.
- Trocar o fallback demo por seed controlado em ambiente de desenvolvimento.
- Evoluir a logica centralizada em `src/lib/priority.ts` para prioridade automatica.
