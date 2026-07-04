# ANPL Grammar v0.1

This grammar documents the implemented ANPL v0.1 syntax. It is intentionally
small, machine-first, and compiler-friendly: each construct maps directly to AST
nodes in `packages/ast`.

## Machine-First Grammar Contract

ANPL grammar is designed for AI-generated programs.

The grammar prioritizes:

* deterministic parsing
* low ambiguity
* explicit structure
* stable formatting
* easy repair by AI coding tools
* direct mapping into AST and IR
* structured diagnostics on invalid output

Human readability is useful, but it is not the primary goal.

The primary goal is that AI systems can generate valid ANPL more reliably than
they generate large human-first codebases directly.

## Canonical Form

Every valid ANPL program should eventually have one canonical formatted
representation.

This is important because AI coding tools need stable diffs, stable diagnostics,
and stable repair loops.

Future ANPL tooling should include:

```bash
anpl format file.anpl
```

## Lexical Rules

```ebnf
identifier      = letter, { letter | digit | "_" } ;
number          = digit, { digit }, [ ".", digit, { digit } ] ;
string          = '"', { character | escape }, '"' ;
comment         = "#", { character - newline } ;
newline         = "\n" | "\r\n" ;
```

Comments are ignored by the lexer. Newlines are preserved as statement and field
separators.

## Program Structure

```ebnf
program         = { newline }, module_decl, { module_decl | newline } ;

module_decl     = "module", identifier, separators, { module_item, separators } ;
module_item     = import_decl | type_decl | function_decl ;

import_decl     = "import", identifier ;
```

The current implementation supports simple same-file module imports:
`import math` brings exported functions and types from `module math` into the
current module's semantic scope.

## Types

```ebnf
type_decl       = "type", identifier, "{", separators,
                  { field_decl, field_separator },
                  "}" ;

field_decl      = identifier, [ "?" ], ":", type_ref ;

type_ref        = type_name, [ "[", type_ref, { ",", type_ref }, "]" ] ;
type_name       = identifier | "int" | "decimal" | "text" | "string"
                | "bool" | "uuid" | "enum" ;
```

Enum fields use `enum[...]` type references:

```anpl
type Customer {
  status: enum[active, archived]
}
```

Record literals may use bare enum variants when the expected field type is an
enum:

```anpl
Customer {
  status: active
}
```

## Functions And Statements

```ebnf
function_decl   = "fn", identifier, "(", [ params ], ")", "->", type_ref, block ;
params          = param, { ",", param } ;
param           = identifier, ":", type_ref ;

block           = "{", separators, { statement, separators }, "}" ;
statement       = let_stmt | return_stmt | if_stmt | expr_stmt ;

let_stmt        = "let", identifier, [ ":", type_ref ], "=", expression ;
return_stmt     = "return", [ expression ] ;
if_stmt         = "if", expression, block, [ "else", ( block | if_stmt ) ] ;
expr_stmt       = expression ;
```

Non-`void` functions must return on all statically obvious paths. The semantic
analyzer reports `ANPL_RETURN_MISSING` when a function can complete without a
return value.

## Expressions

```ebnf
expression      = or_expr ;
or_expr         = and_expr, { "or", and_expr } ;
and_expr        = equality_expr, { "and", equality_expr } ;
equality_expr   = comparison_expr, { ( "==" | "!=" ), comparison_expr } ;
comparison_expr = term_expr, { ( "<" | "<=" | ">" | ">=" ), term_expr } ;
term_expr       = factor_expr, { ( "+" | "-" ), factor_expr } ;
factor_expr     = call_expr, { ( "*" | "/" | "%" ), call_expr } ;

call_expr       = primary_expr, { call_suffix | member_suffix } ;
call_suffix     = "(", [ expression, { ",", expression } ], ")" ;
member_suffix   = ".", identifier ;

primary_expr    = number
                | string
                | "true"
                | "false"
                | "null"
                | record_expr
                | identifier
                | "(", expression, ")" ;

record_expr     = identifier, "{", separators,
                  { record_field, field_separator },
                  "}" ;
record_field    = identifier, ":", expression ;
```

## Separators

```ebnf
separators      = { newline } ;
field_separator = { "," | newline } ;
```

Statements are newline-separated. Type fields and record fields may be separated
by newlines or commas.
