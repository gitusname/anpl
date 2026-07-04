# ANPL

**ANPL** is an experimental AI-native programming language and diagnostics layer for coding agents.

ANPL helps AI coding agents represent software intent in a compact, validated, and compiler-friendly format before generating production code.

> Status: experimental, early draft.

## Why ANPL?

Modern coding agents can generate code, but they often struggle with:

- ambiguous natural language requirements
- long terminal logs and noisy stack traces
- inconsistent project structure
- repeated fix loops
- high token usage during debugging

ANPL explores a different approach:

```text
Human intent
    ↓
AI-generated ANPL
    ↓
Validation
    ↓
Code generation
    ↓
AI-friendly diagnostics
