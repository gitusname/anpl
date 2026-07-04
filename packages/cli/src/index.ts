#!/usr/bin/env node
import { Command } from "commander";

const program = new Command()
  .name("anpl")
  .description("AI-native programming language toolchain")
  .version("0.0.0");

program.parse();
