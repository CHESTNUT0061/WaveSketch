import { ExternalLink, Github, Link2, MessageSquareText, MousePointerClick, Users } from 'lucide-react';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { EE_TOOLBOX_URL, GITHUB_ISSUES_URL, GITHUB_REPO_URL, WPD_URL } from '@/lib/siteLinks';
import { isProductionCounterHost, parseCounterText } from '@/lib/siteCounter';

const BUSUANZI_SCRIPT_ID = 'wavesketch-busuanzi';

interface VisitCounts {
  pageViews: number;
  visitors: number;
}

function readCounterValue(element: HTMLElement | null): number | null {
  return parseCounterText(element?.textContent);
}

export function AppStatusBar() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [visitCounts, setVisitCounts] = React.useState<VisitCounts | null>(null);
  const closedMascotSrc = `${import.meta.env.BASE_URL}chestnut-closed.png`;
  const openMascotSrc = `${import.meta.env.BASE_URL}chestnut-open.png`;

  React.useEffect(() => {
    if (!isProductionCounterHost(window.location.hostname)) return;

    const pageViewsElement = document.getElementById('busuanzi_value_site_pv');
    const visitorsElement = document.getElementById('busuanzi_value_site_uv');

    const updateCounts = () => {
      const pageViews = readCounterValue(pageViewsElement);
      const visitors = readCounterValue(visitorsElement);
      if (pageViews === null || visitors === null) return;
      setVisitCounts({ pageViews, visitors });
      window.clearTimeout(timeoutId);
    };

    const observer = new MutationObserver(updateCounts);
    if (pageViewsElement) observer.observe(pageViewsElement, { childList: true, characterData: true, subtree: true });
    if (visitorsElement) observer.observe(visitorsElement, { childList: true, characterData: true, subtree: true });

    let script = document.getElementById(BUSUANZI_SCRIPT_ID) as HTMLScriptElement | null;
    const createdScript = !script;
    if (!script) {
      script = document.createElement('script');
      script.id = BUSUANZI_SCRIPT_ID;
      script.async = true;
      script.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
      document.body.appendChild(script);
    }
    script.addEventListener('load', updateCounts);
    script.addEventListener('error', () => setVisitCounts(null), { once: true });
    const timeoutId = window.setTimeout(() => setVisitCounts(null), 8000);
    updateCounts();

    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
      script?.removeEventListener('load', updateCounts);
      if (createdScript) script?.remove();
    };
  }, []);

  return (
    <footer className="grid min-h-10 shrink-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-0 border-t border-[var(--ws-border)] bg-white/40 px-2 pb-[calc(0.2rem+env(safe-area-inset-bottom))] pt-0.5 text-[11px] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-rows-1 sm:gap-y-0 sm:px-5 sm:py-1 sm:text-xs">
      <div className="ws-display min-w-0 max-w-full truncate text-[11px] font-semibold text-[var(--ws-ink)] sm:text-[13px]">
        WaveSketch <span className="font-normal text-[var(--ws-light)]">· MIT · v{__APP_VERSION__}</span>
      </div>

      <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 max-w-full flex-wrap items-center justify-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:gap-2">
        <span className="hidden w-14 border-t border-dashed border-[#713b20]/60 md:block" aria-hidden="true" />
        <span className="text-center text-[10px] font-medium text-[var(--ws-muted)] sm:text-xs">
          Copyright © 2026 CHESTNUT0061
        </span>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group relative grid size-9 shrink-0 select-none place-items-center overflow-visible rounded-full bg-transparent outline-none transition-transform [-webkit-tap-highlight-color:transparent] hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/45 data-[state=open]:bg-transparent"
              aria-label={t('openMascotMenu')}
              title={t('openMascotMenu')}
            >
              <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                <img
                  src={closedMascotSrc}
                  alt=""
                  draggable={false}
                  className={`ws-mascot-image ws-mascot-closed absolute left-1/2 top-1/2 w-[33px] max-w-none -translate-x-1/2 -translate-y-1/2 transition-[opacity,transform] duration-300 ease-out will-change-transform motion-reduce:transition-none ${
                    menuOpen ? '-rotate-6 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'
                  }`}
                />
                <img
                  src={openMascotSrc}
                  alt=""
                  draggable={false}
                  className={`ws-mascot-image ws-mascot-open absolute left-1/2 top-1/2 w-[50px] max-w-none -translate-x-1/2 -translate-y-1/2 transition-[opacity,transform] duration-300 ease-out will-change-transform motion-reduce:transition-none ${
                    menuOpen ? 'rotate-0 scale-100 opacity-100' : 'rotate-6 scale-75 opacity-0'
                  }`}
                />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={7} collisionPadding={10} className="min-w-40 border-[var(--ws-border)] bg-white/95">
            <DropdownMenuItem asChild>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                <Github />GitHub<ExternalLink className="ml-auto size-3" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
                <MessageSquareText />{t('linkFeedback')}
              </a>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Link2 />{t('recommendedLinks')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent sideOffset={6} collisionPadding={10} className="border-[var(--ws-border)] bg-white/95">
                <DropdownMenuItem asChild>
                  <a href={WPD_URL} target="_blank" rel="noreferrer">
                    {t('linkWpdShort')}<ExternalLink className="ml-auto size-3" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={EE_TOOLBOX_URL} target="_blank" rel="noreferrer">
                    EE 工具箱<ExternalLink className="ml-auto size-3" />
                  </a>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="hidden w-14 border-t border-dashed border-[#713b20]/60 md:block" aria-hidden="true" />
      </div>

      <div className="col-start-2 row-start-1 flex min-w-0 max-w-full items-center justify-end sm:col-start-3 sm:row-start-1">
        {visitCounts && (
          <span className="flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0 rounded-full border border-[var(--ws-border)] bg-[var(--ws-card)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--ws-muted)] shadow-sm sm:gap-x-1.5 sm:px-2.5 sm:py-1 sm:text-xs" role="status">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <MousePointerClick className="size-3 shrink-0 text-primary" />
              <span>{t('visitCountShort')} <strong className="ws-display text-[var(--ws-ink)]">{visitCounts.pageViews.toLocaleString()}</strong></span>
            </span>
            <span className="text-[var(--ws-light)]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Users className="size-3 shrink-0 text-primary" />
              <span>{t('visitorShort')} <strong className="ws-display text-[var(--ws-ink)]">{visitCounts.visitors.toLocaleString()}</strong></span>
            </span>
          </span>
        )}
        <div className="hidden" aria-hidden="true">
          <span id="busuanzi_container_site_pv"><span id="busuanzi_value_site_pv" /></span>
          <span id="busuanzi_container_site_uv"><span id="busuanzi_value_site_uv" /></span>
        </div>
      </div>
    </footer>
  );
}
