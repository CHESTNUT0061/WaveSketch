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
import { GITHUB_ISSUES_URL, GITHUB_REPO_URL, WPD_URL } from '@/lib/siteLinks';

export function AppStatusBar() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const mascotSrc = `${import.meta.env.BASE_URL}${menuOpen ? 'chestnut-open.png' : 'chestnut-closed.png'}`;

  return (
    <footer className="grid min-h-10 shrink-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-[var(--ws-border)] bg-white/40 px-3 py-1 text-xs sm:grid-cols-[1fr_auto_1fr] sm:px-5">
      <div className="ws-display whitespace-nowrap text-[13px] font-semibold text-[var(--ws-ink)]">
        WaveSketch <span className="font-normal text-[var(--ws-light)]">· MIT · v{__APP_VERSION__}</span>
      </div>

      <div className="col-span-2 row-start-2 flex min-w-0 items-center justify-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <span className="hidden w-14 border-t border-dashed border-[#713b20]/60 md:block" aria-hidden="true" />
        <span className="whitespace-nowrap text-[11px] font-medium text-[var(--ws-muted)] sm:text-xs">
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
              <img
                src={mascotSrc}
                alt=""
                draggable={false}
                className={`ws-mascot-image pointer-events-none absolute max-w-none transition-all duration-200 ${
                  menuOpen
                    ? 'left-1/2 top-1/2 w-[50px] -translate-x-1/2 -translate-y-1/2'
                    : 'left-1/2 top-1/2 w-[33px] -translate-x-1/2 -translate-y-1/2'
                }`}
              />
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
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="hidden w-14 border-t border-dashed border-[#713b20]/60 md:block" aria-hidden="true" />
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
        <span id="busuanzi_container_site_pv" style={{ display: 'none' }} className="rounded-full border border-[var(--ws-border)] bg-[var(--ws-card)] px-2 py-1 text-[var(--ws-muted)]">
          <MousePointerClick className="mr-1 inline size-3 text-primary" />
          {t('visitCountShort')} <strong id="busuanzi_value_site_pv" className="ws-display text-[var(--ws-ink)]" />
        </span>
        <span id="busuanzi_container_site_uv" style={{ display: 'none' }} className="rounded-full border border-[var(--ws-border)] bg-[var(--ws-card)] px-2 py-1 text-[var(--ws-muted)]">
          <Users className="mr-1 inline size-3 text-primary" />
          {t('visitorShort')} <strong id="busuanzi_value_site_uv" className="ws-display text-[var(--ws-ink)]" />
        </span>
      </div>
    </footer>
  );
}
