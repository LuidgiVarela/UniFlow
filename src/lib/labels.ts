import type {
  AssessmentStatus,
  AssessmentType,
  DemandPriority,
  DemandStatus,
  DemandType,
  SubjectStatus,
  TopicStatus,
} from "@/types/domain";

export const subjectStatusLabels: Record<SubjectStatus, string> = {
  tranquilo: "Tranquilo",
  atencao: "Atenção",
  prioridade: "Prioridade",
  atrasado: "Atrasado",
};

export const demandTypeLabels: Record<DemandType, string> = {
  prova: "Prova",
  trabalho: "Trabalho",
  lista: "Lista",
  exercicio: "Exercício",
  leitura: "Leitura",
  apresentacao: "Apresentação",
  outro: "Outro",
};

export const priorityLabels: Record<DemandPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const demandStatusLabels: Record<DemandStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export const topicStatusLabels: Record<TopicStatus, string> = {
  nao_iniciado: "Não iniciado",
  estudando: "Estudando",
  concluido: "Concluído",
};

export const assessmentTypeLabels: Record<AssessmentType, string> = {
  prova: "Prova",
  trabalho: "Trabalho",
  lista: "Lista",
  projeto: "Projeto",
  seminario: "Seminário",
  outro: "Outro",
};

export const assessmentStatusLabels: Record<AssessmentStatus, string> = {
  futura: "Futura",
  realizada: "Realizada",
  corrigida: "Corrigida",
};
