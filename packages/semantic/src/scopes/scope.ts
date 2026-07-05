import type { TypeId } from "@anpl/types";

export type Scope = Map<string, TypeId>;

export function createScope(parent?: Scope): Scope {
  return new Map(parent);
}
