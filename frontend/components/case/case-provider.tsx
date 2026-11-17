"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/services/api";
import type { CaseRecord, Meta } from "@/types/api";

interface CaseContextValue {
  caseId: string;
  caseData: CaseRecord | null;
  meta: Meta | null;
  loading: boolean;
  error: string;
  setCaseData: React.Dispatch<React.SetStateAction<CaseRecord | null>>;
  refresh: () => Promise<CaseRecord | null>;
}

const CaseContext = React.createContext<CaseContextValue | null>(null);

export function CaseProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const caseId = params?.id || "";
  const [caseData, setCaseData] = React.useState<CaseRecord | null>(null);
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!caseId) return null;
    try {
      const result = await api.getCase(caseId);
      setCaseData(result.case);
      setError("");
      return result.case;
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取案件。");
      return null;
    }
  }, [caseId]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([api.getCase(caseId), api.getMeta()]).then(([caseResult, metaResult]) => {
      if (!active) return;
      if (caseResult.status === "fulfilled") {
        setCaseData(caseResult.value.case);
      } else {
        const err = caseResult.reason;
        setError(
          err instanceof ApiError
            ? err.message
            : "无法连接本地服务，请确认后端已启动（http://127.0.0.1:8000）。",
        );
      }
      if (metaResult.status === "fulfilled") setMeta(metaResult.value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [caseId]);

  return (
    <CaseContext.Provider
      value={{ caseId, caseData, meta, loading, error, setCaseData, refresh }}
    >
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const context = React.useContext(CaseContext);
  if (!context) throw new Error("useCase must be used inside CaseProvider");
  return context;
}
