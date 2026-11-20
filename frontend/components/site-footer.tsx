import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";

const shortcuts = [
  { label: "说说我的情况", href: "/#start-case" },
  { label: "看看怎么整理", href: "/#case-story" },
  { label: "我的案件", href: "/cases" },
];

const sources = [
  { label: "国家法律法规数据库", href: "https://flk.npc.gov.cn/" },
  { label: "人力资源社会保障部", href: "https://www.mohrss.gov.cn/" },
  { label: "河南省人社厅", href: "https://hrss.henan.gov.cn/" },
  { label: "中国法律服务网", href: "https://12348.gov.cn/" },
];

const footerLink = "inline-flex min-h-9 items-center rounded-control text-sm leading-6 text-ink underline decoration-rule underline-offset-4 hover:text-signal-deep hover:decoration-signal-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-x-4 gap-y-8 px-4 py-9 sm:px-6 sm:py-12 md:grid-cols-[1.35fr_0.8fr_1fr] md:gap-x-12">
        <div className="col-span-2 md:col-span-1">
          <BrandLogo />
          <p className="mt-4 max-w-xs text-sm leading-7 text-muted">
            说说你的欠薪经历，理清账目和手头材料，再查看接下来怎么走。
          </p>
          <a
            href="https://github.com/liuyike200811-maker/workerrights"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-control border border-rule px-3 text-sm font-bold text-ink transition-colors hover:border-signal-deep hover:bg-paper hover:text-signal-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            GitHub 仓库
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        <nav aria-labelledby="footer-shortcuts">
          <h2 id="footer-shortcuts" className="fusion-kai mb-2 text-xl font-bold text-ink">
            快捷入口
          </h2>
          <ul>
            {shortcuts.map(({ label, href }) => (
              <li key={href}><Link href={href} className={footerLink}>{label}</Link></li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-sources">
          <h2 id="footer-sources" className="fusion-kai mb-2 text-xl font-bold text-ink">
            官方来源
          </h2>
          <ul>
            {sources.map(({ label, href }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noreferrer noopener" className={footerLink}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-x-5 gap-y-1 px-4 py-4 text-xs leading-6 text-muted sm:px-6">
          <p>服务范围 · 河南省建筑工地欠薪</p>
          <p>材料整理与办事路径仅供参考，提交前请核对官方要求。</p>
        </div>
      </div>
    </footer>
  );
}
