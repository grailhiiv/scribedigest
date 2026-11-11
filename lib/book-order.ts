// Books added after the last saved order stay at the top in date order.
export function sortBooksByOrder<T extends { id: string }>(books: T[], order: unknown[]): T[] {
  const positions = new Map<string, number>();
  order.forEach((id, index) => { if (typeof id === 'string' && !positions.has(id)) positions.set(id, index); });
  return [...books].sort((a, b) => (positions.get(a.id) ?? -1) - (positions.get(b.id) ?? -1));
}
