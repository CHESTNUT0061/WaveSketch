import { useState } from 'react';
import { ArrowLeft, ExternalLink, Github, Info, Languages, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from '@/lib/siteLinks';
import { CHANGELOG_ENTRIES } from '@/lib/changelog';

export function AppHeader() {
  const { t, lang, setLang } = useI18n();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  return (
    <header className="grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--ws-border)] bg-white/45 px-2 py-1.5 sm:px-5">
      <div aria-hidden="true" />

      <div className="flex min-w-0 items-center justify-center gap-2.5">
        <img
          src={`${import.meta.env.BASE_URL}favicon-64.png`}
          alt=""
          draggable={false}
          className="ws-brand-image size-8 shrink-0 rounded-md object-cover shadow-sm sm:size-9"
        />
        <h1 className="ws-brand-wordmark truncate text-[23px] leading-none sm:text-[28px]">
          WaveSketch
        </h1>
      </div>

      <div className="flex shrink-0 items-center justify-self-end gap-1.5 sm:gap-2">
        <Dialog open={aboutOpen} onOpenChange={(open) => { setAboutOpen(open); if (!open) setShowChangelog(false); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="border-[var(--ws-border)] bg-[var(--ws-card)]" aria-label={t('aboutButton')}>
              <Info className="size-4" />
              <span className="hidden sm:inline">{t('aboutButton')}</span>
            </Button>
          </DialogTrigger>
          <DialogContent
            className="fixed flex w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col overflow-hidden border-[var(--ws-border)] bg-[var(--ws-cream)] p-0 sm:w-full sm:max-w-xl"
          >
            <div className="h-1 bg-primary" />
            <div className="relative">
            <div className={`ws-about-body flex flex-col p-3 sm:p-7 ${showChangelog ? 'invisible pointer-events-none' : ''}`}>
              <DialogHeader>
                <div className="mb-2 flex min-w-0 items-center gap-2 pr-8 sm:mb-4 sm:gap-3">
                  <img
                    src={`${import.meta.env.BASE_URL}favicon-64.png`}
                    alt=""
                    draggable={false}
                    className="ws-brand-image size-8 shrink-0 rounded-lg sm:size-11"
                  />
                  <div className="min-w-0">
                    <div className="ws-display truncate text-xl font-bold tracking-[0.04em] text-[var(--ws-ink)]">WaveSketch</div>
                    <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Open waveform workspace</div>
                  </div>
                </div>
                <DialogTitle className="ws-display text-xl leading-tight font-semibold text-[var(--ws-ink)] sm:text-3xl">
                  {t('aboutTitle')}
                </DialogTitle>
                <DialogDescription className="max-w-lg pt-1 text-xs leading-4 text-[var(--ws-muted)] sm:text-sm sm:leading-6">
                  {t('aboutDescription')}
                </DialogDescription>
              </DialogHeader>

              <div className="my-3 grid shrink-0 grid-cols-3 gap-1.5 sm:my-6 sm:gap-3">
                {[t('aboutFeatureDraw'), t('aboutFeatureCompute'), t('aboutFeatureExport')].map((item, index) => (
                  <div key={item} className="rounded-xl border border-[var(--ws-border)] bg-[var(--ws-card)] p-2 sm:p-3">
                    <div className="ws-display mb-1 text-base font-bold text-primary sm:mb-2 sm:text-lg">0{index + 1}</div>
                    <div className="text-[0.6875rem] leading-4 font-medium text-[var(--ws-ink)] sm:text-sm">{item}</div>
                  </div>
                ))}
              </div>

              <div className="grid shrink-0 grid-cols-[2rem_repeat(3,minmax(0,1fr))] items-center gap-1.5 border-t border-[var(--ws-border)] pt-3 sm:gap-2 sm:pt-4">
                <img
                  src={`${import.meta.env.BASE_URL}chestnut-closed.png`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="ws-mascot-image size-8 object-contain"
                />
                <Button asChild size="sm" className="h-7 min-h-7 w-full gap-1 px-1 text-[0.6875rem] sm:h-8 sm:text-xs">
                  <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                    <Github className="size-3.5" />GitHub<ExternalLink className="size-3" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-7 min-h-7 w-full gap-1 px-1 text-[0.6875rem] sm:h-8 sm:text-xs">
                  <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
                    <MessageSquareText className="size-3.5" />{t('linkFeedback')}
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="h-7 min-h-7 w-full px-1 text-[0.6875rem] sm:h-8 sm:text-xs" onClick={() => setShowChangelog(true)}>
                  {t('changelogButton')}
                </Button>
              </div>
            </div>
            {showChangelog && (
              <div className="ws-about-body absolute inset-0 flex min-h-0 flex-col bg-[var(--ws-cream)] p-3 sm:p-7">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2 sm:mb-5">
                  <DialogTitle className="ws-display text-2xl font-semibold text-[var(--ws-ink)] sm:text-3xl">
                    {t('changelogTitle')}
                  </DialogTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowChangelog(false)}>
                    <ArrowLeft className="size-4" />{t('changelogBack')}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:space-y-5" aria-label={t('changelogTitle')}>
                  {CHANGELOG_ENTRIES.map((entry) => (
                    <section key={entry.version} className="rounded-xl border border-[var(--ws-border)] bg-[var(--ws-card)] p-3 sm:p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h3 className="ws-display text-lg font-bold text-primary">v{entry.version}</h3>
                        <span className="text-xs text-[var(--ws-muted)]">{entry.date}</span>
                      </div>
                      <div className="mt-1 text-xs font-medium text-[var(--ws-muted)]">{entry.comparison[lang]}</div>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-5 text-[var(--ws-ink)]">
                        {entry.changes.map((change) => <li key={change.zh}>{change[lang]}</li>)}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="border-[var(--ws-border)] bg-[var(--ws-card)]"
          title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          <Languages className="size-4" />
          {lang === 'zh' ? 'EN' : '中文'}
        </Button>
      </div>
    </header>
  );
}
