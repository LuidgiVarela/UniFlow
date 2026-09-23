"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  addAssessmentTopics as persistAssessmentTopics,
  deleteAssessment,
  deleteDemand,
  deleteDemandQuestionItem,
  deleteDemandQuestions,
  deleteGradeComponent,
  deleteMaterialFolder,
  deleteMaterial,
  deleteSubject,
  deleteTopic,
  generateDemandQuestionSet,
  getMaterialStorageUsage,
  loadAppData,
  materialPublicUrl,
  replaceMaterialFile as persistMaterialFileReplacement,
  replaceTopicPrerequisites as persistTopicPrerequisites,
  reorderMaterials as persistMaterialOrder,
  reorderMaterialFolders as persistMaterialFolderOrder,
  reorderSubjects as persistSubjectOrder,
  saveAssessment,
  saveAssessmentMaterialProgress,
  saveDemand,
  saveDemandQuestion,
  saveDemandQuestionItem,
  saveGradeComponent,
  saveMaterial,
  saveMaterialFolder,
  saveReviewDayPlan,
  saveReviewEvent,
  saveReviewQueueItem,
  saveSubject,
  saveSubjectClassProgress,
  saveTopic,
  uploadMaterialFile,
} from "@/lib/repositories/uniflow-repository";
import type {
  AppData,
  Assessment,
  AssessmentMaterial,
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
  Topic,
} from "@/types/domain";
import type { MaterialStorageUsage } from "@/lib/repositories/uniflow-repository";

const MIN_OPERATION_FEEDBACK_MS = 360;

type DataContextValue = AppData & {
  loading: boolean;
  loadError: string | null;
  pendingOperations: Readonly<Record<string, string>>;
  operationError: string | null;
  clearOperationError: () => void;
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
  removeDemandQuestions: (ids: string[]) => Promise<void>;
  generateDemandQuestions: (
    demandId: string,
    questionCount: number,
    itemLabels: string[],
    requestedStart?: 0 | 1,
    requestedLabels?: string[],
  ) => Promise<void>;
  upsertTopic: (topic: Topic) => Promise<void>;
  removeTopic: (id: string) => Promise<void>;
  upsertAssessment: (assessment: Assessment, topicIds?: string[], materialIds?: string[]) => Promise<void>;
  addAssessmentTopics: (assessmentId: string, topicIds: string[]) => Promise<void>;
  upsertAssessmentMaterialProgress: (item: AssessmentMaterial) => Promise<void>;
  addReviewEvent: (event: ReviewEvent) => Promise<void>;
  upsertReviewDayPlan: (plan: ReviewDayPlan) => Promise<void>;
  upsertReviewQueueItem: (item: ReviewQueueItem) => Promise<void>;
  setTopicPrerequisites: (topicId: string, prerequisiteIds: string[]) => Promise<void>;
  upsertSubjectClassProgress: (progress: SubjectClassProgress) => Promise<void>;
  removeAssessment: (id: string) => Promise<void>;
  upsertGradeComponent: (component: GradeComponent) => Promise<void>;
  removeGradeComponent: (id: string) => Promise<void>;
  upsertMaterial: (material: Material) => Promise<void>;
  upsertMaterialFolder: (folder: MaterialFolder) => Promise<void>;
  removeMaterialFolder: (id: string) => Promise<void>;
  reorderMaterialFolders: (folders: MaterialFolder[]) => Promise<void>;
  uploadMaterialFile: (subjectId: string, file: File, name?: string, folderId?: string | null) => Promise<void>;
  replaceMaterialFile: (material: Material, file: File) => Promise<void>;
  uploadMaterialFiles: (subjectId: string, files: File[], folderId?: string | null) => Promise<void>;
  reorderMaterials: (materials: Material[]) => Promise<void>;
  removeMaterial: (material: Material) => Promise<void>;
  getMaterialUrl: (material: Material) => Promise<string>;
  getStorageUsage: () => Promise<MaterialStorageUsage>;
};

const DataContext = createContext<DataContextValue | null>(null);
const emptyData: AppData = {
  subjects: [],
  demands: [],
  demandQuestions: [],
  demandQuestionItems: [],
  topics: [],
  gradeComponents: [],
  assessments: [],
  assessmentTopics: [],
  assessmentMaterials: [],
  reviewEvents: [],
  reviewDayPlans: [],
  reviewQueueItems: [],
  topicPrerequisites: [],
  materials: [],
  materialFolders: [],
  subjectClassProgress: [],
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
  const operationTokens = useRef<Record<string, symbol>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingOperations, setPendingOperations] = useState<Record<string, string>>({});
  const [operationError, setOperationError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const clearOperationError = useCallback(() => setOperationError(null), []);

  const trackOperation = useCallback(async (
    key: string,
    label: string,
    operation: () => Promise<void>,
  ) => {
    const startedAt = Date.now();
    const token = Symbol(key);
    operationTokens.current[key] = token;
    setOperationError(null);
    setPendingOperations((current) => ({ ...current, [key]: label }));
    try {
      await operation();
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Não foi possível concluir a alteração.";
      setOperationError(message);
      throw error;
    } finally {
      const remainingFeedbackTime = MIN_OPERATION_FEEDBACK_MS - (Date.now() - startedAt);
      const clearPendingOperation = () => {
        if (operationTokens.current[key] !== token) return;
        delete operationTokens.current[key];
        setPendingOperations((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      };
      if (remainingFeedbackTime > 0) window.setTimeout(clearPendingOperation, remainingFeedbackTime);
      else clearPendingOperation();
    }
  }, []);

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
      pendingOperations,
      operationError,
      clearOperationError,
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
        await trackOperation(`delete:subject:${id}`, "Excluindo matéria...", async () => {
          await deleteSubject(id);
          await refresh(false);
        });
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
        await trackOperation(`delete:demand:${id}`, "Excluindo tarefa...", async () => {
          await deleteDemand(id);
          await refresh(false);
        });
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
        await trackOperation(`delete:demand-question-item:${id}`, "Excluindo item...", async () => {
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
        });
      },
      async removeDemandQuestions(ids) {
        const idSet = new Set(ids);
        if (!idSet.size) return;
        const previousQuestions = dataRef.current.demandQuestions;
        const previousItems = dataRef.current.demandQuestionItems;
        const operationId = ids[0] ?? "batch";
        await trackOperation(`delete:demand-question-batch:${operationId}`, "Desfazendo adição...", async () => {
          updateData((current) => ({
            ...current,
            demandQuestions: current.demandQuestions.filter((question) => !idSet.has(question.id)),
            demandQuestionItems: current.demandQuestionItems.filter((item) => !idSet.has(item.question_id)),
          }));
          try {
            await deleteDemandQuestions(ids);
          } catch (error) {
            updateData((current) => ({
              ...current,
              demandQuestions: previousQuestions,
              demandQuestionItems: previousItems,
            }));
            throw error;
          }
        });
      },
      async generateDemandQuestions(demandId, questionCount, itemLabels, requestedStart, requestedLabels) {
        await generateDemandQuestionSet(demandId, questionCount, itemLabels, requestedStart, requestedLabels);
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
        await trackOperation(`delete:topic:${id}`, "Excluindo conteúdo...", async () => {
          await deleteTopic(id);
          await refresh(false);
        });
      },
      async upsertAssessment(assessment, topicIds, materialIds) {
        await saveAssessment(assessment, topicIds, materialIds);
        await refresh(false);
      },
      async addAssessmentTopics(assessmentId, topicIds) {
        if (!topicIds.length) return;
        await persistAssessmentTopics(assessmentId, topicIds);
        updateData((current) => {
          const existing = new Set(
            current.assessmentTopics
              .filter((item) => item.assessment_id === assessmentId)
              .map((item) => item.topic_id),
          );
          return {
            ...current,
            assessmentTopics: [
              ...current.assessmentTopics,
              ...topicIds.filter((topicId) => !existing.has(topicId)).map((topic_id) => ({
                assessment_id: assessmentId,
                topic_id,
              })),
            ],
          };
        });
      },
      async upsertAssessmentMaterialProgress(item) {
        const previousItems = dataRef.current.assessmentMaterials;
        updateData((current) => {
          const exists = current.assessmentMaterials.some(
            (currentItem) => currentItem.assessment_id === item.assessment_id
              && currentItem.material_id === item.material_id,
          );
          return {
            ...current,
            assessmentMaterials: exists
              ? current.assessmentMaterials.map((currentItem) => (
                currentItem.assessment_id === item.assessment_id
                  && currentItem.material_id === item.material_id
                  ? item
                  : currentItem
              ))
              : [...current.assessmentMaterials, item],
          };
        });
        try {
          await enqueueMutation(
            `assessment-material:${item.assessment_id}:${item.material_id}`,
            () => saveAssessmentMaterialProgress(item).then(() => undefined),
          );
        } catch (error) {
          updateData((current) => ({ ...current, assessmentMaterials: previousItems }));
          throw error;
        }
      },
      async addReviewEvent(event) {
        const previousEvents = dataRef.current.reviewEvents;
        updateData((current) => ({
          ...current,
          reviewEvents: [event, ...current.reviewEvents.filter((item) => item.id !== event.id)],
        }));
        try {
          await enqueueMutation(`review-event:${event.id}`, () => saveReviewEvent(event).then(() => undefined));
        } catch (error) {
          updateData((current) => ({ ...current, reviewEvents: previousEvents }));
          throw error;
        }
      },
      async upsertReviewDayPlan(plan) {
        const previousPlans = dataRef.current.reviewDayPlans;
        updateData((current) => {
          const exists = current.reviewDayPlans.some((item) => item.plan_date === plan.plan_date);
          return {
            ...current,
            reviewDayPlans: exists
              ? current.reviewDayPlans.map((item) => (item.plan_date === plan.plan_date ? plan : item))
              : [...current.reviewDayPlans, plan],
          };
        });
        try {
          await enqueueMutation(`review-day-plan:${plan.plan_date}`, () => saveReviewDayPlan(plan).then(() => undefined));
        } catch (error) {
          updateData((current) => ({ ...current, reviewDayPlans: previousPlans }));
          throw error;
        }
      },
      async upsertReviewQueueItem(item) {
        const previousItems = dataRef.current.reviewQueueItems;
        updateData((current) => {
          const existingIndex = current.reviewQueueItems.findIndex((currentItem) => (
            currentItem.queue_date === item.queue_date && currentItem.target_key === item.target_key
          ));
          return {
            ...current,
            reviewQueueItems: existingIndex >= 0
              ? current.reviewQueueItems.map((currentItem, index) => index === existingIndex ? item : currentItem)
              : [...current.reviewQueueItems, item],
          };
        });
        try {
          await enqueueMutation(
            `review-queue:${item.queue_date}:${item.target_key}`,
            () => saveReviewQueueItem(item).then(() => undefined),
          );
        } catch (error) {
          updateData((current) => ({ ...current, reviewQueueItems: previousItems }));
          throw error;
        }
      },
      async setTopicPrerequisites(topicId, prerequisiteIds) {
        const previousItems = dataRef.current.topicPrerequisites;
        updateData((current) => ({
          ...current,
          topicPrerequisites: [
            ...current.topicPrerequisites.filter((item) => item.topic_id !== topicId),
            ...prerequisiteIds.map((prerequisite_topic_id) => ({ topic_id: topicId, prerequisite_topic_id })),
          ],
        }));
        try {
          await enqueueMutation(
            `topic-prerequisites:${topicId}`,
            () => persistTopicPrerequisites(topicId, prerequisiteIds),
          );
        } catch (error) {
          updateData((current) => ({ ...current, topicPrerequisites: previousItems }));
          throw error;
        }
      },
      async upsertSubjectClassProgress(progress) {
        const previousItems = dataRef.current.subjectClassProgress;
        updateData((current) => {
          const exists = current.subjectClassProgress.some((item) => item.subject_id === progress.subject_id);
          return {
            ...current,
            subjectClassProgress: exists
              ? current.subjectClassProgress.map((item) => item.subject_id === progress.subject_id ? progress : item)
              : [...current.subjectClassProgress, progress],
          };
        });
        try {
          await enqueueMutation(
            `subject-class-progress:${progress.subject_id}`,
            () => saveSubjectClassProgress(progress).then(() => undefined),
          );
        } catch (error) {
          updateData((current) => ({ ...current, subjectClassProgress: previousItems }));
          throw error;
        }
      },
      async removeAssessment(id) {
        await trackOperation(`delete:assessment:${id}`, "Excluindo avaliação...", async () => {
          await deleteAssessment(id);
          await refresh(false);
        });
      },
      async upsertGradeComponent(component) {
        await saveGradeComponent(component);
        await refresh(false);
      },
      async removeGradeComponent(id) {
        await trackOperation(`delete:grade-component:${id}`, "Excluindo critério...", async () => {
          await deleteGradeComponent(id);
          await refresh(false);
        });
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
        await trackOperation(`delete:material-folder:${id}`, "Excluindo pasta...", async () => {
          await deleteMaterialFolder(id);
          await refresh(false);
        });
      },
      async reorderMaterialFolders(folders) {
        const previousFolders = dataRef.current.materialFolders;
        const updates = new Map(folders.map((folder) => [folder.id, folder]));
        updateData((current) => ({
          ...current,
          materialFolders: current.materialFolders.map((folder) => updates.get(folder.id) ?? folder),
        }));
        try {
          await persistMaterialFolderOrder(folders);
        } catch (error) {
          updateData((current) => ({ ...current, materialFolders: previousFolders }));
          throw error;
        }
      },
      async uploadMaterialFile(subjectId, file, name, folderId) {
        await uploadMaterialFile(subjectId, file, name, folderId);
        await refresh(false);
      },
      async replaceMaterialFile(material, file) {
        await persistMaterialFileReplacement(material, file);
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
        await trackOperation(`delete:material:${material.id}`, "Excluindo material...", async () => {
          await deleteMaterial(material);
          await refresh(false);
        });
      },
      async getMaterialUrl(material) {
        return materialPublicUrl(material);
      },
      async getStorageUsage() {
        return getMaterialStorageUsage();
      },
    }),
    [clearOperationError, data, loadError, loading, operationError, pendingOperations, refresh, trackOperation],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useAppData precisa estar dentro de DataProvider.");
  return value;
}
