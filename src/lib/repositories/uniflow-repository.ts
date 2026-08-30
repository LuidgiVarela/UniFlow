import { mockData } from "@/lib/mock-data";
import { hasSupabaseEnv, supabase } from "@/lib/supabase/client";
import type {
  AppData,
  Assessment,
  AssessmentTopic,
  Demand,
  DemandQuestion,
  DemandQuestionItem,
  GradeComponent,
  Material,
  MaterialFolder,
  Subject,
  Topic,
} from "@/types/domain";

const DEMO_KEY = "uniflow:demo-data";
const MATERIAL_STORAGE_BUCKET = "subject-materials";
const MATERIAL_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

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
    gradeComponents,
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
    supabase.from("grade_components").select("*").order("created_at"),
    supabase.from("assessments").select("*").order("date"),
    supabase.from("assessment_topics").select("*").order("created_at"),
    supabase.from("materials").select("*").order("created_at", { ascending: false }),
    supabase.from("material_folders").select("*").order("sort_order", { nullsFirst: true }).order("name"),
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
    data.gradeComponents = data.gradeComponents.filter((item) => item.subject_id !== id);
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
      label: `Questão ${existingCount + index + 1}`,
      difficulty: "media",
      important: false,
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
    label: `Questão ${existingCount + index + 1}`,
    difficulty: "media",
    important: false,
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
    const sort_order = folder.sort_order ?? data.materialFolders.filter((item) => item.subject_id === folder.subject_id).length + 1;
    const nextFolder = { ...folder, sort_order };
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
  const signed = await supabase.storage.from(MATERIAL_STORAGE_BUCKET).createSignedUrl(material.file_path, 60 * 10);
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
