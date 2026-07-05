import type { TypeRef } from "@anpl/ast";

export type Scope = Map<string, TypeRef>;

export function createScope(parent?: Scope): Scope {
  return new Map(parent);
}
