
declare module 'shift-parser' {
  import { Script, Module } from 'shift-ast';
  export function parseScript(src: string): Script;
  export function parseModule(src: string): Module;
}

