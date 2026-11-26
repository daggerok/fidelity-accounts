/// <reference lib="esnext" />
// The red line under the navbar for what went wrong and stays until it is fixed: the dataset, the Google connection and
// the sheet reads (App), and a screen that crashed (ErrorBoundary). One markup for all of them
export function Banner({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200" data-banner>{children}</div>;
}
