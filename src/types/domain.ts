export type SubjectStatus = "tranquilo" | "atencao" | "prioridade" | "atrasado";
export type DemandType =
  | "prova"
  | "trabalho"
  | "lista"
  | "exercicio"
  | "leitura"
  | "apresentacao"
  | "outro";
export type DemandPriority = "baixa" | "media" | "alta" | "urgente";
export type DemandStatus = "pendente" | "em_andamento" | "concluido";
export type DemandQuestionDifficulty = "facil" | "media" | "dificil";
export type TopicStatus = "nao_iniciado" | "estudando" | "concluido";
export type AssessmentType = "prova" | "trabalho" | "lista" | "projeto" | "seminario" | "outro";
export type AssessmentStatus = "futura" | "realizada" | "corrigida";

export type Subject = {
  id: string;
  user_id?: string;
  name: string;
  code: string;
  professor?: string | null;
  color: string;
  status: SubjectStatus;
  notes?: string | null;
  classroom?: string | null;
  schedule?: string | null;
  total_classes?: number | null;
  professor_progress?: number | null;
  student_progress?: number | null;
  professor_position?: string | null;
  student_position?: string | null;
  sort_order?: number | null;
  created_at?: string;
};

export type Demand = {
  id: string;
  user_id?: string;
  subject_id: string;
  title: string;
  type: DemandType;
  description?: string | null;
  due_date: string | null;
  priority: DemandPriority;
  status: DemandStatus;
  total_items?: number | null;
  completed_items?: number | null;
  created_at: string;
};

export type DemandQuestion = {
  id: string;
  user_id?: string;
  demand_id: string;
  label: string;
  difficulty: DemandQuestionDifficulty;
  notes?: string | null;
  order_index: number;
  created_at: string;
};

export type DemandQuestionItem = {
  id: string;
  user_id?: string;
  question_id: string;
  label: string;
  done: boolean;
  order_index: number;
  created_at: string;
};

export type Topic = {
  id: string;
  user_id?: string;
  subject_id: string;
  title: string;
  status: TopicStatus;
  order_index: number;
  notes?: string | null;
  created_at?: string;
};

export type Assessment = {
  id: string;
  user_id?: string;
  subject_id: string;
  name: string;
  type: AssessmentType;
  date: string | null;
  weight: number | null;
  max_score: number | null;
  score: number | null;
  description?: string | null;
  status: AssessmentStatus;
  created_at: string;
};

export type AssessmentTopic = {
  assessment_id: string;
  topic_id: string;
  user_id?: string;
  created_at?: string;
};

export type MaterialType = "file" | "link";

export type MaterialFolder = {
  id: string;
  user_id?: string;
  subject_id: string;
  name: string;
  created_at: string;
};

export type Material = {
  id: string;
  user_id?: string;
  subject_id: string;
  folder_id?: string | null;
  name: string;
  type: MaterialType;
  file_path?: string | null;
  url?: string | null;
  created_at: string;
};

export type AppData = {
  subjects: Subject[];
  demands: Demand[];
  demandQuestions: DemandQuestion[];
  demandQuestionItems: DemandQuestionItem[];
  topics: Topic[];
  assessments: Assessment[];
  assessmentTopics: AssessmentTopic[];
  materials: Material[];
  materialFolders: MaterialFolder[];
};
