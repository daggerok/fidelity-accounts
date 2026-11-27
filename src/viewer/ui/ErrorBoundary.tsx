/// <reference lib="esnext" />
import { Component } from 'react';
import { t } from '../app/i18n';
import { Banner } from './Banner';
import { SettingsResets } from './SettingsPanel';

// A screen that throws while it draws (Summary, Positions) shows this instead of a blank page. The dataset comes back
// from IndexedDB before the network on every reload, so a copy that crashes the screen would crash it again each time,
// and Full reset lives in ⚙️ Settings: the fallback carries Reset view and Full reset itself (SettingsResets, the same
// buttons). It clears when `resetKey` changes (a new copy of the data, another tab): the children get their data as
// props on every mount and keep none of their own across it (lessons-learned 2026-10-24-error-boundary-remount-state)
interface Props { resetKey: string; children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown): void {
    console.error('fidelity-accounts: the screen failed to draw', error);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Banner>
        <div className="flex flex-col gap-2" data-error-boundary>
          <span>{t('This screen could not be drawn: {error}', { error: error.message })}</span>
          <span className="text-xs">{t('Reset usually helps; with Full ticked it also forgets the cached data and the Google setup.')}</span>
          <SettingsResets />
        </div>
      </Banner>
    );
  }
}
