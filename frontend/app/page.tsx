import Link from "next/link";
import { CheckCircle2, Database, LockKeyhole } from "lucide-react";

import { DemoCaseButton, StartCaseButton } from "@/components/home/start-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const steps = [
  ["说情况", "用大白话讲在哪儿干活、谁欠你多少钱。"],
  ["补事实", "一次回答一个问题，整理成可核对的案件档案。"],
  ["看分析", "标出证据缺口、可能权益和管辖渠道。"],
  ["照着办", "按步骤固定证据、准备材料、去官方平台提交。"],
];

const outcomes = [
  ["案件分析", "可能权益、证据缺口和先去哪里。"],
  ["行动步骤", "先做什么、带什么材料、怎么留痕。"],
  ["填报参考", "逐字段复制，由你本人去官方平台提交。"],
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 sm:px-6">
        <section className="grid gap-10 border-b border-rule py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 lg:py-20">
          <div className="min-w-0 max-w-[650px]">
            <p className="flex items-center gap-2 text-xs font-bold text-signal-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
              河南 · 建筑工地欠薪
            </p>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.18] tracking-[-0.04em] text-ink sm:text-5xl">
              工资被拖欠了？
              <br className="hidden sm:block" />
              慢慢说，我们先把事实理清。
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-muted">
              不用先懂法律。一次问一个问题，陪你把时间、账目和手头材料整理妥当，再对照法规列出接下来可以怎么走。
            </p>

            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-start">
              <StartCaseButton
                size="default"
                className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto"
              >
                说说我的情况
              </StartCaseButton>
              <DemoCaseButton
                label="先看演示案件"
                size="default"
                className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <LockKeyhole className="h-3.5 w-3.5 text-field" />
                不要求身份证号
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-field" />
                仅本浏览器会话可见
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-field" />
                不代替你提交
              </span>
            </div>

            <p className="mt-4 text-sm text-muted">
              已有案件？
              <Link
                href="/cases"
                className="ml-1 font-bold text-signal-deep underline-offset-4 hover:underline"
              >
                继续查看
              </Link>
            </p>
          </div>

          <aside className="border-t border-rule pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <h2 className="text-lg font-extrabold tracking-[-0.03em] text-ink">整理完会得到</h2>
            <ol className="mt-3">
              {outcomes.map(([title, description], index) => (
                <li
                  key={title}
                  className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-b border-rule py-3 last:border-b-0"
                >
                  <span className="pt-0.5 font-mono text-[11px] font-bold text-signal">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-bold text-ink">{title}</strong>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>

          <ol className="grid border-t border-rule pt-2 sm:grid-cols-4 lg:col-span-2">
            {steps.map(([title, description], index) => (
              <li
                key={title}
                className="border-b border-rule py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:pr-4 sm:last:border-r-0 sm:[&:not(:first-child)]:pl-4"
              >
                <p className="font-mono text-[11px] font-bold text-signal">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-1.5 text-base font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
                <p className="mt-1 text-xs leading-6 text-muted">{description}</p>
              </li>
            ))}
          </ol>

          <div className="space-y-2 border-t border-rule pt-5 text-xs leading-6 text-muted lg:col-span-2">
            <p>
              首期完整支持<strong className="font-bold text-ink">河南省建筑工地欠薪</strong>。其他劳动权益问题可先拨打
              <strong className="font-bold text-ink"> 12348 </strong>
              公共法律服务热线，或
              <strong className="font-bold text-ink"> 12333 </strong>
              联系当地人社部门。
            </p>
            <p>
              不要求身份证号；案件仅本浏览器会话可见，可随时删除；只辅助整理材料，不代替你向政府平台提交。法律条文与地方政策以官方最新公布为准。
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}