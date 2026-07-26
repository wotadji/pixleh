export function OrDivider({ label = "ou" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-400">
      <div className="h-px flex-1 bg-gray-200" />
      {label}
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
