"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const scenes = [
  {
    lines: ["活干完了，", "工资还没拿到。"],
    image: "/images/opening-worksite-dusk.png",
    alt: "傍晚，一位工人提着安全帽从工地走过",
    focus: "[object-position:43%_42%] lg:[object-position:50%_39%]",
  },
  {
    lines: ["说周五先给三千，", "到今天还没到账。"],
    image: "/images/opening-waiting-for-payment.png",
    alt: "收工后，一位工人坐在长凳上看手机，身边放着安全帽",
    focus: "[object-position:48%_40%] lg:[object-position:50%_35%]",
  },
  {
    lines: ["没签合同，", "手里只有微信聊天。"],
    image: "/images/opening-chat-records.png",
    alt: "工人坐在旧木桌旁翻看手机聊天，桌上放着安全帽",
    focus: "[object-position:39%_41%] lg:[object-position:50%_38%]",
  },
  {
    lines: ["干了几天，收了多少？", "账对不上。"],
    image: "/images/opening-checking-wages.png",
    alt: "工人用旧记工本和计算器核对工钱",
    focus: "[object-position:53%_54%] lg:[object-position:50%_48%] lg:-translate-x-[8%]",
  },
  {
    lines: ["包工头让我找公司，", "公司又让我找包工头。"],
    image: "/images/opening-project-office.png",
    alt: "工人拿着材料和安全帽站在工地办公室门口",
    focus: "[object-position:34%_45%] lg:[object-position:50%_41%]",
  },
] as const;

const interval = 7000;

export function OpeningCarousel() {
  const section = useRef<HTMLElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [slide, setSlide] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const nearbySlides = [slide, (slide + 1) % scenes.length, (slide - 1 + scenes.length) % scenes.length];

  useEffect(() => {
    const region = section.current;
    if (!region) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.intersectionRatio >= 0.4), {
      threshold: 0.4,
    });
    observer.observe(region);

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setTabVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || !onScreen || !tabVisible) return;
    const timer = window.setTimeout(() => setSlide((slide + 1) % scenes.length), interval);
    return () => window.clearTimeout(timer);
  }, [slide, reducedMotion, onScreen, tabVisible]);

  function step(direction: number) {
    setSlide((current) => (current + direction + scenes.length) % scenes.length);
  }

  function startSwipe(event: TouchEvent<HTMLElement>) {
    const finger = event.touches[0];
    touchStart.current = { x: finger.clientX, y: finger.clientY };
  }

  function finishSwipe(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const finger = event.changedTouches[0];
    const dx = finger.clientX - start.x;
    const dy = finger.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
  }

  return (
    <section
      id="home-carousel"
      ref={section}
      aria-label="建筑工地欠薪场景"
      className="opening-hero relative isolate grid min-h-[calc(100svh-4rem)] touch-pan-y items-end overflow-hidden border-b border-rule bg-paper lg:items-center"
      onTouchStart={startSwipe}
      onTouchEnd={finishSwipe}
      onTouchCancel={() => { touchStart.current = null; }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[69%] lg:h-full">
          {scenes.map((scene, index) => nearbySlides.includes(index) && (
            <Image
              key={scene.image}
              src={scene.image}
              alt={scene.alt}
              aria-hidden={index !== slide}
              fill
              sizes="100vw"
              priority={index === 0}
              loading={index === 0 ? undefined : "eager"}
              className={cn(
                "object-cover transition-opacity duration-500 motion-reduce:transition-none",
                scene.focus,
                index === slide ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
          <div id="opening-photo-light" className="opening-photo-light" aria-hidden="true" />
        </div>
        <div className="opening-hero-wash absolute inset-0 z-[2]" />
      </div>

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-14 pt-[25rem] sm:px-10 sm:pb-16 lg:px-[clamp(3.75rem,6vw,6rem)] lg:py-24">
        <div className="min-w-0 lg:ml-auto lg:w-[48%]">
          <p className="flex items-center gap-2 text-xs font-bold text-signal-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
            工友权益助手
          </p>
          <h1
            aria-live={reducedMotion ? "polite" : "off"}
            aria-atomic="true"
            className="fusion-kai mt-4 grid text-[clamp(2rem,5.2vw,4.15rem)] font-bold leading-[1.14] tracking-[-0.035em] text-ink sm:mt-6"
          >
            {scenes.map(({ lines }, index) => (
              <span
                key={lines[0]}
                aria-hidden={index !== slide}
                className={cn(
                  "col-start-1 row-start-1 self-start transition-opacity duration-300 motion-reduce:transition-none",
                  lines.some((line) => line.length > 8) && "text-[clamp(1.65rem,7vw,2.85rem)] lg:text-[clamp(2rem,3.7vw,3.4rem)]",
                  index === slide ? "opacity-100" : "select-none opacity-0",
                )}
              >
                <span className="block">{lines[0]}</span>
                <span className="block">{lines[1]}</span>
              </span>
            ))}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-9">
            <a href="#start-case" className={buttonVariants()}>
              说说我的情况 <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href="#case-story" className={buttonVariants({ variant: "outline" })}>
              先看怎么整理 <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="上一张"
        className="opening-hero-edge opening-hero-edge-prev group absolute inset-y-0 left-0 z-10 flex max-h-[60%] w-11 items-center justify-center lg:max-h-none lg:w-[clamp(3rem,6vw,6rem)]"
        onClick={() => step(-1)}
      >
        <ChevronLeft className="opening-hero-chevron" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="下一张"
        className="opening-hero-edge opening-hero-edge-next group absolute inset-y-0 right-0 z-10 flex max-h-[60%] w-11 items-center justify-center lg:max-h-none lg:w-[clamp(3rem,6vw,6rem)]"
        onClick={() => step(1)}
      >
        <ChevronRight className="opening-hero-chevron" aria-hidden="true" />
      </button>
    </section>
  );
}
