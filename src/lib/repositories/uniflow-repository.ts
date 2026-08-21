import { mockData } from "@/lib/mock-data";
import { hasSupabaseEnv, supabase } from "@/lib/supabase/client";
import type {
  AppData,
  Assessment,
  AssessmentTopic,
  Demand,
  DemandQuestion,
  DemandQuestionItem,
  Material,
  MaterialFolder,
  Subject,
  Topic,
} from "@/types/domain";

const DEMO_KEY = "uniflow:demo-data";

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
    assessments: parsed.assessments ?? [],
    assessmentTopics: parsed.assessmentTopics ?? [],
    materials: parsed.materials ?? [],
    materialFolders: parsed.materialFolders ?? [],
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

export async function loadAppData(): Promise<AppData> {
  if (!hasSupabaseEnv || !supabase) return readDemoData();

  const [
    subjects,
    demands,
    demandQuestions,
    demandQuestionItems,
    topics,
    assessments,
    assessmentTopics,
    materials,
    materialFolders,
  ] = await Promise.all([
    supabase.from("subjects").select("*").order("sort_order", { nullsFirst: false }).order("created_at"),
    supabase.from("demands").select("*").order("due_date", { nullsFirst: false }).order("created_at"),
    supabase.from("demand_questions").select("*").order("order_index"),
    supabase.from("demand_question_items").select("*").order("order_index"),
    supabase.from("topics").select("*").order("order_index"),
    supabase.from("assessments").select("*").order("date"),
    supabase.from("assessment_topics").select("*").order("created_at"),
    supabase.from("materials").select("*").order("created_at", { ascending: false }),
    supabase.from("material_folders").select("*").order("name"),
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
    assessments: assessments.data ?? [],
    assessmentTopics: assessmentTopics.data ?? [],
    materials: materials.data ?? [],
    materialFolders: materialFolders.error ? [] : materialFolders.data ?? [],
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
    data.assessmentTopics = data.assessmentTopics.filter((item) =>
      data.assessments.some((assessment) => assessment.id === item.assessment_id),
    );
    data.materials = data.materials.filter((item) => item.subject_id !== id);
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

export async function generateDemandQuestionSet(demandId: string, questionCount: number, itemLabels: string[]) {
  const cleanCount = Math.max(0, Math.floor(questionCount));
  const cleanLabels = itemLabels.map((label) => label.trim()).filter(Boolean);
  if (!cleanCount || !cleanLabels.length) return;

  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const existingCount = data.demandQuestions.filter((question) => question.demand_id === demandId).length;
    const questions: DemandQuestion[] = Array.from({ length: cleanCount }, (_, index) => ({
      id: crypto.randomUUID(),
      demand_id: demandId,
      label: `Questao ${existingCount + index + 1}`,
      difficulty: "media",
      notes: "",
      order_index: existingCount + index + 1,
      created_at: new Date().toISOString(),
    }));
    const items: DemandQuestionItem[] = questions.flatMap((question) =>
      cleanLabels.map((label, index) => ({
        id: crypto.randomUUID(),
        question_id: question.id,
        label,
        done: false,
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
  const { count, error: countError } = await supabase
    .from("demand_questions")
    .select("id", { count: "exact", head: true })
    .eq("demand_id", demandId)
    .eq("user_id", user_id);
  if (countError) throw countError;

  const existingCount = count ?? 0;
  const questions = Array.from({ length: cleanCount }, (_, index) => ({
    id: crypto.randomUUID(),
    user_id,
    demand_id: demandId,
    label: `Questao ${existingCount + index + 1}`,
    difficulty: "media",
    notes: "",
    order_index: existingCount + index + 1,
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

export async function saveAssessment(assessment: Assessment, topicIds?: string[]) {
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
  return data as Assessment;
}

export async function deleteAssessment(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.assessments = data.assessments.filter((item) => item.id !== id);
    data.assessmentTopics = data.assessmentTopics.filter((item) => item.assessment_id !== id);
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

export async function saveMaterialFolder(folder: MaterialFolder) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    const exists = data.materialFolders.some((item) => item.id === folder.id);
    data.materialFolders = exists
      ? data.materialFolders.map((item) => (item.id === folder.id ? folder : item))
      : [...data.materialFolders, folder];
    writeDemoData(data);
    return folder;
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

export async function deleteMaterialFolder(id: string) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.materialFolders = data.materialFolders.filter((item) => item.id !== id);
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
  const path = `${user_id}/${subjectId}/${crypto.randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from("subject-materials").upload(path, file, { upsert: false });
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

export async function deleteMaterial(material: Material) {
  if (!hasSupabaseEnv || !supabase) {
    const data = readDemoData();
    data.materials = data.materials.filter((item) => item.id !== material.id);
    writeDemoData(data);
    return;
  }

  if (material.type === "file" && material.file_path) {
    const remove = await supabase.storage.from("subject-materials").remove([material.file_path]);
    if (remove.error) throw remove.error;
  }
  const { error } = await supabase.from("materials").delete().eq("id", material.id);
  if (error) throw error;
}

export async function materialPublicUrl(material: Material) {
  if (material.type === "link") return material.url ?? "#";
  if (!hasSupabaseEnv || !supabase || !material.file_path) return "#";
  const signed = await supabase.storage.from("subject-materials").createSignedUrl(material.file_path, 60 * 10);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}
