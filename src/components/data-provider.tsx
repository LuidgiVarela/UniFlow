"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteAssessment,
  deleteDemand,
  deleteDemandQuestionItem,
  deleteMaterialFolder,
  deleteMaterial,
  deleteSubject,
  deleteTopic,
  generateDemandQuestionSet,
  loadAppData,
  materialPublicUrl,
  reorderMaterials as persistMaterialOrder,
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
  loadError: string | null;
  refresh: (showLoading?: boolean) => Promise<void>;
  upsertSubject: (subject: Subject) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  reorderSubjects: (ids: string[]) => Promise<void>;
  upsertDemand: (demand: Demand) => Promise<void>;
  removeDemand: (id: string) => Promise<void>;
  completeDemand: (demand: Demand) => Promise<void>;
  upsertDemandQuestion: (question: DemandQuestion) => Promise<void>;
  upsertDemandQuestionItem: (item: DemandQuestionItem) => Promise<void>;
  removeDemandQuestionItem: (id: string) => Promise<void>;
  generateDemandQuestions: (demandId: string, questionCount: number, itemLabels: string[]) => Promise<void>;
  upsertTopic: (topic: Topic) => Promise<void>;
  removeTopic: (id: string) => Promise<void>;
  upsertAssessment: (assessment: Assessment, topicIds?: string[]) => Promise<void>;
  removeAssessment: (id: string) => Promise<void>;
  upsertMaterial: (material: Material) => Promise<void>;
  upsertMaterialFolder: (folder: MaterialFolder) => Promise<void>;
  removeMaterialFolder: (id: string) => Promise<void>;
  uploadMaterialFile: (subjectId: string, file: File, name?: string, folderId?: string | null) => Promise<void>;
  uploadMaterialFiles: (subjectId: string, files: File[], folderId?: string | null) => Promise<void>;
  reorderMaterials: (materials: Material[]) => Promise<void>;
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

function isCompletelyEmpty(data: AppData) {
  return Object.values(data).every((items) => Array.isArray(items) && items.length === 0);
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const dataRef = useRef<AppData>(emptyData);
  const loadedOnceRef = useRef(false);
  const emptyRetryRef = useRef(false);
  const retryShowLoadingRef = useRef(true);
  const mutationQueues = useRef<Record<string, Promise<void>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const scheduleRetry = useCallback((showLoading: boolean, delay: number) => {
    retryShowLoadingRef.current = showLoading;
    window.setTimeout(() => {
      setRetryToken((current) => current + 1);
    }, delay);
  }, []);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const nextData = await loadAppData();
      dataRef.current = nextData;
      setData(nextData);
      if (!loadedOnceRef.current && !emptyRetryRef.current && isCompletelyEmpty(nextData)) {
        emptyRetryRef.current = true;
        scheduleRetry(false, 1600);
      }
      loadedOnceRef.current = true;
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar seus dados.";
      if (!loadedOnceRef.current) {
        setLoadError(message);
        if (showLoading) {
          scheduleRetry(true, 1800);
        }
      }
      throw error;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [scheduleRetry]);

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
    const showLoading = retryToken === 0 ? true : retryShowLoadingRef.current;
    void Promise.resolve().then(() => refresh(showLoading).catch(() => undefined));
  }, [refresh, retryToken]);

  const value = useMemo<DataContextValue>(
    () => ({
      ...data,
      loading,
      loadError,
      refresh,
      async upsertSubject(subject) {
        const previousSubjects = dataRef.current.subjects;
        updateData((current) => {
          const exists = current.subjects.some((item) => item.id === subject.id);
          return {
            ...current,
            subjects: exists
              ? current.subjects.map((item) => (item.id === subject.id ? subject : item))
              : [...current.subjects, subject],
          };
        });
        try {
          await enqueueMutation(`subject:${subject.id}`, () => saveSubject(subject).then(() => undefined));
        } catch (error) {
          updateData((current) => ({ ...current, subjects: previousSubjects }));
          throw error;
        }
      },
      async removeSubject(id) {
        await deleteSubject(id);
        await refresh(false);
      },
      async reorderSubjects(ids) {
        await persistSubjectOrder(ids);
        await refresh(false);
      },
      async upsertDemand(demand) {
        await saveDemand(demand);
        await refresh(false);
      },
      async removeDemand(id) {
        await deleteDemand(id);
        await refresh(false);
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
      async removeDemandQuestionItem(id) {
        const previousItems = dataRef.current.demandQuestionItems;
        updateData((current) => ({
          ...current,
          demandQuestionItems: current.demandQuestionItems.filter((item) => item.id !== id),
        }));
        try {
          await deleteDemandQuestionItem(id);
        } catch (error) {
          updateData((current) => ({ ...current, demandQuestionItems: previousItems }));
          throw error;
        }
      },
      async generateDemandQuestions(demandId, questionCount, itemLabels) {
        await generateDemandQuestionSet(demandId, questionCount, itemLabels);
        await refresh(false);
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
        await refresh(false);
      },
      async upsertAssessment(assessment, topicIds) {
        await saveAssessment(assessment, topicIds);
        await refresh(false);
      },
      async removeAssessment(id) {
        await deleteAssessment(id);
        await refresh(false);
      },
      async upsertMaterial(material) {
        await saveMaterial(material);
        await refresh(false);
      },
      async upsertMaterialFolder(folder) {
        await saveMaterialFolder(folder);
        await refresh(false);
      },
      async removeMaterialFolder(id) {
        await deleteMaterialFolder(id);
        await refresh(false);
      },
      async uploadMaterialFile(subjectId, file, name, folderId) {
        await uploadMaterialFile(subjectId, file, name, folderId);
        await refresh(false);
      },
      async uploadMaterialFiles(subjectId, files, folderId) {
        try {
          await Promise.all(files.map((file) => uploadMaterialFile(subjectId, file, undefined, folderId)));
        } finally {
          await refresh(false);
        }
      },
      async reorderMaterials(materials) {
        const previousMaterials = dataRef.current.materials;
        const updates = new Map(materials.map((material) => [material.id, material]));
        updateData((current) => ({
          ...current,
          materials: current.materials.map((material) => updates.get(material.id) ?? material),
        }));
        try {
          await persistMaterialOrder(materials);
        } catch (error) {
          updateData((current) => ({ ...current, materials: previousMaterials }));
          throw error;
        }
      },
      async removeMaterial(material) {
        await deleteMaterial(material);
        await refresh(false);
      },
      async getMaterialUrl(material) {
        return materialPublicUrl(material);
      },
    }),
    [data, loadError, loading, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useAppData precisa estar dentro de DataProvider.");
  return value;
}
