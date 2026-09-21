export function isValidObjectId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/** Deterministically orders a user pair so the same two users always
 * produce the same (userOne, userTwo) tuple, regardless of who acted first.
 * Backs Match's unique compound index. */
export function orderUserIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
