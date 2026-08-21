"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteAssessment,
  deleteDemand,
  deleteMaterialFolder,
  deleteMaterial,
  deleteSubject,
  deleteTopic,
  generateDemandQuestionSet,
  loadAppData,
  materialPublicUrl,
  reorderSubjects as persistSubjectOrder,
  saveAssessment,
  saveDemand,
  saveDemandQuestion,
  saveDemandQuestionItem,
  saveMaterial,
  saveMaterialFolder,
  saveSubject,
  saveTopic,
  uploadMaterialFile,
} from "@/lib/repositories/uniflow-repository";
import type {
  AppData,
  Assessment,
  Demand,
  DemandQuestion,
  DemandQuestionItem,
  Material,
  MaterialFolder,
  Subject,
  Topic,
} from "@/types/domain";

type DataContextValue = AppData & {
  loading: boolean;
  refresh: () => Promise<void>;
  upsertSubject: (subject: Subject) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  reorderSubjects: (ids: string[]) => Promise<void>;
  upsertDemand: (demand: Demand) => Promise<void>;
  removeDemand: (id: string) => Promise<void>;
  completeDemand: (demand: Demand) => Promise<void>;
  upsertDemandQuestion: (question: DemandQuestion) => Promise<void>;
  upsertDemandQuestionItem: (item: DemandQuestionItem) => Promise<void>;
  generateDemandQuestions: (demandId: string, questionCount: number, itemLabels: string[]) => Promise<void>;
  upsertTopic: (topic: Topic) => Promise<void>;
  removeTopic: (id: string) => Promise<void>;
  upsertAssessment: (assessment: Assessment, topicIds?: string[]) => Promise<void>;
  removeAssessment: (id: string) => Promise<void>;
  upsertMaterial: (material: Material) => Promise<void>;
  upsertMaterialFolder: (folder: MaterialFolder) => Promise<void>;
  removeMaterialFolder: (id: string) => Promise<void>;
  uploadMaterialFile: (subjectId: string, file: File, name?: string, folderId?: string | null) => Promise<void>;
  removeMaterial: (material: Material) => Promise<void>;
  getMaterialUrl: (material: Material) => Promise<string>;
};

const DataContext = createContext<DataContextValue | null>(null);
const emptyData: AppData = {
  subjects: [],
  demands: [],
  demandQuestions: [],
  demandQuestionItems: [],
  topics: [],
  assessments: [],
  assessmentTopics: [],
  materials: [],
  materialFolders: [],
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const dataRef = useRef<AppData>(emptyData);
  const mutationQueues = useRef<Record<string, Promise<void>>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextData = await loadAppData();
    dataRef.current = nextData;
    setData(nextData);
    setLoading(false);
  }, []);

  function updateData(updater: (current: AppData) => AppData) {
    const nextData = updater(dataRef.current);
    dataRef.current = nextData;
    setData(nextData);
    return nextData;
  }

  function enqueueMutation(key: string, mutation: () => Promise<void>) {
    const previous = mutationQueues.current[key] ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(mutation);
    mutationQueues.current[key] = next.finally(() => {
      if (mutationQueues.current[key] === next) delete mutationQueues.current[key];
    });
    return next;
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const value = useMemo<DataContextValue>(
    () => ({
      ...data,
      loading,
      refresh,
      async upsertSubject(subject) {
        await saveSubject(subject);
        await refresh();
      },
      async removeSubject(id) {
        await deleteSubject(id);
        await refresh();
      },
      async reorderSubjects(ids) {
        await persistSubjectOrder(ids);
        await refresh();
      },
      async upsertDemand(demand) {
        await saveDemand(demand);
        await refresh();
      },
      async removeDemand(id) {
        await deleteDemand(id);
        await refresh();
      },
      async completeDemand(demand) {
        let previousDemand = demand;
        let nextDemand = demand;
        updateData((current) => {
          const currentDemand = current.demands.find((item) => item.id === demand.id) ?? demand;
          previousDemand = currentDemand;
          nextDemand = {
            ...currentDemand,
            status: currentDemand.status === "concluido" ? "pendente" : "concluido",
          };
          return {
            ...current,
            demands: current.demands.map((item) => (item.id === demand.id ? nextDemand : item)),
          };
        });
        try {
          await enqueueMutation(`demand:${demand.id}`, () => saveDemand(nextDemand).then(() => undefined));
        } catch (error) {
          updateData((current) => ({
            ...current,
            demands: current.demands.map((item) => (item.id === demand.id ? previousDemand : item)),
          }));
          throw error;
        }
      },
      async upsertDemandQuestion(question) {
        const previousQuestions = dataRef.current.demandQuestions;
        updateData((current) => {
          const exists = current.demandQuestions.some((item) => item.id === question.id);
          return {
            ...current,
            demandQuestions: exists
              ? current.demandQuestions.map((item) => (item.id === question.id ? question : item))
              : [...current.demandQuestions, question],
          };
        });
        try {
          await enqueueMutation(`demand-question:${question.id}`, () => saveDemandQuestion(question).then(() => undefined));
        } catch (error) {
          updateData((current) => ({ ...current, demandQuestions: previousQuestions }));
          throw error;
        }
      },
      async upsertDemandQuestionItem(item) {
        const previousItems = dataRef.current.demandQuestionItems;
        updateData((current) => {
          const exists = current.demandQuestionItems.some((currentItem) => currentItem.id === item.id);
          return {
            ...current,
            demandQuestionItems: exists
              ? current.demandQuestionItems.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
              : [...current.demandQuestionItems, item],
          };
        });
        try {
          await enqueueMutation(`demand-question-item:${item.id}`, () => saveDemandQuestionItem(item).then(() => undefined));
        } catch (error) {
          updateData((current) => ({ ...current, demandQuestionItems: previousItems }));
          throw error;
        }
      },
      async generateDemandQuestions(demandId, questionCount, itemLabels) {
        await generateDemandQuestionSet(demandId, questionCount, itemLabels);
        await refresh();
      },
      async upsertTopic(topic) {
        const previousTopics = dataRef.current.topics;
        updateData((current) => {
          const exists = current.topics.some((item) => item.id === topic.id);
          return {
            ...current,
            topics: exists
              ? current.topics.map((item) => (item.id === topic.id ? topic : item))
              : [...current.topics, topic],
          };
        });
        try {
          await enqueueMutation(`topic:${topic.id}`, () => saveTopic(topic).then(() => undefined));
        } catch (error) {
          updateData((current) => ({ ...current, topics: previousTopics }));
          throw error;
        }
      },
      async removeTopic(id) {
        await deleteTopic(id);
        await refresh();
      },
      async upsertAssessment(assessment, topicIds) {
        await saveAssessment(assessment, topicIds);
        await refresh();
      },
      async removeAssessment(id) {
        await deleteAssessment(id);
        await refresh();
      },
      async upsertMaterial(material) {
        await saveMaterial(material);
        await refresh();
      },
      async upsertMaterialFolder(folder) {
        await saveMaterialFolder(folder);
        await refresh();
      },
      async removeMaterialFolder(id) {
        await deleteMaterialFolder(id);
        await refresh();
      },
      async uploadMaterialFile(subjectId, file, name, folderId) {
        await uploadMaterialFile(subjectId, file, name, folderId);
        await refresh();
      },
      async removeMaterial(material) {
        await deleteMaterial(material);
        await refresh();
      },
      async getMaterialUrl(material) {
        return materialPublicUrl(material);
      },
    }),
    [data, loading, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useAppData precisa estar dentro de DataProvider.");
  return value;
}
