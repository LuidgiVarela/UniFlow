import { toIsoDate } from "@/lib/date";
import type { AppData } from "@/types/domain";

const today = new Date();
const plus = (days: number) => {
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  return toIsoDate(date);
};

export const mockData: AppData = {
  subjects: [
    {
      id: "sub-lp",
      name: "Linguagens de Programação",
      code: "LP",
      color: "#2f7dd1",
      status: "atencao",
      sort_order: 1,
    },
    {
      id: "sub-sstd",
      name: "Sinais e Sistemas",
      code: "SSTD",
      color: "#168f72",
      status: "prioridade",
      sort_order: 2,
    },
    {
      id: "sub-oac",
      name: "Organização e Arquitetura de Computadores",
      code: "OAC",
      color: "#b45f2a",
      status: "tranquilo",
      sort_order: 3,
    },
  ],
  demands: [
    {
      id: "dem-1",
      subject_id: "sub-sstd",
      title: "Terminar questões 4-8 da Lista 1",
      type: "lista",
      due_date: plus(1),
      priority: "alta",
      status: "em_andamento",
      total_items: 10,
      completed_items: 4,
      created_at: new Date().toISOString(),
    },
    {
      id: "dem-2",
      subject_id: "sub-lp",
      title: "Revisar recursão e guards",
      type: "exercicio",
      due_date: null,
      priority: "media",
      status: "pendente",
      created_at: new Date().toISOString(),
    },
    {
      id: "dem-3",
      subject_id: "sub-oac",
      title: "Revisar slides pendentes",
      type: "leitura",
      due_date: plus(4),
      priority: "baixa",
      status: "pendente",
      created_at: new Date().toISOString(),
    },
  ],
  demandQuestions: [],
  demandQuestionItems: [],
  topics: [
    { id: "top-lp-1", subject_id: "sub-lp", title: "Paradigmas de programação", status: "concluido", order_index: 1 },
    { id: "top-lp-2", subject_id: "sub-lp", title: "Funções", status: "concluido", order_index: 2 },
    { id: "top-lp-3", subject_id: "sub-lp", title: "Recursão", status: "concluido", order_index: 3 },
    { id: "top-lp-4", subject_id: "sub-lp", title: "Guards", status: "estudando", order_index: 4 },
    { id: "top-lp-5", subject_id: "sub-lp", title: "Listas", status: "nao_iniciado", order_index: 5 },
    { id: "top-lp-6", subject_id: "sub-lp", title: "Tuplas", status: "nao_iniciado", order_index: 6 },
    { id: "top-lp-7", subject_id: "sub-lp", title: "Funções de alta ordem", status: "nao_iniciado", order_index: 7 },
    { id: "top-1", subject_id: "sub-sstd", title: "Sinais e sistemas", status: "concluido", order_index: 1 },
    { id: "top-2", subject_id: "sub-sstd", title: "Sistemas LTI", status: "estudando", order_index: 2 },
    { id: "top-3", subject_id: "sub-sstd", title: "Convolução", status: "nao_iniciado", order_index: 3 },
  ],
  assessments: [
    {
      id: "ass-1",
      subject_id: "sub-lp",
      name: "P1",
      type: "prova",
      score: null,
      max_score: 10,
      weight: 30,
      date: plus(12),
      description: "Primeira prova da disciplina.",
      status: "futura",
      created_at: new Date().toISOString(),
    },
    {
      id: "ass-2",
      subject_id: "sub-oac",
      name: "Lista 1",
      type: "lista",
      score: 8.5,
      max_score: 10,
      weight: 15,
      date: plus(-3),
      description: "Resultado ja corrigido.",
      status: "corrigida",
      created_at: new Date().toISOString(),
    },
  ],
  assessmentTopics: [
    { assessment_id: "ass-1", topic_id: "top-lp-2" },
    { assessment_id: "ass-1", topic_id: "top-lp-3" },
    { assessment_id: "ass-1", topic_id: "top-lp-4" },
    { assessment_id: "ass-1", topic_id: "top-lp-5" },
  ],
  materials: [
    {
      id: "mat-1",
      subject_id: "sub-lp",
      name: "Playlist de revisão",
      type: "link",
      url: "https://example.com",
      file_path: null,
      created_at: new Date().toISOString(),
    },
  ],
  materialFolders: [],
};
