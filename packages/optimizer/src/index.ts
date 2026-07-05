import type { IRExpr, IRProgram, IRStmt } from "@anpl/ir";
import type { Diagnostic } from "@anpl/core";
import type {
  MirBlock,
  MirFunction,
  MirInstruction,
  MirProgram,
  MirTerminator
} from "@anpl/mir";

export type OptimizationContext = {
  diagnostics: Diagnostic[];
  passResults: OptimizationPassResult[];
};

export type OptimizationPass = {
  name: string;
  run(program: MirProgram, context: OptimizationContext): MirProgram;
};

export type OptimizationPassResult = {
  name: string;
  changed: boolean;
};

export type OptimizationResult = {
  program: MirProgram;
  diagnostics: Diagnostic[];
  changed: boolean;
  passes: OptimizationPassResult[];
};

export const constantFoldingPass: OptimizationPass = {
  name: "constant-folding",
  run(program) {
    return mapMirProgram(program, (block) => foldBlockConstants(block));
  }
};

export const deadBranchRemovalPass: OptimizationPass = {
  name: "dead-branch-removal",
  run(program) {
    return mapMirProgram(program, (block) => removeDeadBranch(block));
  }
};

export const unusedLocalEliminationPass: OptimizationPass = {
  name: "unused-local-elimination",
  run(program) {
    return {
      functions: program.functions.map((fn) => ({
        ...fn,
        blocks: fn.blocks.map(eliminateUnusedTargets)
      }))
    };
  }
};

export const copyPropagationPass: OptimizationPass = {
  name: "copy-propagation",
  run(program) {
    return mapMirProgram(program, propagateCopiesInBlock);
  }
};

export const defaultMirOptimizationPasses: OptimizationPass[] = [
  constantFoldingPass,
  copyPropagationPass,
  deadBranchRemovalPass,
  unusedLocalEliminationPass
];

export function optimizeMir(
  program: MirProgram,
  passes: OptimizationPass[] = defaultMirOptimizationPasses
): OptimizationResult {
  const context: OptimizationContext = {
    diagnostics: [],
    passResults: []
  };
  let current = program;
  let changed = false;

  for (const pass of passes) {
    const before = stableJson(current);
    const after = pass.run(current, context);
    const passChanged = stableJson(after) !== before;
    context.passResults.push({
      name: pass.name,
      changed: passChanged
    });
    changed ||= passChanged;
    current = after;
  }

  return {
    program: current,
    diagnostics: context.diagnostics,
    changed,
    passes: context.passResults
  };
}

export function optimizeProgram(program: IRProgram): IRProgram {
  return {
    modules: program.modules.map((moduleDecl) => ({
      ...moduleDecl,
      functions: moduleDecl.functions.map((fn) => ({
        ...fn,
        body: fn.body.map(optimizeStmt)
      }))
    }))
  };
}

function mapMirProgram(
  program: MirProgram,
  mapBlock: (block: MirBlock, fn: MirFunction) => MirBlock
): MirProgram {
  return {
    functions: program.functions.map((fn) => ({
      ...fn,
      blocks: fn.blocks.map((block) => mapBlock(block, fn))
    }))
  };
}

function foldBlockConstants(block: MirBlock): MirBlock {
  const constants = new Map<string, unknown>();
  const instructions = block.instructions.map((instruction) => {
    if (instruction.op === "const") {
      constants.set(instruction.target, instruction.value);
      return instruction;
    }

    if (instruction.op === "binary") {
      const left = constants.get(instruction.left);
      const right = constants.get(instruction.right);
      const folded = foldUnknownBinary(instruction.operator, left, right);
      if (folded !== undefined) {
        constants.set(instruction.target, folded);
        return {
          op: "const" as const,
          target: instruction.target,
          value: folded,
          type: instruction.type
        };
      }
      constants.delete(instruction.target);
      return instruction;
    }

    const target = targetOf(instruction);
    if (target !== undefined) {
      constants.delete(target);
    }
    return instruction;
  });

  return {
    ...block,
    instructions
  };
}

function removeDeadBranch(block: MirBlock): MirBlock {
  if (block.terminator.kind !== "branch") {
    return block;
  }

  const constants = constantsInBlock(block);
  const condition = constants.get(block.terminator.condition);
  if (typeof condition !== "boolean") {
    return block;
  }

  return {
    ...block,
    terminator: {
      kind: "jump",
      target: condition ? block.terminator.thenBlock : block.terminator.elseBlock
    }
  };
}

function propagateCopiesInBlock(block: MirBlock): MirBlock {
  const copies = new Map<string, string>();
  const instructions = block.instructions.map((instruction) => {
    const rewritten = rewriteInstructionValues(instruction, copies);

    if (rewritten.op === "store") {
      copies.set(rewritten.symbol, canonicalValue(rewritten.value, copies));
      return rewritten;
    }

    const target = targetOf(rewritten);
    if (target !== undefined) {
      copies.delete(target);
    }

    return rewritten;
  });

  return {
    ...block,
    instructions,
    terminator: rewriteTerminatorValues(block.terminator, copies)
  };
}

function eliminateUnusedTargets(block: MirBlock): MirBlock {
  let current = block;

  while (true) {
    const used = usedValuesInBlock(current);
    const instructions = current.instructions.filter((instruction) => {
      const target = targetOf(instruction);
      return target === undefined || used.has(target) || hasSideEffect(instruction);
    });

    if (instructions.length === current.instructions.length) {
      return current;
    }

    current = {
      ...current,
      instructions
    };
  }
}

function rewriteInstructionValues(
  instruction: MirInstruction,
  copies: Map<string, string>
): MirInstruction {
  switch (instruction.op) {
    case "store":
      return {
        ...instruction,
        value: canonicalValue(instruction.value, copies)
      };
    case "binary":
      return {
        ...instruction,
        left: canonicalValue(instruction.left, copies),
        right: canonicalValue(instruction.right, copies)
      };
    case "call":
      return {
        ...instruction,
        args: instruction.args.map((arg) => canonicalValue(arg, copies))
      };
    case "record":
      return {
        ...instruction,
        fields: Object.fromEntries(
          Object.entries(instruction.fields).map(([field, value]) => [
            field,
            canonicalValue(value, copies)
          ])
        )
      };
    case "member":
      return {
        ...instruction,
        object: canonicalValue(instruction.object, copies)
      };
    case "const":
    case "load":
      return instruction;
  }
}

function rewriteTerminatorValues(
  terminator: MirTerminator,
  copies: Map<string, string>
): MirTerminator {
  switch (terminator.kind) {
    case "return":
      return {
        ...terminator,
        value:
          terminator.value === undefined
            ? undefined
            : canonicalValue(terminator.value, copies)
      };
    case "branch":
      return {
        ...terminator,
        condition: canonicalValue(terminator.condition, copies)
      };
    case "jump":
      return terminator;
  }
}

function constantsInBlock(block: MirBlock): Map<string, unknown> {
  const constants = new Map<string, unknown>();

  for (const instruction of block.instructions) {
    if (instruction.op === "const") {
      constants.set(instruction.target, instruction.value);
      continue;
    }

    const target = targetOf(instruction);
    if (target !== undefined) {
      constants.delete(target);
    }
  }

  return constants;
}

function usedValuesInBlock(block: MirBlock): Set<string> {
  const used = new Set<string>();

  for (const instruction of block.instructions) {
    for (const value of valuesUsedByInstruction(instruction)) {
      used.add(value);
    }
  }

  for (const value of valuesUsedByTerminator(block.terminator)) {
    used.add(value);
  }

  return used;
}

function valuesUsedByInstruction(instruction: MirInstruction): string[] {
  switch (instruction.op) {
    case "const":
    case "load":
      return [];
    case "store":
      return [instruction.value];
    case "binary":
      return [instruction.left, instruction.right];
    case "call":
      return instruction.args;
    case "record":
      return Object.values(instruction.fields);
    case "member":
      return [instruction.object];
  }
}

function valuesUsedByTerminator(terminator: MirTerminator): string[] {
  switch (terminator.kind) {
    case "return":
      return terminator.value === undefined ? [] : [terminator.value];
    case "branch":
      return [terminator.condition];
    case "jump":
      return [];
  }
}

function targetOf(instruction: MirInstruction): string | undefined {
  switch (instruction.op) {
    case "const":
    case "load":
    case "binary":
    case "record":
    case "member":
      return instruction.target;
    case "call":
      return instruction.target;
    case "store":
      return undefined;
  }
}

function hasSideEffect(instruction: MirInstruction): boolean {
  return instruction.op === "call" || instruction.op === "store";
}

function canonicalValue(value: string, copies: Map<string, string>): string {
  let current = value;
  const seen = new Set<string>();

  while (copies.has(current) && !seen.has(current)) {
    seen.add(current);
    current = copies.get(current)!;
  }

  return current;
}

function foldUnknownBinary(
  operator: string,
  left: unknown,
  right: unknown
): string | number | boolean | null | undefined {
  if (
    (typeof left === "number" ||
      typeof left === "string" ||
      typeof left === "boolean" ||
      left === null) &&
    (typeof right === "number" ||
      typeof right === "string" ||
      typeof right === "boolean" ||
      right === null)
  ) {
    return foldBinary(operator, left, right);
  }
  return undefined;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function optimizeStmt(stmt: IRStmt): IRStmt {
  switch (stmt.op) {
    case "let":
      return {
        ...stmt,
        value: optimizeExpr(stmt.value)
      };
    case "return":
      return {
        ...stmt,
        value: stmt.value ? optimizeExpr(stmt.value) : undefined
      };
    case "if":
      return {
        ...stmt,
        condition: optimizeExpr(stmt.condition),
        thenBody: stmt.thenBody.map(optimizeStmt),
        elseBody: stmt.elseBody?.map(optimizeStmt)
      };
    case "expr":
      return {
        ...stmt,
        expression: optimizeExpr(stmt.expression)
      };
  }
}

function optimizeExpr(expr: IRExpr): IRExpr {
  switch (expr.op) {
    case "binary": {
      const left = optimizeExpr(expr.left);
      const right = optimizeExpr(expr.right);

      if (left.op === "literal" && right.op === "literal") {
        const folded = foldBinary(expr.operator, left.value, right.value);
        if (folded !== undefined) {
          return {
            op: "literal",
            value: folded
          };
        }
      }

      return {
        ...expr,
        left,
        right
      };
    }
    case "call":
      return {
        ...expr,
        args: expr.args.map(optimizeExpr)
      };
    case "record":
      return {
        ...expr,
        fields: expr.fields.map((field) => ({
          ...field,
          value: optimizeExpr(field.value)
        }))
      };
    case "member":
      return {
        ...expr,
        object: optimizeExpr(expr.object)
      };
    case "literal":
    case "load":
      return expr;
  }
}

function foldBinary(
  operator: string,
  left: string | number | boolean | null,
  right: string | number | boolean | null
): string | number | boolean | null | undefined {
  if (typeof left === "number" && typeof right === "number") {
    switch (operator) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return left / right;
      case "%":
        return left % right;
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      default:
        return undefined;
    }
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    if (operator === "and") {
      return left && right;
    }
    if (operator === "or") {
      return left || right;
    }
  }

  if (operator === "==" || operator === "!=") {
    return operator === "==" ? left === right : left !== right;
  }

  return undefined;
}
