/** "Irakli Gvishiani" → "IG"; falls back to the email ("john.doe@x.com" → "JD"). */
export function initialsOf(name: string | null | undefined, fallback?: string | null): string {
  const source = name?.trim() || fallback || '';
  return (
    source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'
  );
}
