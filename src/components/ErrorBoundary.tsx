import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-lg mx-auto p-6 m-6 bg-white rounded-2xl border border-rose-200">
        <h1 className="text-lg font-bold text-rose-800">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-700">Your saved data is safe. Reload the page — if this keeps happening, restore a backup from Settings.</p>
        <button type="button" className="mt-4 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
