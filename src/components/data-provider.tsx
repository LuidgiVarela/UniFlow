"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  deleteAssessment,
  deleteDemand,
  deleteMaterialFolder,
  deleteMaterial,
  deleteSubject,
  deleteTopic,
  loadAppData,
  materialPublicUrl,
  reorderSubjects as persistSubjectOrder,
  saveAssessment,
  saveDemand,
  saveMaterial,
  saveMaterialFolder,
  saveSubject,
  saveTopic,
  uploadMaterialFile,
} from "@/lib/repositories/uniflow-repository";
import type { AppData, Assessment, Demand, Material, MaterialFolder, Subject, Topic } from "@/types/domain";

type DataContextValue = AppData & {
  loading: boolean;
  refresh: () => Promise<void>;
  upsertSubject: (subject: Subject) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  reorderSubjects: (ids: string[]) => Promise<void>;
  upsertDemand: (demand: Demand) => Promise<void>;
  removeDemand: (id: string) => Promise<void>;
  completeDemand: (demand: Demand) => Promise<void>;
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
  topics: [],
  assessments: [],
  assessmentTopics: [],
  materials: [],
  materialFolders: [],
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setData(await loadAppData());
    setLoading(false);
  }, []);

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
        const nextDemand: Demand = {
          ...demand,
          status: demand.status === "concluido" ? "pendente" : "concluido",
        };
        setData((current) => ({
          ...current,
          demands: current.demands.map((item) => (item.id === demand.id ? nextDemand : item)),
        }));
        try {
          await saveDemand(nextDemand);
          await refresh();
        } catch (error) {
          setData((current) => ({
            ...current,
            demands: current.demands.map((item) => (item.id === demand.id ? demand : item)),
          }));
          throw error;
        }
      },
      async upsertTopic(topic) {
        await saveTopic(topic);
        await refresh();
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
