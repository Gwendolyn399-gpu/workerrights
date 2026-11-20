"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, FileText } from "lucide-react";

const quote = "老周还欠我九千，说周五先给三千，到现在还没收到。";
const labels = ["用户原话", "账目记录", "下一步"];
const outcomes = ["案件分析", "行动步骤", "填报参考"];

function StorySheet({ stage, compact = false }: { stage: number; compact?: boolean }) {
  return (
    <div className="case-story-sheet min-w-0 overflow-hidden rounded-card border border-rule bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3.5 sm:px-6">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-ink">
          <FileText className="h-4 w-4 text-signal-deep" aria-hidden="true" />
          {labels[stage]}
        </span>
        <span className="shrink-0 text-xs text-muted">虚构示例</span>
      </div>
      <div key={stage} className="case-story-sheet-content px-5 py-5 sm:px-6">
        {stage === 0 ? (
          <blockquote className="fusion-kai border-l-2 border-signal pl-4 text-2xl leading-relaxed text-ink">
            “{quote}”
          </blockquote>
        ) : (
          <>
            {!(compact && stage === 2) && <dl className="divide-y divide-rule text-sm">
              <div className="flex items-baseline justify-between gap-3 pb-2.5">
                <dt className="text-muted">还欠</dt>
                <dd className="text-xl font-extrabold tabular-nums text-ink">9,000 元</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="text-muted">答应先付</dt>
                <dd className="font-bold tabular-nums text-ink">3,000 元</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-2.5">
                <dt className="text-muted">到账情况</dt>
                <dd className="font-bold text-signal-deep">还没收到</dd>
              </div>
            </dl>}
            {stage === 2 && (
              <div className={compact ? "flex gap-2.5" : "mt-5 flex gap-2.5 border-t border-rule pt-4"}>
                <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-field" aria-hidden="true" />
                <p className="text-sm leading-6 text-ink">先留好答应周五付 3,000 元的那段聊天。</p>
              </div>
            )}
          </>
        )}
      </div>
      <div aria-hidden="true" className="case-story-progress grid grid-cols-3 gap-1.5 px-6 pb-5">
        {labels.map((label, index) => (
          <span key={label} className={`h-0.5 ${index <= stage ? "bg-signal" : "bg-rule"}`} />
        ))}
      </div>
    </div>
  );
}

export function CaseStory() {
  const chapters = useRef<(HTMLElement | null)[]>([]);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const wideMotion = window.matchMedia("(min-width: 1024px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    function syncStage() {
      frame = 0;
      if (!wideMotion.matches) return;
      const readingLine = window.innerHeight * 0.45;
      const current = chapters.current.findLastIndex((chapter) => chapter && chapter.getBoundingClientRect().top <= readingLine);
      setActiveStage(Math.max(0, current));
    }
    function onViewportChange() {
      if (!frame) frame = window.requestAnimationFrame(syncStage);
    }
    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("resize", onViewportChange);
    wideMotion.addEventListener("change", onViewportChange);
    onViewportChange();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      wideMotion.removeEventListener("change", onViewportChange);
    };
  }, []);

  return (
    <section
      id="case-story"
      aria-labelledby="case-story-title"
      className="case-story scroll-mt-24 py-12 sm:py-16"
    >
      <div className="case-story-chapters min-w-0">
        <article ref={(element) => { chapters.current[0] = element; }} className="case-story-chapter" data-story-stage="0">
          <h2 id="case-story-title" className="fusion-kai max-w-lg text-balance text-3xl font-bold leading-tight text-ink sm:text-4xl">
            慢慢说，我们先把事实理清。
          </h2>
          <p className="mt-4 max-w-sm text-base leading-8 text-muted">
            就像平常聊天一样。说说谁欠你钱、答应什么时候给，记得多少先说多少。
          </p>
          <p className="case-story-screen-reader sr-only">虚构示例。{quote}</p>
          <div className="case-story-inline mt-5"><StorySheet stage={0} /></div>
        </article>

        <article ref={(element) => { chapters.current[1] = element; }} className="case-story-chapter" data-story-stage="1">
          <h3 className="fusion-kai max-w-lg text-balance text-3xl font-bold leading-tight text-ink sm:text-4xl">
            答应给，和已经收到，分开记。
          </h3>
          <p className="mt-4 max-w-sm text-base leading-8 text-muted">
            那 3,000 元还没到账。这笔欠款先按 9,000 元记，等钱实际到了再更新。
          </p>
          <div className="case-story-inline mt-5"><StorySheet stage={1} /></div>
        </article>

        <article ref={(element) => { chapters.current[2] = element; }} className="case-story-chapter" data-story-stage="2">
          <h3 className="fusion-kai max-w-lg text-balance text-3xl font-bold leading-tight text-ink sm:text-4xl">
            理清账，就知道眼下先做什么。
          </h3>
          <p className="mt-4 max-w-sm text-base leading-8 text-muted">
            先把他答应给钱的聊天留好。把手头的材料理清之后，你可以继续查看：
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-signal-deep">
            {outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}
          </ul>
          <div className="case-story-inline mt-5"><StorySheet stage={2} compact /></div>
        </article>
      </div>

      <aside className="case-story-rail" aria-hidden="true">
        <div className="case-story-sticky"><StorySheet stage={activeStage} /></div>
      </aside>
    </section>
  );
}
