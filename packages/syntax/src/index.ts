import type { Diagnostic, Span } from "@anpl/core";
import type { Token } from "@anpl/lexer";

export type { Trivia } from "@anpl/lexer";

export type CstNode = {
  kind: string;
  span: Span;
  children: Array<CstNode | Token>;
  diagnostics?: Diagnostic[];
  recoveryData?: ParseRecoveryData[];
};

export type ParseRecoveryData = {
  recovered: boolean;
  skippedTokens: Token[];
  reason?: string;
  span?: Span;
};

export function createCstNode(
  kind: string,
  children: Array<CstNode | Token>,
  diagnostics: Diagnostic[] = [],
  recoveryData: ParseRecoveryData[] = []
): CstNode {
  const first = children[0];
  const last = children[children.length - 1] ?? first;
  const span =
    first !== undefined && last !== undefined
      ? {
          file: first.span.file ?? last.span.file,
          start: first.span.start,
          end: last.span.end
        }
      : emptySpan();

  return {
    kind,
    span,
    children,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    recoveryData: recoveryData.length > 0 ? recoveryData : undefined
  };
}

export function createSpannedCstNode(
  kind: string,
  span: Span,
  children: Array<CstNode | Token> = [],
  diagnostics: Diagnostic[] = [],
  recoveryData: ParseRecoveryData[] = []
): CstNode {
  return {
    kind,
    span,
    children,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    recoveryData: recoveryData.length > 0 ? recoveryData : undefined
  };
}

function emptySpan(): Span {
  return {
    start: {
      offset: 0,
      line: 1,
      column: 1
    },
    end: {
      offset: 0,
      line: 1,
      column: 1
    }
  };
}
