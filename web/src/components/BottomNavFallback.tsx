const tabs = ["My List", "Local Files", "Vocabulary"] as const;

export function BottomNavFallback() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950/95">
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((label) => (
          <li key={label} className="flex-1">
            <span className="flex min-h-14 items-center justify-center text-xs font-medium text-zinc-400">
              {label}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
