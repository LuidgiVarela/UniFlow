import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod/v4";
import {
  buildReviewEntries,
  dueReason,
  reviewHref,
  reviewPriority,
  sortReviewEntries,
} from "@/lib/reviews";
import type {
  AppData,
  Assessment,
  AssessmentMaterial,
  AssessmentTopic,
  Demand,
  Material,
  ReviewDayPlan,
  ReviewEvent,
  ReviewQueueItem,
  Subject,
  SubjectClassProgress,
  Topic,
  TopicPrerequisite,
} from "@/types/domain";

type StudyData = Pick<AppData,
  | "subjects"
  | "demands"
  | "topics"
  | "assessments"
  | "assessmentTopics"
  | "assessmentMaterials"
  | "reviewEvents"
  | "reviewDayPlans"
  | "reviewQueueItems"
  | "topicPrerequisites"
  | "materials"
  | "subjectClassProgress"
>;

type QueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function resultRows<T>(result: QueryResult, label: string, optional = false): T[] {
  if (result.error) {
    if (optional) return [];
    throw new Error(`Não foi possível consultar ${label} no UniFlow.`);
  }
  return Array.isArray(result.data) ? result.data as T[] : [];
}

async function loadStudyData(client: SupabaseClient): Promise<StudyData> {
  const [
    subjects,
    demands,
    topics,
    assessments,
    assessmentTopics,
    assessmentMaterials,
    reviewEvents,
    reviewDayPlans,
    reviewQueueItems,
    topicPrerequisites,
    materials,
    subjectClassProgress,
  ] = await Promise.all([
    client.from("subjects").select("*"),
    client.from("demands").select("*"),
    client.from("topics").select("*"),
    client.from("assessments").select("*"),
    client.from("assessment_topics").select("*"),
    client.from("assessment_materials").select("*"),
    client.from("review_events").select("*").order("created_at", { ascending: false }).limit(1000),
    client.from("review_day_plans").select("*"),
    client.from("review_queue_items").select("*"),
    client.from("topic_prerequisites").select("*"),
    client.from("materials").select("*"),
    client.from("subject_class_progress").select("*"),
  ]);

  return {
    subjects: resultRows<Subject>(subjects, "as matérias"),
    demands: resultRows<Demand>(demands, "as tarefas"),
    topics: resultRows<Topic>(topics, "os conteúdos"),
    assessments: resultRows<Assessment>(assessments, "as avaliações"),
    assessmentTopics: resultRows<AssessmentTopic>(assessmentTopics, "os conteúdos das avaliações"),
    assessmentMaterials: resultRows<AssessmentMaterial>(assessmentMaterials, "os materiais das avaliações", true),
    reviewEvents: resultRows<ReviewEvent>(reviewEvents, "o histórico de revisões", true),
    reviewDayPlans: resultRows<ReviewDayPlan>(reviewDayPlans, "as metas diárias", true),
    reviewQueueItems: resultRows<ReviewQueueItem>(reviewQueueItems, "a fila de revisões", true),
    topicPrerequisites: resultRows<TopicPrerequisite>(topicPrerequisites, "os pré-requisitos", true),
    materials: resultRows<Material>(materials, "os materiais"),
    subjectClassProgress: resultRows<SubjectClassProgress>(subjectClassProgress, "os marcadores de aula", true),
  };
}

function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function referenceFor(date: string) {
  return new Date(`${date}T12:00:00-03:00`);
}

function absoluteHref(origin: string, href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, origin).toString();
}

function toolResult<T extends Record<string, unknown>>(value: T) {
  return {
    structuredContent: value,
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function createUniflowMcpServer(client: SupabaseClient, origin: string) {
  const server = new McpServer(
    { name: "uniflow-study", version: "1.0.0" },
    {
      instructions: [
        "Use these tools to consult the user's UniFlow academic data.",
        "All tools are read-only. Never claim that you changed, deleted, completed, or scheduled anything.",
        "Respect prerequisite warnings when suggesting a study order.",
      ].join(" "),
    },
  );

  server.registerTool(
    "get_uniflow_overview",
    {
      title: "Consultar visão acadêmica",
      description: "Use quando o usuário pedir um resumo das matérias, tarefas pendentes, avaliações ou ponto atual das aulas no UniFlow.",
      inputSchema: {},
      outputSchema: {
        generatedAt: z.string(),
        subjects: z.array(z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          status: z.string(),
          topicsCompleted: z.number(),
          topicsTotal: z.number(),
        })),
        pendingDemands: z.array(z.object({
          id: z.string(),
          subjectCode: z.string(),
          title: z.string(),
          type: z.string(),
          dueDate: z.string().nullable(),
          priority: z.string(),
        })),
        upcomingAssessments: z.array(z.object({
          id: z.string(),
          subjectCode: z.string(),
          name: z.string(),
          date: z.string().nullable(),
          type: z.string(),
        })),
        classProgress: z.array(z.object({
          subjectCode: z.string(),
          materialName: z.string(),
          page: z.number(),
          note: z.string().nullable(),
        })),
      },
      annotations: readOnlyAnnotations,
    },
    async () => {
      const data = await loadStudyData(client);
      const subjectById = new Map(data.subjects.map((subject) => [subject.id, subject]));
      const materialById = new Map(data.materials.map((material) => [material.id, material]));
      const topicsBySubject = new Map<string, Topic[]>();
      data.topics.forEach((topic) => topicsBySubject.set(topic.subject_id, [
        ...(topicsBySubject.get(topic.subject_id) ?? []),
        topic,
      ]));

      const value = {
        generatedAt: new Date().toISOString(),
        subjects: data.subjects.map((subject) => {
          const subjectTopics = topicsBySubject.get(subject.id) ?? [];
          return {
            id: subject.id,
            code: subject.code,
            name: subject.name,
            status: subject.status,
            topicsCompleted: subjectTopics.filter((topic) => topic.status === "concluido").length,
            topicsTotal: subjectTopics.length,
          };
        }),
        pendingDemands: data.demands
          .filter((demand) => demand.status !== "concluido")
          .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"))
          .slice(0, 30)
          .map((demand) => ({
            id: demand.id,
            subjectCode: subjectById.get(demand.subject_id)?.code ?? "",
            title: demand.title,
            type: demand.type,
            dueDate: demand.due_date,
            priority: demand.priority,
          })),
        upcomingAssessments: data.assessments
          .filter((assessment) => assessment.status === "futura")
          .sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31"))
          .slice(0, 30)
          .map((assessment) => ({
            id: assessment.id,
            subjectCode: subjectById.get(assessment.subject_id)?.code ?? "",
            name: assessment.name,
            date: assessment.date,
            type: assessment.type,
          })),
        classProgress: data.subjectClassProgress.flatMap((progress) => {
          const subject = subjectById.get(progress.subject_id);
          const material = progress.material_id ? materialById.get(progress.material_id) : null;
          if (!subject || !material || !progress.page_number) return [];
          return [{
            subjectCode: subject.code,
            materialName: material.name,
            page: progress.page_number,
            note: progress.note ?? null,
          }];
        }),
      };
      return toolResult(value);
    },
  );

  server.registerTool(
    "list_review_priorities",
    {
      title: "Listar prioridades de revisão",
      description: "Use para consultar o ranking inteligente de conteúdos e materiais que o usuário pode escolher para revisar.",
      inputSchema: {
        subject: z.string().trim().optional().describe("Código ou parte do nome da matéria."),
        limit: z.number().int().min(1).max(50).default(15),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data local no formato YYYY-MM-DD."),
      },
      outputSchema: {
        date: z.string(),
        items: z.array(z.object({
          targetKey: z.string(),
          kind: z.enum(["topic", "material"]),
          title: z.string(),
          subjectCode: z.string(),
          subjectName: z.string(),
          mastery: z.number(),
          priorityScore: z.number(),
          reasons: z.array(z.string()),
          unmetPrerequisites: z.array(z.string()),
          plannedToday: z.boolean(),
          openUrl: z.string(),
        })),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ subject, limit, date }) => {
      const data = await loadStudyData(client);
      const localDate = date ?? saoPauloDate();
      const reference = referenceFor(localDate);
      const normalizedSubject = subject?.toLocaleLowerCase("pt-BR");
      const plannedKeys = new Set(data.reviewQueueItems
        .filter((item) => item.queue_date === localDate && item.state === "planned")
        .map((item) => item.target_key));
      const entries = sortReviewEntries(buildReviewEntries(data), reference)
        .filter((entry) => !normalizedSubject
          || entry.subject.code.toLocaleLowerCase("pt-BR").includes(normalizedSubject)
          || entry.subject.name.toLocaleLowerCase("pt-BR").includes(normalizedSubject))
        .slice(0, limit);
      return toolResult({
        date: localDate,
        items: entries.map((entry) => {
          const priority = reviewPriority(entry, reference);
          return {
            targetKey: entry.key,
            kind: entry.kind,
            title: entry.title,
            subjectCode: entry.subject.code,
            subjectName: entry.subject.name,
            mastery: entry.mastery,
            priorityScore: priority.score,
            reasons: priority.reasons,
            unmetPrerequisites: entry.unmetPrerequisites.map((topic) => topic.title),
            plannedToday: plannedKeys.has(entry.key),
            openUrl: absoluteHref(origin, reviewHref(entry)),
          };
        }),
      });
    },
  );

  server.registerTool(
    "get_daily_review_queue",
    {
      title: "Consultar fila diária de revisão",
      description: "Use para ver quais revisões o usuário escolheu para um dia e quais já concluiu.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data local no formato YYYY-MM-DD."),
      },
      outputSchema: {
        date: z.string(),
        target: z.number().nullable(),
        planned: z.array(z.object({
          position: z.number(),
          title: z.string(),
          subjectCode: z.string(),
          reason: z.string(),
          openUrl: z.string(),
        })),
        completed: z.array(z.object({
          title: z.string(),
          subjectCode: z.string(),
        })),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ date }) => {
      const data = await loadStudyData(client);
      const localDate = date ?? saoPauloDate();
      const reference = referenceFor(localDate);
      const entryByKey = new Map(buildReviewEntries(data).map((entry) => [entry.key, entry]));
      const queue = data.reviewQueueItems
        .filter((item) => item.queue_date === localDate && item.state === "planned")
        .sort((a, b) => a.sort_order - b.sort_order);
      const subjectById = new Map(data.subjects.map((subject) => [subject.id, subject]));
      const completedEvents = data.reviewEvents.filter((event) =>
        event.action === "completed" && saoPauloDate(new Date(event.created_at)) === localDate,
      );
      const target = data.reviewDayPlans.find((plan) => plan.plan_date === localDate)?.capacity ?? null;
      return toolResult({
        date: localDate,
        target,
        planned: queue.flatMap((item, index) => {
          const entry = entryByKey.get(item.target_key);
          if (!entry) return [];
          return [{
            position: index + 1,
            title: entry.title,
            subjectCode: entry.subject.code,
            reason: dueReason(entry, reference),
            openUrl: absoluteHref(origin, reviewHref(entry)),
          }];
        }),
        completed: completedEvents.map((event) => ({
          title: event.target_title,
          subjectCode: subjectById.get(event.subject_id)?.code ?? "",
        })),
      });
    },
  );

  server.registerTool(
    "get_subject_study_context",
    {
      title: "Consultar contexto de uma matéria",
      description: "Use quando o usuário quiser conversar sobre uma matéria específica, seus conteúdos, materiais, avaliações e dependências de estudo.",
      inputSchema: {
        subject: z.string().trim().min(1).describe("Código, nome ou ID da matéria."),
      },
      outputSchema: {
        subject: z.object({ id: z.string(), code: z.string(), name: z.string() }),
        topics: z.array(z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          mastery: z.number(),
          prerequisiteTitles: z.array(z.string()),
          notes: z.string().nullable(),
        })),
        materials: z.array(z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          openUrl: z.string(),
        })),
        assessments: z.array(z.object({
          id: z.string(),
          name: z.string(),
          date: z.string().nullable(),
          status: z.string(),
        })),
        classProgress: z.object({
          materialName: z.string(),
          page: z.number(),
          note: z.string().nullable(),
        }).nullable(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ subject: query }) => {
      const data = await loadStudyData(client);
      const normalized = query.toLocaleLowerCase("pt-BR");
      const subject = data.subjects.find((item) => item.id === query)
        ?? data.subjects.find((item) => item.code.toLocaleLowerCase("pt-BR") === normalized)
        ?? data.subjects.find((item) => item.name.toLocaleLowerCase("pt-BR").includes(normalized));
      if (!subject) throw new Error(`Nenhuma matéria corresponde a “${query}”.`);
      const subjectTopics = data.topics
        .filter((topic) => topic.subject_id === subject.id)
        .sort((a, b) => a.order_index - b.order_index);
      const topicById = new Map(subjectTopics.map((topic) => [topic.id, topic]));
      const prerequisitesByTopic = new Map<string, string[]>();
      data.topicPrerequisites.forEach((relation) => prerequisitesByTopic.set(relation.topic_id, [
        ...(prerequisitesByTopic.get(relation.topic_id) ?? []),
        relation.prerequisite_topic_id,
      ]));
      const subjectMaterials = data.materials.filter((material) => material.subject_id === subject.id);
      const materialById = new Map(subjectMaterials.map((material) => [material.id, material]));
      const progress = data.subjectClassProgress.find((item) => item.subject_id === subject.id);
      const progressMaterial = progress?.material_id ? materialById.get(progress.material_id) : null;
      return toolResult({
        subject: { id: subject.id, code: subject.code, name: subject.name },
        topics: subjectTopics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          status: topic.status,
          mastery: topic.mastery_level ?? (topic.status === "concluido" ? 2 : topic.status === "estudando" ? 1 : 0),
          prerequisiteTitles: (prerequisitesByTopic.get(topic.id) ?? [])
            .map((id) => topicById.get(id)?.title)
            .filter((title): title is string => Boolean(title)),
          notes: topic.notes ?? null,
        })),
        materials: subjectMaterials.map((material) => ({
          id: material.id,
          name: material.name,
          type: material.type,
          openUrl: material.type === "link" && material.url
            ? material.url
            : absoluteHref(origin, `/materiais/abrir/${encodeURIComponent(material.id)}`),
        })),
        assessments: data.assessments
          .filter((assessment) => assessment.subject_id === subject.id)
          .sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31"))
          .map((assessment) => ({
            id: assessment.id,
            name: assessment.name,
            date: assessment.date,
            status: assessment.status,
          })),
        classProgress: progressMaterial && progress?.page_number ? {
          materialName: progressMaterial.name,
          page: progress.page_number,
          note: progress.note ?? null,
        } : null,
      });
    },
  );

  return server;
}
