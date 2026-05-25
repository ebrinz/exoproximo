const TABLE: Record<string, number> = {
  S: 0x7ee8ff,
  C: 0xffb547,
  B: 0xffb547,
  M: 0xb18cff,
  X: 0xb18cff,
  Q: 0x8af0a7,
  V: 0x8af0a7,
};

export function specClassColor(spec: string | null | undefined): number {
  if (!spec) return 0x6b7385;
  const first = spec.charAt(0).toUpperCase();
  return TABLE[first] ?? 0x6b7385;
}
