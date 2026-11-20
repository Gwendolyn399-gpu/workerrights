import { CaseStory } from "@/components/home/case-story";
import { HomeComposer } from "@/components/home/home-composer";
import { OpeningCarousel } from "@/components/home/opening-carousel";
import { DemoCaseButton } from "@/components/home/start-actions";
import { PointerSpotlight } from "@/components/pointer-spotlight";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader startHref="#start-case" />
      <main className="flex-1">
        <OpeningCarousel />
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6">
          <CaseStory />

          <section id="start-case" aria-labelledby="start-case-title" className="scroll-mt-24 border-t border-rule py-12 sm:py-16">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
              <div>
                <h2 id="start-case-title" className="fusion-kai text-3xl font-bold leading-tight sm:text-4xl">
                  说说你的情况
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-7 text-muted">
                  从你记得的讲起。我们会一起把事情理清，再看看下一步怎么走。
                </p>
                <div className="mt-5">
                  <DemoCaseButton label="先看演示案件" size="default" />
                </div>
              </div>
              <HomeComposer />
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
      <PointerSpotlight />
    </div>
  );
}
