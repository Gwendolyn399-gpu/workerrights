"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, getRegions, type RegionTree } from "@/services/api";
import type { CaseFacts } from "@/types/api";

const EVIDENCE_FALLBACK = [
  { key: "chat", label: "微信/短信聊天记录" },
  { key: "attendance", label: "考勤/打卡记录" },
  { key: "wage_sheet", label: "工资表/结算单" },
  { key: "transfer", label: "转账记录" },
  { key: "iou", label: "欠条" },
  { key: "photos", label: "工作照片/视频" },
  { key: "badge", label: "工牌/门禁卡" },
  { key: "witness", label: "工友证言" },
  { key: "recording", label: "通话录音" },
  { key: "contract", label: "书面合同/协议" },
  { key: "other", label: "其他材料" },
];

type FormState = Record<string, string | string[]>;

export function FactsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { caseId, caseData, meta, setCaseData } = useCase();
  const [form, setForm] = React.useState<FormState>({});
  const [regions, setRegions] = React.useState<RegionTree | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !caseData) return;
    const facts = caseData.facts;
    setForm({
      location_city: facts.location_city || "",
      location_district: facts.location_district || "",
      location_detail: facts.location_detail || "",
      project_name: facts.project_name || "",
      developer_name: facts.developer_name || "",
      contractor_name: facts.contractor_name || "",
      subcontractor_name: facts.subcontractor_name || "",
      work_type: facts.work_type || "",
      work_start: facts.work_start || "",
      work_end: facts.work_end || "",
      duration_text: facts.duration_text || "",
      recruiter_type: facts.recruiter_type || "",
      recruiter_name: facts.recruiter_name || "",
      manager_role: facts.manager_role || "",
      wage_basis: facts.wage_basis || "",
      daily_wage: facts.daily_wage !== null && facts.daily_wage !== undefined ? String(facts.daily_wage) : "",
      monthly_wage: facts.monthly_wage !== null && facts.monthly_wage !== undefined ? String(facts.monthly_wage) : "",
      agreed_amount: facts.agreed_amount !== null && facts.agreed_amount !== undefined ? String(facts.agreed_amount) : "",
      paid_amount: facts.paid_amount !== null && facts.paid_amount !== undefined ? String(facts.paid_amount) : "",
      owed_amount: facts.owed_amount !== null && facts.owed_amount !== undefined ? String(facts.owed_amount) : "",
      has_contract: facts.has_contract || "",
      evidence: facts.evidence || [],
      prior_report: facts.prior_report || "",
      notes: facts.notes || "",
    });
    setError("");
    getRegions()
      .then(setRegions)
      .catch(() => setRegions(null));
  }, [open, caseData]);

  const cityOptions = regions?.cities || [];
  const selectedCity = cityOptions.find((city) => city.name === form.location_city);
  const evidenceOptions = meta?.evidence_catalog?.length
    ? meta.evidence_catalog.map((item) => ({ key: item.key, label: item.label }))
    : EVIDENCE_FALLBACK;

  const setValue = (key: string, value: string | string[]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleEvidence = (key: string) => {
    const current = Array.isArray(form.evidence) ? form.evidence : [];
    setValue(
      "evidence",
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const numeric = (key: string) => {
      const value = form[key];
      if (typeof value !== "string" || value.trim() === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const text = (key: string) => {
      const value = form[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const payload = {
      location_city: text("location_city"),
      location_district: text("location_district"),
      location_detail: text("location_detail"),
      project_name: text("project_name"),
      developer_name: text("developer_name"),
      contractor_name: text("contractor_name"),
      subcontractor_name: text("subcontractor_name"),
      work_type: text("work_type"),
      work_start: text("work_start"),
      work_end: text("work_end"),
      duration_text: text("duration_text"),
      recruiter_type: text("recruiter_type"),
      recruiter_name: text("recruiter_name"),
      manager_role: text("manager_role"),
      wage_basis: text("wage_basis"),
      daily_wage: numeric("daily_wage"),
      monthly_wage: numeric("monthly_wage"),
      agreed_amount: numeric("agreed_amount"),
      paid_amount: numeric("paid_amount"),
      owed_amount: numeric("owed_amount"),
      has_contract: text("has_contract"),
      evidence: Array.isArray(form.evidence) ? form.evidence : [],
      prior_report: text("prior_report"),
      notes: text("notes"),
    };
    try {
      const result = await api.updateFacts(caseId, payload as Partial<CaseFacts>);
      setCaseData(result.case);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="修改案件信息"
      description="只填写你知道的内容，留空会保留为“待核实”。不要编造金额、日期或单位名称。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存修改
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section>
          <h3 className="text-sm font-bold text-ink-900">工作地点</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-500">城市</span>
              <Select
                value={String(form.location_city || "")}
                onChange={(event) => {
                  setValue("location_city", event.target.value);
                  setValue("location_district", "");
                }}
              >
                <option value="">请选择或留空</option>
                {cityOptions.map((city) => (
                  <option key={city.name} value={city.name}>{city.name}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-500">区 / 县</span>
              <Select
                value={String(form.location_district || "")}
                onChange={(event) => setValue("location_district", event.target.value)}
                disabled={!selectedCity}
              >
                <option value="">{selectedCity ? "请选择区县或留空" : "请先选择城市"}</option>
                {selectedCity?.districts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </Select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-ink-500">工地位置 / 项目地址</span>
              <Input
                value={String(form.location_detail || "")}
                onChange={(event) => setValue("location_detail", event.target.value)}
                placeholder="例如：金水区某小区二期工地"
              />
            </label>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink-900">工作和工资</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="工种">
              <Input value={String(form.work_type || "")} onChange={(e) => setValue("work_type", e.target.value)} placeholder="钢筋工、木工、瓦工…" />
            </Field>
            <Field label="工作时长">
              <Input value={String(form.duration_text || "")} onChange={(e) => setValue("duration_text", e.target.value)} placeholder="例如：约3个月" />
            </Field>
            <Field label="开始月份">
              <Input type="month" value={String(form.work_start || "")} onChange={(e) => setValue("work_start", e.target.value)} />
            </Field>
            <Field label="结束月份">
              <Input type="month" value={String(form.work_end || "")} onChange={(e) => setValue("work_end", e.target.value)} />
            </Field>
            <Field label="工资算法">
              <Select value={String(form.wage_basis || "")} onChange={(e) => setValue("wage_basis", e.target.value)}>
                <option value="">待核实</option>
                <option value="按天">按天</option>
                <option value="按月">按月</option>
                <option value="计件/按平方">计件 / 按平方</option>
                <option value="包工价">包工价</option>
                <option value="不清楚">不清楚</option>
              </Select>
            </Field>
            <Field label="日工资（元）">
              <Input type="number" inputMode="decimal" value={String(form.daily_wage || "")} onChange={(e) => setValue("daily_wage", e.target.value)} placeholder="例如 350" />
            </Field>
            <Field label="月工资（元）">
              <Input type="number" inputMode="decimal" value={String(form.monthly_wage || "")} onChange={(e) => setValue("monthly_wage", e.target.value)} />
            </Field>
            <Field label="约定工资总额（元）">
              <Input type="number" inputMode="decimal" value={String(form.agreed_amount || "")} onChange={(e) => setValue("agreed_amount", e.target.value)} />
            </Field>
            <Field label="已支付金额（元）">
              <Input type="number" inputMode="decimal" value={String(form.paid_amount || "")} onChange={(e) => setValue("paid_amount", e.target.value)} />
            </Field>
            <Field label="拖欠金额（元）">
              <Input type="number" inputMode="decimal" value={String(form.owed_amount || "")} onChange={(e) => setValue("owed_amount", e.target.value)} />
            </Field>
            <Field label="书面合同">
              <Select value={String(form.has_contract || "")} onChange={(e) => setValue("has_contract", e.target.value)}>
                <option value="">待核实</option>
                <option value="yes">签了</option>
                <option value="no">没签</option>
                <option value="unknown">不清楚</option>
              </Select>
            </Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink-900">招用和管理</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="招用方式">
              <Select value={String(form.recruiter_type || "")} onChange={(e) => setValue("recruiter_type", e.target.value)}>
                <option value="">待核实</option>
                <option value="包工头">包工头</option>
                <option value="劳务公司">劳务公司</option>
                <option value="施工企业/项目部">施工企业 / 项目部</option>
                <option value="熟人介绍（单位不明）">熟人介绍，单位不明</option>
                <option value="不清楚">不清楚</option>
              </Select>
            </Field>
            <Field label="招用人姓名 / 称呼">
              <Input value={String(form.recruiter_name || "")} onChange={(e) => setValue("recruiter_name", e.target.value)} placeholder="例如：王老板（具体姓名待核实）" />
            </Field>
            <Field label="日常管理主体">
              <Select value={String(form.manager_role || "")} onChange={(e) => setValue("manager_role", e.target.value)}>
                <option value="">待核实</option>
                <option value="包工头">包工头</option>
                <option value="项目部">项目部</option>
                <option value="劳务公司">劳务公司</option>
                <option value="不清楚">不清楚</option>
              </Select>
            </Field>
            <Field label="此前是否反映过">
              <Select value={String(form.prior_report || "")} onChange={(e) => setValue("prior_report", e.target.value)}>
                <option value="">待核实</option>
                <option value="no">没有</option>
                <option value="yes">反映过</option>
              </Select>
            </Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink-900">项目和单位（不知道可留空）</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="项目名称">
              <Input value={String(form.project_name || "")} onChange={(e) => setValue("project_name", e.target.value)} />
            </Field>
            <Field label="建设单位">
              <Input value={String(form.developer_name || "")} onChange={(e) => setValue("developer_name", e.target.value)} />
            </Field>
            <Field label="施工总承包单位">
              <Input value={String(form.contractor_name || "")} onChange={(e) => setValue("contractor_name", e.target.value)} />
            </Field>
            <Field label="分包 / 劳务单位">
              <Input value={String(form.subcontractor_name || "")} onChange={(e) => setValue("subcontractor_name", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink-900">已有材料</h3>
          <p className="mt-1 text-xs text-ink-500">没有某项材料也没关系，缺少材料不等于不能维权。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {evidenceOptions.map((item) => (
              <Checkbox
                key={item.key}
                checked={Array.isArray(form.evidence) && form.evidence.includes(item.key)}
                onChange={() => toggleEvidence(item.key)}
                label={item.label}
              />
            ))}
          </div>
        </section>

        <section>
          <Field label="补充说明">
            <Textarea
              value={String(form.notes || "")}
              onChange={(e) => setValue("notes", e.target.value)}
              placeholder="还有哪些需要补充的事实？不要填写身份证号、银行卡号。"
              rows={3}
            />
          </Field>
        </section>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}
