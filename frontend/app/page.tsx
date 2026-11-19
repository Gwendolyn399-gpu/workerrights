import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileSearch,
  FolderOpen,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Route,
  Scale,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
} from "lucide-react";

import { DemoCaseButton, StartCaseButton } from "@/components/home/start-actions";
import { SceneGrid } from "@/components/home/scenes";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const cities = [
  "郑州市", "开封市", "洛阳市", "平顶山市", "安阳市", "鹤壁市",
  "新乡市", "焦作市", "濮阳市", "许昌市", "漯河市", "三门峡市",
  "南阳市", "商丘市", "信阳市", "周口市", "驻马店市", "济源市",
];

const laws = [
  ["中华人民共和国劳动合同法", "劳动报酬 · 书面合同 · 未签合同时的赔偿争议"],
  ["中华人民共和国劳动争议调解仲裁法", "仲裁受理范围 · 申请时限"],
  ["保障农民工工资支付条例", "工程建设领域 · 工资支付责任主体 · 实名制"],
  ["劳动保障监察条例", "投诉举报 · 责令支付 · 查处时限"],
  ["中华人民共和国法律援助法", "劳动报酬 · 确认劳动关系"],
];

const steps = [
  {
    icon: MessageSquareText,
    title: "你用大白话说",
    description: "不用懂法律术语，也不用填长表格。说清楚在哪儿干活、谁欠你多少钱就行。",
  },
  {
    icon: FileSearch,
    title: "Agent 一次问一个问题",
    description: "根据你的回答逐步追问招工主体、日常管理、工资约定、证据情况，自动整理成案件事实。",
  },
  {
    icon: Scale,
    title: "匹配法律和渠道",
    description: "从国家法律和河南办事规则中检索相关条文，标出适用条件和还需核实的事实。",
  },
  {
    icon: ClipboardCheck,
    title: "照着步骤去办",
    description: "生成行动清单、证据目录、正式陈述和逐字段材料整理参考，内容可复制、可下载，提交仍由你在官方平台完成。",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-ink-200/70 bg-white">
          <div className="pointer-events-none absolute -right-24 top-0 h-[420px] w-[420px] rounded-full bg-brand-50 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">
                  <MapPin className="h-3 w-3" />
                  河南首期 · 劳动权益
                </Badge>
                <span className="text-xs font-medium text-ink-400">Hack4Good · 技术向善</span>
              </div>
              <h1 className="mt-5 text-balance text-[2.15rem] font-black leading-[1.16] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
                遇到劳动权益问题，
                <br className="hidden sm:block" />
                <span className="text-brand-800">不知道怎么办？</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                不用先懂法律，说说你的遭遇，我们一步步帮你找到解决办法。
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-start">
                <StartCaseButton />
                <DemoCaseButton label="先看虚构演示案件" />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-700" />
                  不要求身份证号
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-brand-700" />
                  法律资料附来源
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <LockKeyhole className="h-3.5 w-3.5 text-brand-700" />
                  仅本浏览器会话可见
                </span>
              </div>
              <div className="mt-5">
                <Link
                  href="/cases"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 underline-offset-4 transition hover:text-brand-800 hover:underline"
                >
                  <FolderOpen className="h-4 w-4" />
                  已有案件？继续查看
                </Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="absolute -inset-3 rounded-[2rem] border border-brand-100 bg-brand-50/50" aria-hidden="true" />
              <div className="relative rounded-3xl border border-ink-200 bg-white p-4 shadow-lift sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900 text-white">
                      <MessageSquareText className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-900">案件工作台</p>
                      <p className="text-[10px] text-ink-400">对话 · 事实 · 法律依据</p>
                    </div>
                  </div>
                  <Badge variant="warning">虚构演示</Badge>
                </div>

                <div className="mt-4 rounded-xl bg-ink-50 p-3">
                  <div className="flex items-center justify-between text-[11px] font-medium text-ink-500">
                    <span>信息整理进度</span>
                    <span className="text-brand-800">7 / 11 项</span>
                  </div>
                  <Progress value={64} className="mt-2 h-1.5" />
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="ml-8 rounded-2xl rounded-tr-md bg-brand-900 px-3.5 py-2.5 text-xs leading-relaxed text-white">
                    我在郑州一个工地干了三个月，老板还欠我两万多。
                  </div>
                  <div className="mr-6 rounded-2xl rounded-tl-md border border-ink-200 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-ink-700">
                    我记下了：郑州，约3个月，欠薪约2万元。你是通过谁介绍到这个工地工作的？
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-1">
                    {["包工头", "劳务公司", "项目部"].map((item) => (
                      <span key={item} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] font-medium text-brand-800">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-4">
                  {[
                    ["地点", "郑州金水区"],
                    ["工种", "钢筋工"],
                    ["欠薪", "约2万元"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] text-ink-400">{label}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-ink-800">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-2.5">
                  <p className="text-[11px] leading-snug text-ink-500">
                    下一步：核实总包、分包关系和证据缺口
                  </p>
                  <DemoCaseButton
                    label="直接体验"
                    size="sm"
                    variant="default"
                    className="shrink-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-ink-200/60 bg-ink-50">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
            {[
              ["5 部", "首期国家法律知识库"],
              ["18 个", "河南地级市，县区级选择"],
              ["4 类", "证据缺口与替代材料提示"],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-3">
                <span className="text-xl font-black tracking-tight text-brand-900">{value}</span>
                <span className="text-xs leading-snug text-ink-500">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="scenes" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">选择你遇到的问题</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                  先从最要紧的一件事开始
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
                  选一个最接近你遇到的情况，用大白话说说经过，Agent 会一步步帮你理清。
                </p>
              </div>
            </div>
            <div className="mt-8">
              <SceneGrid />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-400">
              暂时不支持的场景，可先拨打 12348 公共法律服务热线咨询，或通过 12333 联系当地人社部门。
            </p>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-y border-ink-200/60 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">它是怎么工作的</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                不是给你一篇法律文章，是陪你走完一段路
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                接待、法律检索、案件分析、行动规划、材料整理参考由不同 Agent 分工完成。每次只问当前最需要的一个问题。
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="relative rounded-2xl border border-ink-200 bg-ink-50/50 p-5">
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-800 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-2xl font-black text-ink-200">0{index + 1}</span>
                    </div>
                    <h3 className="mt-4 text-base font-bold text-ink-900">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="scope" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">服务范围</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                河南省先行，县区级定位
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                行政区划已录入河南省 18 个地级市及县、县级市、市辖区。维权渠道不会简单按“每个县区一个机构”套用，
                而是提示你按项目所在地的劳动保障管辖规则，通过 12333 确认具体受理机构。
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-ink-600">
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  国家法律可直接检索，河南地方政策单独标注核验状态
                </li>
                <li className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  郑州为验收演示城市，其他地市同样可使用，但地方规则仍需核验
                </li>
                <li className="flex gap-2">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  关系图只根据你提供的信息生成，不据此直接认定责任主体
                </li>
              </ul>
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                河南地方政策库中的办事指南、最低工资等条目当前标记为“待核验”，不会被当作最终法律依据。
              </div>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink-900">河南省 · 地级市</h3>
                <Badge variant="neutral">18 个</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {cities.map((city, index) => (
                  <span
                    key={city}
                    className={
                      index === 0
                        ? "rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-900"
                        : "rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600"
                    }
                  >
                    {city}
                    {index === 0 && <span className="ml-1 text-[10px] text-brand-600">演示</span>}
                  </span>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-5 text-xs sm:grid-cols-3">
                {[
                  ["县区级区划", "已录入"],
                  ["功能区", "郑州部分录入"],
                  ["机构匹配", "按管辖核实"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-ink-400">{label}</p>
                    <p className="mt-1 font-semibold text-ink-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="sources" className="scroll-mt-24 border-y border-ink-200/60 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">官方来源与核验</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                  不靠模型记忆编法条
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  法律检索来自独立的本地知识库，每条结果都带文件名称、发布机关、条款、官方入口和核验状态。
                </p>
              </div>
              <Badge variant="warning">国家法条待逐条核验 · 河南政策待核验</Badge>
            </div>
            <div className="mt-8 grid gap-3 lg:grid-cols-5">
              {laws.map(([title, topics]) => (
                <div key={title} className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                  <Database className="h-5 w-5 text-brand-700" />
                  <h3 className="mt-3 text-sm font-bold leading-snug text-ink-900">{title}</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{topics}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              上面只是每部文件涉及的主题，不是对你案件的结论。时限从哪天算、适用多久，
              取决于你的具体事实，以官方受理机构的答复为准。
            </p>
            <p className="mt-6 text-xs font-semibold text-ink-500">
              以下是这些机构的官网首页，不是某个具体办事页面。办理入口请在官网内查找，或先电话确认。
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <a
                href="https://flk.npc.gov.cn/"
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-800"
              >
                国家法律法规数据库
                <span className="flex items-center gap-1">
                  官网首页
                  <ExternalLink className="h-4 w-4" />
                </span>
              </a>
              <a
                href="https://hrss.henan.gov.cn/"
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-800"
              >
                河南省人社厅
                <span className="flex items-center gap-1">
                  官网首页
                  <ExternalLink className="h-4 w-4" />
                </span>
              </a>
              <a
                href="https://12348.gov.cn/"
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-800"
              >
                中国法律服务网
                <span className="flex items-center gap-1">
                  官网首页
                  <ExternalLink className="h-4 w-4" />
                </span>
              </a>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: UserRoundCheck,
                  title: "不要求身份证号",
                  text: "本产品不收集身份证号、银行卡等敏感信息，实名信息只在官方平台由你本人填写。",
                },
                {
                  icon: LockKeyhole,
                  title: "匿名会话隔离",
                  text: "案件与本浏览器生成的会话标识绑定，其他会话无法读取你的案件。",
                },
                {
                  icon: Trash2,
                  title: "随时删除",
                  text: "可在“我的案件”中删除案件及聊天记录，删除后不可恢复。",
                },
                {
                  icon: ShieldCheck,
                  title: "不自动提交",
                  text: "只辅助整理填报内容，不登录、不代替你向任何政府平台提交材料。",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-ink-200 bg-white p-5">
                    <Icon className="h-5 w-5 text-brand-700" />
                    <h3 className="mt-3 text-sm font-bold text-ink-900">{item.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-ink-500">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 overflow-hidden rounded-3xl bg-brand-950 p-6 text-white sm:p-10">
              <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
                <div>
                  <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-brand-100">
                    虚构演示案例 · 不涉及真实劳动者
                  </span>
                  <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
                    先用一个郑州工地欠薪案例，把流程完整走一遍
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-100">
                    对话追问、案件事实、用工关系图、证据缺口、法律依据、行动步骤和材料整理参考，全部可实际操作。
                    演示中的人物、项目、公司均为虚构。
                  </p>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-brand-200">
                    <span className="inline-flex items-center gap-1.5"><Route className="h-3.5 w-3.5" />对话 → 分析 → 行动 → 材料整理</span>
                    <span className="inline-flex items-center gap-1.5"><ArrowUpRight className="h-3.5 w-3.5" />支持 DOCX / PDF 导出</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <DemoCaseButton
                    label="打开演示案件"
                    variant="secondary"
                    size="lg"
                    className="[&>button]:bg-white [&>button]:text-brand-950 [&>button]:hover:bg-brand-50"
                  />
                  <StartCaseButton
                    children="直接说我的情况"
                    variant="outline"
                    size="lg"
                    className="[&>button]:border-white/25 [&>button]:bg-transparent [&>button]:text-white [&>button]:hover:bg-white/10"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-xs leading-relaxed text-ink-500">
              <strong className="font-semibold text-ink-700">法律辅助服务免责声明：</strong>
              本产品不是律师事务所，不提供正式法律意见，不承诺追回工资或胜诉。案件分析、法律引用和行动建议仅供参考，
              最终以行政机关、仲裁机构或人民法院认定为准。遇到复杂、紧急或人身安全风险，请及时拨打 110、12348 或联系专业律师。
              <span className="mt-2 block text-ink-400">当前版本为本地开发预览，未部署公网，未接入付费模型 API。</span>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
