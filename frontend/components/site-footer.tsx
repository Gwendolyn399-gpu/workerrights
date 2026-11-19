const sources = [
  { label: "国家法律法规数据库", href: "https://flk.npc.gov.cn/" },
  { label: "人力资源社会保障部", href: "https://www.mohrss.gov.cn/" },
  { label: "河南省人社厅", href: "https://hrss.henan.gov.cn/" },
  { label: "中国法律服务网", href: "https://12348.gov.cn/" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="font-bold text-ink">官方来源</span>
          {sources.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted underline-offset-4 hover:text-signal-deep hover:underline"
            >
              {item.label}
            </a>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-6 text-muted">
          本产品提供信息整理、法律资料检索和办事路径参考，不构成正式法律意见，不承诺追回工资或胜诉，不自动向政府平台提交。
          法律条文与地方政策以官方最新公布为准；复杂或紧急案件请拨打 12348 或咨询专业律师。
        </p>
        <p className="mt-2 text-xs text-muted">
          服务范围：河南省 · 建筑工地欠薪。当前为本地开发预览，未部署公网。
        </p>
      </div>
    </footer>
  );
}