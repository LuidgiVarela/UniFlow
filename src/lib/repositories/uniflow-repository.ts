import { mockData } from "@/lib/mock-data";
import { hasSupabaseEnv, supabase } from "@/lib/supabase/client";
import type {
  AppData,
  Assessment,
  AssessmentMaterial,
  AssessmentTopic,
  Demand,
  DemandQuestion,
  DemandQuestionItem,
  GradeComponent,
  Material,
  MaterialFolder,
  ReviewDayPlan,
  ReviewEvent,
  ReviewQueueItem,
  Subject,
  SubjectClassProgress,
  StudyDocument,
  Topic,
  TopicPrerequisite,
} from "@/types/domain";

const DEMO_KEY = "uniflow:demo-data";
const MATERIAL_STORAGE_BUCKET = "subject-materials";
const MATERIAL_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
const MATERIAL_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 * 6;
const DEMO_STUDY_DOCUMENTS_KEY = "uniflow:study-documents";

export type MaterialStorageUsage = {
  usedBytes: number;
  limitBytes: number;
  fileCount: number;
  updatedAt: string;
};

function readDemoData(): AppData {
  if (typeof window === "undefined") return mockData;
  const stored = window.localStorage.getItem(DEMO_KEY);
  if (!stored) {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(mockData));
    return mockData;
  }
  const parsed = JSON.parse(stored) as Partial<AppData>;
  const data: AppData = {
    subjects: parsed.subjects ?? [],
    demands: parsed.demands ?? [],
    demandQuestions: parsed.demandQuestions ?? [],
    demandQuestionItems: parsed.demandQuestionItems ?? [],
    topics: parsed.topics ?? [],
    gradeComponents: parsed.gradeComponents ?? [],
    assessments: parsed.assessments ?? [],
    assessmentTopics: parsed.assessmentTopics ?? [],
    assessmentMaterials: parsed.assessmentMaterials ?? [],
    reviewEvents: parsed.reviewEvents ?? [],
    reviewDayPlans: parsed.reviewDayPlans ?? [],
    reviewQueueItems: parsed.reviewQueueItems ?? [],
    topicPrerequisites: parsed.topicPrerequisites ?? [],
    materials: parsed.materials ?? [],
    materialFolders: parsed.materialFolders ?? [],
    subjectClassProgress: parsed.subjectClassProgress ?? [],
  };
  writeDemoData(data);
  return data;
}

function writeDemoData(data: AppData) {
  window.localStorage.setItem(DEMO_KEY, JSON.stringify(data));
}

async function requireUserId() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Usuário não autenticado.");
  return data.user.id;
}

function readDemoStudyDocuments() {
  if (typeof window === "undefined") return [] as StudyDocument[];
  try {
    const stored = window.localStorage.getItem(DEMO_STUDY_DOCUMENTS_KEY);
    return stored ? JSON.parse(stored) as StudyDocument[] : [];
  } catch {
    return [] as StudyDocument[];
  }
}

function writeDemoStudyDocuments(documents: StudyDocument[]) {
  window.localStorage.setItem(DEMO_STUDY_DOCUMENTS_KEY, JSON.stringify(documents));
}

export async function loadStudyDocument(demandId: string) {
  if (!hasSupabaseEnv || !supabase) {
    return readDemoStudyDocuments().find((document) => document.demand_id === demandId) ?? null;
  }

  const { data, error } = await supabase
    .from("study_documents")
    .select("*")
    .eq("demand_id", demandId)
    .maybeSingle();
  if (error) throw error;
  return data as StudyDocument | null;
}

export async function saveStudyDocument(document: StudyDocument) {
  const updated_at = new Date().toISOString();
  if (!hasSupabaseEnv || !supabase) {
    const documents = readDemoStudyDocuments();
    const existing = documents.find((item) => item.demand_id === document.demand_id);
    const nextDocument: StudyDocument = {
      ...document,
      id: existing?.id ?? document.id,
      created_at: existing?.created_at ?? document.created_at,
      updated_at,
    };
    writeDemoStudyDocuments([
      ...documents.filter((item) => item.demand_id !== document.demand_id),
      nextDocument,
    ]);
    return nextDocument;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("study_documents")
    .upsert({
      user_id,
      demand_id: document.demand_id,
      title: document.title,
      content: document.content,
      updated_at,
    }, { onConflict: "user_id,demand_id" })
    .select()
    .single();
  if (error) throw error;
  return data as StudyDocument;
}

export async function loadAppData(): Promise<AppData> {
  if (!hasSupabaseEnv || !supabase) return readDemoData();

  const [
    subjects,
    demands,
    demandQuestions,
    demandQuestionItems,
    topics,
    gradeComponents,
    assessments,
    assessmentTopics,
    assessmentMaterials,
    reviewEvents,
    reviewDayPlans,
    reviewQueueItems,
    topicPrerequisites,
    materials,
    materialFolders,
    subjectClassProgress,
  ] = await Promise.all([
    supabase.from("subjects").select("*").order("sort_order", { nullsFirst: false }).order("created_at"),
    supabase.from("demands").select("*").order("due_date", { nullsFirst: false }).order("created_at"),
    supabase.from("demand_questions").select("*").order("order_index"),
    supabase.from("demand_question_items").select("*").order("order_index"),
    supabase.from("topics").select("*").order("order_index"),
    supabase.from("grade_components").select("*").order("created_at"),
    supabase.from("assessments").select("*").order("date"),
    supabase.from("assessment_topics").select("*").order("created_at"),
    supabase.from("assessment_materials").select("*").order("created_at"),
    supabase.from("review_events").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("review_day_plans").select("*").order("plan_date"),
    supabase.from("review_queue_items").select("*").order("queue_date").order("sort_order"),
    supabase.from("topic_prerequisites").select("*").order("created_at"),
    supabase.from("materials").select("*").order("created_at", { ascending: false }),
    supabase.from("material_folders").select("*").order("parent_folder_id", { nullsFirst: true }).order("sort_order", { nullsFirst: true }).order("name"),
    supabase.from("subject_class_progress").select("*").order("updated_at", { ascending: false }),
  ]);

  for (const result of [subjects, demands, topics, assessments, assessmentTopics, materials]) {
    if (result.error) throw result.error;
  }

  return {
    subjects: subjects.data ?? [],
    demands: demands.data ?? [],
    demandQuestions: demandQuestions.error ? [] : demandQuestions.data ?? [],
    demandQuestionItems: demandQuestionItems.error ? [] : demandQuestionItems.data ?? [],
    topics: topics.data ?? [],
    gradeComponents: gradeComponents.error ? [] : gradeComponents.data ?? [],
    assessments: assessments.data ?? [],
    assessmentTopics: assessmentTopics.data ?? [],
    assessmentMaterials: assessmentMaterials.error ? [] : assessmentMaterials.data ?? [],
    reviewEvents: reviewEvents.error ? [] : reviewEvents.data ?? [],
    reviewDayPlans: reviewDayPlans.error ? [] : reviewDayPlans.data ?? [],
    reviewQueueItems: reviewQueueItems.error ? [] : reviewQueueItems.data ?? [],
    topicPrerequisites: topicPrerequisites.error ? [] : topicPrerequisites.data ?? [],
    materials: materials.data ?? [],
    materialFolders: materialFolders.error ? [] : materialFolders.data ?? [],
    subjectClassProgress: subjectClassProgress.error ? [] : subjectClassProgress.data ?? [],
  } as AppData;
}

export async function saveSubject(subject: Subject) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.subjects.some((item) => item.id === subject.id);
    const sort_order = subject.sort_order ?? data.subjects.length + 1;
    const nextSubject = { ...subject, sort_order };
    data.subjects = exists
      ? data.subjects.map((item) => (item.id === subject.id ? nextSubject : item))
      : [...data.subjects, nextSubject];
    writeDemoData(data);
    return nextSubject;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("subjects")
    .upsert({ ...subject, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as Subject;
}

export async function reorderSubjects(ids: string[]) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.subjects = data.subjects
      .map((subject) => ({ ...subject, sort_order: ids.indexOf(subject.id) + 1 || subject.sort_order }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    writeDemoData(data);
    return;
  }

  const user_id = await requireUserId();
  const client = supabase;
  const updates = ids.map((id, index) =>
    client.from("subjects").update({ sort_order: index + 1 }).eq("id", id).eq("user_id", user_id),
  );
  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
}

export async function deleteSubject(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const demandIds = data.demands.filter((item) => item.subject_id === id).map((item) => item.id);
    data.subjects = data.subjects.filter((item) => item.id !== id);
    data.demands = data.demands.filter((item) => item.subject_id !== id);
    data.demandQuestions = data.demandQuestions.filter((item) => !demandIds.includes(item.demand_id));
    const questionIds = data.demandQuestions.map((item) => item.id);
    data.demandQuestionItems = data.demandQuestionItems.filter((item) => questionIds.includes(item.question_id));
    data.topics = data.topics.filter((item) => item.subject_id !== id);
    data.assessments = data.assessments.filter((item) => item.subject_id !== id);
    data.gradeComponents = data.gradeComponents.filter((item) => item.subject_id !== id);
    data.assessmentTopics = data.assessmentTopics.filter((item) =>
      data.assessments.some((assessment) => assessment.id === item.assessment_id),
    );
    data.materials = data.materials.filter((item) => item.subject_id !== id);
    data.assessmentMaterials = data.assessmentMaterials.filter((item) =>
      data.assessments.some((assessment) => assessment.id === item.assessment_id)
      && data.materials.some((material) => material.id === item.material_id),
    );
    data.materialFolders = data.materialFolders.filter((item) => item.subject_id !== id);
    writeDemoData(data);
    return;
  }
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

export async function saveDemand(demand: Demand) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.demands.some((item) => item.id === demand.id);
    data.demands = exists
      ? data.demands.map((item) => (item.id === demand.id ? demand : item))
      : [demand, ...data.demands];
    writeDemoData(data);
    return demand;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("demands")
    .upsert({ ...demand, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as Demand;
}

export async function deleteDemand(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.demands = data.demands.filter((item) => item.id !== id);
    data.demandQuestions = data.demandQuestions.filter((item) => item.demand_id !== id);
    const questionIds = data.demandQuestions.map((item) => item.id);
    data.demandQuestionItems = data.demandQuestionItems.filter((item) => questionIds.includes(item.question_id));
    writeDemoData(data);
    return;
  }
  const { error } = await supabase.from("demands").delete().eq("id", id);
  if (error) throw error;
}

export async function saveDemandQuestion(question: DemandQuestion) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.demandQuestions.some((item) => item.id === question.id);
    data.demandQuestions = exists
      ? data.demandQuestions.map((item) => (item.id === question.id ? question : item))
      : [...data.demandQuestions, question];
    writeDemoData(data);
    return question;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("demand_questions")
    .upsert({ ...question, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as DemandQuestion;
}

export async function saveDemandQuestionItem(item: DemandQuestionItem) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.demandQuestionItems.some((current) => current.id === item.id);
    data.demandQuestionItems = exists
      ? data.demandQuestionItems.map((current) => (current.id === item.id ? item : current))
      : [...data.demandQuestionItems, item];
    writeDemoData(data);
    return item;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("demand_question_items")
    .upsert({ ...item, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as DemandQuestionItem;
}

export async function deleteDemandQuestionItem(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.demandQuestionItems = data.demandQuestionItems.filter((item) => item.id !== id);
    writeDemoData(data);
    return;
  }

  const { error } = await supabase.from("demand_question_items").delete().eq("id", id);
  if (error) throw error;
}

function demandQuestionNumber(question: Pick<DemandQuestion, "label">) {
  const match = question.label.trim().match(/^Quest(?:ão|ao)\s+(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function demandQuestionStart(
  existingQuestions: Array<Pick<DemandQuestion, "label" | "order_index">>,
  requestedStart: 0 | 1 | undefined,
  questionCount: number,
) {
  if (!existingQuestions.length) return requestedStart ?? 1;
  const numbers = existingQuestions
    .map(demandQuestionNumber)
    .filter((number): number is number => number !== null);
  if (requestedStart === 0 && numbers.includes(0)) return null;
  if (requestedStart === 0 && questionCount === 1) return 0;
  return Math.max(0, ...numbers) + 1;
}

function normalizeDemandQuestionLabel(value: string) {
  const identifier = value.trim().replace(/^Quest(?:ão|ao)\s*/i, "").trim();
  return identifier ? `Questão ${identifier}` : "";
}

function demandQuestionBlueprints(
  existingQuestions: Array<Pick<DemandQuestion, "label" | "order_index">>,
  questionCount: number,
  requestedStart: 0 | 1 | undefined,
  requestedLabels: string[] | undefined,
) {
  const explicitLabels = (requestedLabels ?? [])
    .map(normalizeDemandQuestionLabel)
    .filter(Boolean);

  if (explicitLabels.length) {
    const existingKeys = new Set(
      existingQuestions.map((question) => normalizeDemandQuestionLabel(question.label).toLocaleLowerCase("pt-BR")),
    );
    const requestedKeys = new Set<string>();
    for (const label of explicitLabels) {
      const key = label.toLocaleLowerCase("pt-BR");
      if (existingKeys.has(key) || requestedKeys.has(key)) {
        throw new Error(`${label} já existe nesta lista.`);
      }
      requestedKeys.add(key);
    }

    const nextOrder = existingQuestions.length
      ? Math.max(...existingQuestions.map((question) => question.order_index)) + 1
      : 1;
    return explicitLabels.map((label, index) => ({ label, order_index: nextOrder + index }));
  }

  const startNumber = demandQuestionStart(existingQuestions, requestedStart, questionCount);
  if (startNumber === null) return [];
  return Array.from({ length: questionCount }, (_, index) => ({
    label: `Questão ${startNumber + index}`,
    order_index: startNumber + index,
  }));
}

export async function generateDemandQuestionSet(
  demandId: string,
  questionCount: number,
  itemLabels: string[],
  requestedStart?: 0 | 1,
  requestedLabels?: string[],
) {
  const cleanCount = Math.max(0, Math.floor(questionCount));
  const cleanLabels = itemLabels.map((label) => label.trim()).filter(Boolean);
  if ((!cleanCount && !requestedLabels?.length) || !cleanLabels.length) return;

  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const existingQuestions = data.demandQuestions.filter((question) => question.demand_id === demandId);
    const blueprints = demandQuestionBlueprints(existingQuestions, cleanCount, requestedStart, requestedLabels);
    if (!blueprints.length) return;
    const questions: DemandQuestion[] = blueprints.map((blueprint) => ({
      id: crypto.randomUUID(),
      demand_id: demandId,
      label: blueprint.label,
      difficulty: "media",
      important: false,
      notes: "",
      order_index: blueprint.order_index,
      created_at: new Date().toISOString(),
    }));
    const items: DemandQuestionItem[] = questions.flatMap((question) =>
      cleanLabels.map((label, index) => ({
        id: crypto.randomUUID(),
        question_id: question.id,
        label,
        done: false,
        important: false,
        order_index: index + 1,
        created_at: new Date().toISOString(),
      })),
    );
    data.demandQuestions = [...data.demandQuestions, ...questions];
    data.demandQuestionItems = [...data.demandQuestionItems, ...items];
    writeDemoData(data);
    return;
  }

  const user_id = await requireUserId();
  const { data: existingQuestions, error: questionsError } = await supabase
    .from("demand_questions")
    .select("label, order_index")
    .eq("demand_id", demandId)
    .eq("user_id", user_id);
  if (questionsError) throw questionsError;

  const blueprints = demandQuestionBlueprints(existingQuestions ?? [], cleanCount, requestedStart, requestedLabels);
  if (!blueprints.length) return;
  const questions = blueprints.map((blueprint) => ({
    id: crypto.randomUUID(),
    user_id,
    demand_id: demandId,
    label: blueprint.label,
    difficulty: "media",
    important: false,
    notes: "",
    order_index: blueprint.order_index,
    created_at: new Date().toISOString(),
  }));
  const insertedQuestions = await supabase.from("demand_questions").insert(questions).select();
  if (insertedQuestions.error) throw insertedQuestions.error;

  const items = (insertedQuestions.data ?? []).flatMap((question) =>
    cleanLabels.map((label, index) => ({
      id: crypto.randomUUID(),
      user_id,
      question_id: question.id,
      label,
      done: false,
      important: false,
      order_index: index + 1,
      created_at: new Date().toISOString(),
    })),
  );
  if (items.length) {
    const insertedItems = await supabase.from("demand_question_items").insert(items);
    if (insertedItems.error) throw insertedItems.error;
  }
}

export async function saveTopic(topic: Topic) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.topics.some((item) => item.id === topic.id);
    data.topics = exists
      ? data.topics.map((item) => (item.id === topic.id ? topic : item))
      : [...data.topics, topic];
    writeDemoData(data);
    return topic;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("topics")
    .upsert({ ...topic, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as Topic;
}

export async function deleteTopic(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.topics = data.topics.filter((item) => item.id !== id);
    data.assessmentTopics = data.assessmentTopics.filter((item) => item.topic_id !== id);
    writeDemoData(data);
    return;
  }

  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw error;
}

export async function saveAssessment(assessment: Assessment, topicIds?: string[], materialIds?: string[]) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.assessments.some((item) => item.id === assessment.id);
    data.assessments = exists
      ? data.assessments.map((item) => (item.id === assessment.id ? assessment : item))
      : [assessment, ...data.assessments];
    if (topicIds) {
      data.assessmentTopics = [
        ...data.assessmentTopics.filter((item) => item.assessment_id !== assessment.id),
        ...topicIds.map((topic_id) => ({ assessment_id: assessment.id, topic_id })),
      ];
    }
    if (materialIds) {
      const existingLinks = new Map(
        data.assessmentMaterials
          .filter((item) => item.assessment_id === assessment.id)
          .map((item) => [item.material_id, item]),
      );
      data.assessmentMaterials = [
        ...data.assessmentMaterials.filter((item) => item.assessment_id !== assessment.id),
        ...materialIds.map((material_id) => existingLinks.get(material_id) ?? {
          assessment_id: assessment.id,
          material_id,
        }),
      ];
    }
    writeDemoData(data);
    return assessment;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("assessments")
    .upsert({ ...assessment, user_id })
    .select()
    .single();
  if (error) throw error;
  if (topicIds) {
    const deleteResult = await supabase.from("assessment_topics").delete().eq("assessment_id", assessment.id);
    if (deleteResult.error) throw deleteResult.error;

    if (topicIds.length) {
      const rows: AssessmentTopic[] = topicIds.map((topic_id) => ({
        assessment_id: assessment.id,
        topic_id,
        user_id: user_id ?? undefined,
      }));
      const insertResult = await supabase.from("assessment_topics").insert(rows);
      if (insertResult.error) throw insertResult.error;
    }
  }
  if (materialIds) {
    const existingResult = await supabase
      .from("assessment_materials")
      .select("material_id")
      .eq("assessment_id", assessment.id);
    if (existingResult.error) throw existingResult.error;

    const selectedIds = new Set(materialIds);
    const existingIds = new Set((existingResult.data ?? []).map((item) => item.material_id));
    const addedIds = materialIds.filter((materialId) => !existingIds.has(materialId));
    const removedIds = [...existingIds].filter((materialId) => !selectedIds.has(materialId));

    if (addedIds.length) {
      const rows: AssessmentMaterial[] = addedIds.map((material_id) => ({
        assessment_id: assessment.id,
        material_id,
        user_id: user_id ?? undefined,
      }));
      const insertResult = await supabase.from("assessment_materials").insert(rows);
      if (insertResult.error) throw insertResult.error;
    }
    if (removedIds.length) {
      const deleteResult = await supabase
        .from("assessment_materials")
        .delete()
        .eq("assessment_id", assessment.id)
        .in("material_id", removedIds);
      if (deleteResult.error) throw deleteResult.error;
    }
  }
  return data as Assessment;
}

export async function addAssessmentTopics(assessmentId: string, topicIds: string[]) {
  if (!topicIds.length) return;
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const existing = new Set(
      data.assessmentTopics
        .filter((item) => item.assessment_id === assessmentId)
        .map((item) => item.topic_id),
    );
    data.assessmentTopics = [
      ...data.assessmentTopics,
      ...topicIds.filter((topicId) => !existing.has(topicId)).map((topic_id) => ({
        assessment_id: assessmentId,
        topic_id,
      })),
    ];
    writeDemoData(data);
    return;
  }

  const user_id = await requireUserId();
  const rows: AssessmentTopic[] = topicIds.map((topic_id) => ({
    assessment_id: assessmentId,
    topic_id,
    user_id: user_id ?? undefined,
  }));
  const { error } = await supabase
    .from("assessment_topics")
    .upsert(rows, { onConflict: "assessment_id,topic_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function replaceTopicPrerequisites(topicId: string, prerequisiteIds: string[]) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.topicPrerequisites = [
      ...data.topicPrerequisites.filter((item) => item.topic_id !== topicId),
      ...prerequisiteIds.map((prerequisite_topic_id) => ({
        topic_id: topicId,
        prerequisite_topic_id,
      })),
    ];
    writeDemoData(data);
    return;
  }

  const user_id = await requireUserId();
  const currentResult = await supabase
    .from("topic_prerequisites")
    .select("prerequisite_topic_id")
    .eq("topic_id", topicId);
  if (currentResult.error) throw currentResult.error;

  const requested = new Set(prerequisiteIds);
  const current = new Set((currentResult.data ?? []).map((item) => item.prerequisite_topic_id));
  const added = prerequisiteIds.filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !requested.has(id));

  if (added.length) {
    const rows: TopicPrerequisite[] = added.map((prerequisite_topic_id) => ({
      topic_id: topicId,
      prerequisite_topic_id,
      user_id: user_id ?? undefined,
    }));
    const result = await supabase.from("topic_prerequisites").insert(rows);
    if (result.error) throw result.error;
  }
  if (removed.length) {
    const result = await supabase
      .from("topic_prerequisites")
      .delete()
      .eq("topic_id", topicId)
      .in("prerequisite_topic_id", removed);
    if (result.error) throw result.error;
  }
}

export async function saveAssessmentMaterialProgress(item: AssessmentMaterial) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.assessmentMaterials.some(
      (current) => current.assessment_id === item.assessment_id && current.material_id === item.material_id,
    );
    data.assessmentMaterials = exists
      ? data.assessmentMaterials.map((current) => (
        current.assessment_id === item.assessment_id && current.material_id === item.material_id ? item : current
      ))
      : [...data.assessmentMaterials, item];
    writeDemoData(data);
    return item;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("assessment_materials")
    .upsert({ ...item, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as AssessmentMaterial;
}

export async function saveReviewEvent(event: ReviewEvent) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.reviewEvents = [event, ...data.reviewEvents.filter((item) => item.id !== event.id)];
    writeDemoData(data);
    return event;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("review_events")
    .insert({ ...event, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as ReviewEvent;
}

export async function saveReviewDayPlan(plan: ReviewDayPlan) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.reviewDayPlans.some((item) => item.plan_date === plan.plan_date);
    data.reviewDayPlans = exists
      ? data.reviewDayPlans.map((item) => (item.plan_date === plan.plan_date ? plan : item))
      : [...data.reviewDayPlans, plan];
    writeDemoData(data);
    return plan;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("review_day_plans")
    .upsert({ ...plan, user_id }, { onConflict: "user_id,plan_date" })
    .select()
    .single();
  if (error) throw error;
  return data as ReviewDayPlan;
}

export async function saveReviewQueueItem(item: ReviewQueueItem) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const index = data.reviewQueueItems.findIndex((current) => (
      current.queue_date === item.queue_date && current.target_key === item.target_key
    ));
    if (index >= 0) data.reviewQueueItems[index] = item;
    else data.reviewQueueItems.push(item);
    writeDemoData(data);
    return item;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("review_queue_items")
    .upsert({ ...item, user_id }, { onConflict: "user_id,queue_date,target_key" })
    .select()
    .single();
  if (error) throw error;
  return data as ReviewQueueItem;
}

export async function saveSubjectClassProgress(progress: SubjectClassProgress) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.subjectClassProgress.some((item) => item.subject_id === progress.subject_id);
    data.subjectClassProgress = exists
      ? data.subjectClassProgress.map((item) => item.subject_id === progress.subject_id ? progress : item)
      : [...data.subjectClassProgress, progress];
    writeDemoData(data);
    return progress;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("subject_class_progress")
    .upsert({ ...progress, user_id }, { onConflict: "subject_id" })
    .select()
    .single();
  if (error) throw error;
  return data as SubjectClassProgress;
}

export async function saveGradeComponent(component: GradeComponent) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.gradeComponents.some((item) => item.id === component.id);
    data.gradeComponents = exists
      ? data.gradeComponents.map((item) => (item.id === component.id ? component : item))
      : [...data.gradeComponents, component];
    writeDemoData(data);
    return component;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("grade_components")
    .upsert({ ...component, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as GradeComponent;
}

export async function deleteGradeComponent(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.gradeComponents = data.gradeComponents.filter((item) => item.id !== id);
    data.assessments = data.assessments.map((item) =>
      item.grade_component_id === id ? { ...item, grade_component_id: null } : item,
    );
    writeDemoData(data);
    return;
  }

  const { error } = await supabase.from("grade_components").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAssessment(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.assessments = data.assessments.filter((item) => item.id !== id);
    data.assessmentTopics = data.assessmentTopics.filter((item) => item.assessment_id !== id);
    data.assessmentMaterials = data.assessmentMaterials.filter((item) => item.assessment_id !== id);
    writeDemoData(data);
    return;
  }

  const { error } = await supabase.from("assessments").delete().eq("id", id);
  if (error) throw error;
}

export async function saveMaterial(material: Material) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.materials.some((item) => item.id === material.id);
    data.materials = exists
      ? data.materials.map((item) => (item.id === material.id ? material : item))
      : [material, ...data.materials];
    writeDemoData(data);
    return material;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("materials")
    .upsert({ ...material, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as Material;
}

export async function reorderMaterials(materials: Material[]) {
  if (!materials.length) return;

  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const updates = new Map(materials.map((material) => [material.id, material]));
    data.materials = data.materials.map((material) => updates.get(material.id) ?? material);
    writeDemoData(data);
    return;
  }

  const user_id = await requireUserId();
  const rows = materials.map((material) => ({ ...material, user_id }));
  const { error } = await supabase.from("materials").upsert(rows);
  if (error) throw error;
}

export async function saveMaterialFolder(folder: MaterialFolder) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.materialFolders.some((item) => item.id === folder.id);
    const parent_folder_id = folder.parent_folder_id ?? null;
    const sort_order =
      folder.sort_order ??
      data.materialFolders.filter(
        (item) => item.subject_id === folder.subject_id && (item.parent_folder_id ?? null) === parent_folder_id,
      ).length + 1;
    const nextFolder = { ...folder, parent_folder_id, sort_order };
    data.materialFolders = exists
      ? data.materialFolders.map((item) => (item.id === folder.id ? nextFolder : item))
      : [...data.materialFolders, nextFolder];
    writeDemoData(data);
    return nextFolder;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("material_folders")
    .upsert({ ...folder, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as MaterialFolder;
}

export async function reorderMaterialFolders(folders: MaterialFolder[]) {
  if (!folders.length) return;

  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const updates = new Map(folders.map((folder) => [folder.id, folder]));
    data.materialFolders = data.materialFolders.map((folder) => updates.get(folder.id) ?? folder);
    writeDemoData(data);
    return;
  }

  const user_id = await requireUserId();
  const rows = folders.map((folder) => ({ ...folder, user_id }));
  const { error } = await supabase.from("material_folders").upsert(rows);
  if (error) throw error;
}

export async function deleteMaterialFolder(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.materialFolders = data.materialFolders.filter((item) => item.id !== id);
    data.materialFolders = data.materialFolders.map((item) =>
      item.parent_folder_id === id ? { ...item, parent_folder_id: null } : item,
    );
    data.materials = data.materials.map((item) => (item.folder_id === id ? { ...item, folder_id: null } : item));
    writeDemoData(data);
    return;
  }

  const { error } = await supabase.from("material_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadMaterialFile(subjectId: string, file: File, name?: string, folderId?: string | null) {
  if (!hasSupabaseEnv || !supabase) {
    throw new Error("Upload de arquivos disponível apenas com Supabase configurado.");
  }

  const user_id = await requireUserId();
  if (!user_id) throw new Error("Usuário não autenticado.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user_id}/${subjectId}/${crypto.randomUUID()}/${safeName}`;
  const upload = await supabase.storage.from(MATERIAL_STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (upload.error) throw upload.error;

  return saveMaterial({
    id: crypto.randomUUID(),
    subject_id: subjectId,
    folder_id: folderId ?? null,
    name: name?.trim() || file.name,
    type: "file",
    file_path: path,
    url: null,
    created_at: new Date().toISOString(),
  });
}

export async function replaceMaterialFile(material: Material, file: File) {
  if (!hasSupabaseEnv || !supabase) {
    throw new Error("Substituicao de arquivos disponivel apenas com Supabase configurado.");
  }
  if (material.type !== "file" || !material.file_path) {
    throw new Error("Este material nao possui um arquivo para substituir.");
  }

  const update = await supabase.storage.from(MATERIAL_STORAGE_BUCKET).update(material.file_path, file, {
    cacheControl: "0",
    contentType: file.type || "application/pdf",
  });
  if (update.error) throw update.error;
}

function materialOpenFileName(material: Material) {
  const storedName = material.file_path?.split("/").pop()?.replace(/^[0-9a-f-]{36}-/i, "") || "material";
  const extension = storedName.includes(".") ? storedName.slice(storedName.lastIndexOf(".")) : "";
  const displayName = material.name.trim() || storedName;
  const hasExtension = /\.[a-z0-9]{1,8}$/i.test(displayName);
  return (hasExtension ? displayName : `${displayName}${extension}`).replace(/[\\/]/g, "-");
}

export async function deleteMaterial(material: Material) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.materials = data.materials.filter((item) => item.id !== material.id);
    data.assessmentMaterials = data.assessmentMaterials.filter((item) => item.material_id !== material.id);
    writeDemoData(data);
    return;
  }

  if (material.type === "file" && material.file_path) {
    const remove = await supabase.storage.from(MATERIAL_STORAGE_BUCKET).remove([material.file_path]);
    if (remove.error) throw remove.error;
  }
  const { error } = await supabase.from("materials").delete().eq("id", material.id);
  if (error) throw error;
}

export async function materialPublicUrl(material: Material) {
  if (material.type === "link") return material.url ?? "#";
  if (!hasSupabaseEnv || !supabase || !material.file_path) return "#";
  const signed = await supabase.storage
    .from(MATERIAL_STORAGE_BUCKET)
    .createSignedUrl(material.file_path, MATERIAL_SIGNED_URL_EXPIRES_IN_SECONDS);
  if (signed.error) throw signed.error;
  const fileName = encodeURIComponent(materialOpenFileName(material));
  return `/api/materials/open/${fileName}?source=${encodeURIComponent(signed.data.signedUrl)}`;
}

async function storagePathUsage(path: string): Promise<{ usedBytes: number; fileCount: number }> {
  if (!supabase) return { usedBytes: 0, fileCount: 0 };
  const limit = 1000;
  let offset = 0;
  let usedBytes = 0;
  let fileCount = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(MATERIAL_STORAGE_BUCKET).list(path, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const items = data ?? [];
    if (!items.length) break;

    for (const item of items) {
      const size = Number(item.metadata?.size ?? 0);
      if (item.id && size > 0) {
        usedBytes += size;
        fileCount += 1;
        continue;
      }
      if (!item.id) {
        const nested = await storagePathUsage(`${path}/${item.name}`);
        usedBytes += nested.usedBytes;
        fileCount += nested.fileCount;
      }
    }

    if (items.length < limit) break;
    offset += limit;
  }

  return { usedBytes, fileCount };
}

export async function getMaterialStorageUsage(): Promise<MaterialStorageUsage> {
  if (!hasSupabaseEnv || !supabase) {
    return {
      usedBytes: 0,
      limitBytes: MATERIAL_STORAGE_LIMIT_BYTES,
      fileCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  const user_id = await requireUserId();
  if (!user_id) throw new Error("Usuário não autenticado.");
  const usage = await storagePathUsage(user_id);
  return {
    ...usage,
    limitBytes: MATERIAL_STORAGE_LIMIT_BYTES,
    updatedAt: new Date().toISOString(),
  };
}
