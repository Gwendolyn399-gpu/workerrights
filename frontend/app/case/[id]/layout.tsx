import { CaseProvider } from "@/components/case/case-provider";
import { CaseShell } from "@/components/case/case-shell";

export default function CaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <CaseProvider>
      <CaseShell>{children}</CaseShell>
    </CaseProvider>
  );
}
