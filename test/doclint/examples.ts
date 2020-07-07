
import * as tsdoc from '@microsoft/api-extractor-model/node_modules/@microsoft/tsdoc';
import { TSDocEmitter, StringBuilder } from '@microsoft/api-extractor-model/node_modules/@microsoft/tsdoc';

import api from '../../temp/shift-refactor.api.json';
import vm from 'vm';
import { fail } from 'assert';
import { identityLogger } from '../../src/util';

const customConfiguration: tsdoc.TSDocConfiguration = new tsdoc.TSDocConfiguration();
customConfiguration.addTagDefinitions([
  new tsdoc.TSDocTagDefinition({
    tagName: '@assert',
    syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag
  })
]);

const parser = new tsdoc.TSDocParser(customConfiguration);

interface IApiItemJson {
  kind: string;
  canonicalReference: string;
  members?: IApiItemJson[];
  docComment?: string;
}

(function main() {
  const failures = walk([api]);
  if (failures > 0) throw new Error(`not ok: ${failures} tests failed`);
  else console.log('ok: examples passed');
})();

function walk(nodes: IApiItemJson[]) {
  let failures = 0;
  nodes.forEach((node: IApiItemJson) => {
    if (node.docComment) {
      const src = extractFencedBlock(node.docComment);
      const assertion = extractCodeOnlyBlock(node.docComment);
      if (src) {
        const localizedSrc = src.replace('shift-refactor', '../../');
        const wrappedSrc = `const assert = require('assert');\n${localizedSrc};\n ${assertion}`
        try {
          const context = { require };
          vm.createContext(context);
          vm.runInContext(wrappedSrc, context);
        } catch (e) {
          console.log(`>>>> Error in ${node.canonicalReference}`);
          console.log(e);
          console.log(`${wrappedSrc}`);
          failures++;
        }
      }
    }
    if (node.members) {
      const childFailures = walk(node.members);
      failures += childFailures;
    }
  });
  return failures;
}

function extractFencedBlock(tsdoc: string, type = '@example') {
  const { docComment } = parser.parseString(tsdoc);
  const example = docComment.customBlocks.find(x => x.blockTag.tagName === type);
  if (example) {
    const fencedCode = example.content.nodes.find(
      (contentNode: tsdoc.DocNode) => contentNode.kind === 'FencedCode',
    ) as tsdoc.DocFencedCode;
    return fencedCode.code;
  }
}

function extractCodeOnlyBlock(tsdoc: string, type = '@assert') {
  const { docComment } = parser.parseString(tsdoc);
  const block = docComment.customBlocks.find(x => x.blockTag.tagName === type) as tsdoc.DocBlock;
  if (block) {
    const fencedCode = block.content.nodes.find(
      (contentNode: tsdoc.DocNode) => contentNode.kind === 'FencedCode',
    ) as tsdoc.DocFencedCode;
    return fencedCode.code;
  }
}

