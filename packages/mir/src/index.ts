import type { HirProgram } from "@anpl/hir";
import type { SymbolId } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";

export type MirProgram = {
  functions: MirFunction[];
};

export type MirFunction = {
  id: SymbolId;
  params: MirLocal[];
  returnType: TypeId;
  blocks: MirBlock[];
};

export type MirLocal = {
  name: string;
  type: TypeId;
};

export type MirBlock = {
  id: string;
  instructions: MirInstruction[];
  terminator: MirTerminator;
};

export type MirInstruction =
  | { op: "const"; target: string; value: unknown; type: TypeId }
  | { op: "load"; target: string; symbol: SymbolId; type: TypeId }
  | { op: "store"; symbol: SymbolId; value: string }
  | { op: "binary"; target: string; operator: string; left: string; right: string; type: TypeId }
  | { op: "call"; target?: string; callee: SymbolId; args: string[]; type: TypeId }
  | { op: "record"; target: string; type: TypeId; fields: Record<string, string> }
  | { op: "member"; target: string; object: string; field: string; type: TypeId };

export type MirTerminator =
  | { kind: "return"; value?: string }
  | { kind: "jump"; target: string }
  | { kind: "branch"; condition: string; thenBlock: string; elseBlock: string };

export function lowerHirToMir(program: HirProgram): MirProgram {
  return {
    functions: program.modules.flatMap((moduleDecl) =>
      moduleDecl.functions.map((fn) => ({
        id: fn.id,
        params: fn.params.map((param) => ({
          name: param.name,
          type: param.type
        })),
        returnType: fn.returnType,
        blocks: [
          {
            id: `${fn.id}.entry`,
            instructions: [],
            terminator: {
              kind: "return"
            }
          }
        ]
      }))
    )
  };
}
