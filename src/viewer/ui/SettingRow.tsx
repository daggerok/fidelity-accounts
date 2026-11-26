/// <reference lib="esnext" />
// One line of ⚙️ Settings: its control (a toggle, a row of pills) and a short text beside it that says what it does.
// One component for every such line (rules/reusable-components.md): notifications, the theme, the language, watching
export function SettingRow({ control, children }: { control: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-setting-row>
      {control}
      <span className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">{children}</span>
    </div>
  );
}
