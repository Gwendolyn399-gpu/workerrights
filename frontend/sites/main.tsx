import * as React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import "../app/globals.css";
import HomePage from "../app/page";
import CasesPage from "../app/cases/page";
import CaseLayout from "../app/case/[id]/layout";
import ChatPage from "../app/case/[id]/page";
import AnalysisPage from "../app/case/[id]/analysis/page";
import ActionPlanPage from "../app/case/[id]/action-plan/page";
import FormAssistantPage from "../app/case/[id]/form-assistant/page";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/case/:id" element={<CaseLayout><Outlet /></CaseLayout>}>
          <Route index element={<ChatPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="action-plan" element={<ActionPlanPage />} />
          <Route path="form-assistant" element={<FormAssistantPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
