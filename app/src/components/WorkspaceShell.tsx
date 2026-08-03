import React from 'react';
import { PanelRightClose, PanelRightOpen, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';

const INSPECTOR_SIZE_KEY = 'wavesketch.ui.inspectorSize';
const INSPECTOR_COLLAPSED_KEY = 'wavesketch.ui.inspectorCollapsed';

type ViewportMode = 'desktop' | 'tablet' | 'phone';

function getViewportMode(): ViewportMode {
  if (window.innerWidth < 640) return 'phone';
  if (window.innerWidth < 1024) return 'tablet';
  return 'desktop';
}

function readInspectorSize() {
  try {
    const value = Number(localStorage.getItem(INSPECTOR_SIZE_KEY));
    if (Number.isFinite(value)) return Math.min(38, Math.max(22, value));
  } catch { /* ignore */ }
  return 28;
}

function readInspectorCollapsed() {
  try { return localStorage.getItem(INSPECTOR_COLLAPSED_KEY) === 'true'; } catch { return false; }
}

interface WorkspaceShellProps {
  main: React.ReactNode;
  inspector: React.ReactNode;
}

export function WorkspaceShell({ main, inspector }: WorkspaceShellProps) {
  const { t } = useI18n();
  const [viewportMode, setViewportMode] = React.useState<ViewportMode>(getViewportMode);
  const [inspectorSize, setInspectorSize] = React.useState(readInspectorSize);
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(readInspectorCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => setViewportMode(getViewportMode());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleInspector = () => {
    setInspectorCollapsed((collapsed) => {
      const next = !collapsed;
      try { localStorage.setItem(INSPECTOR_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  if (viewportMode === 'desktop') {
    if (inspectorCollapsed) {
      return (
        <div className="relative h-full min-h-0">
          {main}
          <Button
            size="sm"
            className="absolute right-3 top-3 z-30 shadow-lg"
            onClick={toggleInspector}
            aria-label={t('openInspector')}
          >
            <PanelRightOpen className="size-4" />{t('inspectorButton')}
          </Button>
        </div>
      );
    }

    return (
      <ResizablePanelGroup
        id="wavesketch-workspace"
        orientation="horizontal"
        onLayoutChanged={(layout, meta) => {
          if (!meta.isUserInteraction || typeof layout.inspector !== 'number') return;
          const next = Math.min(38, Math.max(22, layout.inspector));
          setInspectorSize(next);
          try { localStorage.setItem(INSPECTOR_SIZE_KEY, String(next)); } catch { /* ignore */ }
        }}
        className="h-full min-h-0"
      >
        <ResizablePanel id="canvas" defaultSize={`${100 - inspectorSize}%`} minSize="62%" className="min-w-0">
          <div className="h-full min-h-0 pr-2">{main}</div>
        </ResizablePanel>
        <ResizableHandle withHandle className="mx-1 w-2 rounded-full bg-[var(--ws-accent-light)] after:w-3" />
        <ResizablePanel id="inspector" defaultSize={`${inspectorSize}%`} minSize="22%" maxSize="38%" className="min-w-0">
          <div className="relative h-full min-h-0 pl-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3 z-30 text-[var(--ws-muted)]"
              onClick={toggleInspector}
              aria-label={t('closeInspector')}
              title={t('closeInspector')}
            >
              <PanelRightClose className="size-4" />
            </Button>
            {inspector}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  const openButton = (
    <Button
      size="sm"
      className="absolute right-3 top-3 z-30 shadow-lg"
      onClick={() => setMobileOpen(true)}
      aria-label={t('openInspector')}
    >
      <Waves className="size-4" />{t('inspectorButton')}
    </Button>
  );

  return (
    <div className="relative h-full min-h-0">
      {main}
      {openButton}

      {viewportMode === 'tablet' ? (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent className="w-[min(92vw,430px)] max-w-none gap-0 border-[var(--ws-border)] bg-[var(--ws-cream)] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{t('groupPanelTitle')}</SheetTitle>
              <SheetDescription>{t('inspectorDescription')}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden p-3">{inspector}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          direction="bottom"
          disablePreventScroll={false}
        >
          <DrawerContent className="min-h-0 h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-hidden border-[var(--ws-border)] bg-[var(--ws-cream)]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>{t('groupPanelTitle')}</DrawerTitle>
              <DrawerDescription>{t('inspectorDescription')}</DrawerDescription>
            </DrawerHeader>
            <div
              className="min-h-0 flex-1 overflow-hidden overscroll-contain touch-pan-y p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"
              data-vaul-no-drag
            >
              {inspector}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
