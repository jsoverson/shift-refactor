
import * as tsdoc from '@microsoft/api-extractor-model/node_modules/@microsoft/tsdoc';

import api from '../../temp/shift-refactor.api.json';
import vm from 'vm';

const API = (api as unknown) as IApiItemJson;

const parser = new tsdoc.TSDocParser();

interface IApiItemJson {
  kind: string;
  canonicalReference: string;
  members?: IApiItemJson[];
  docComment?: string;
}

(function main() {
  const success = walk([api]);
  if (!success) throw new Error('not ok: tests failed');
  else console.log('ok: examples passed');
})();

function walk(nodes: IApiItemJson[]) {
  let success = true;
  nodes.forEach((node: IApiItemJson) => {
    if (node.docComment) {
      const src = extractCode(node.docComment);
      const assertion = extractCode(node.docComment, '@assert');
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
          success = false;
        }
      }
    }
    if (node.members) {
      const result = walk(node.members);
      if (success) success = result;
    }
  });
  return success;
}

function extractCode(tsdoc: string, type = '@example') {
  const { docComment } = parser.parseString(tsdoc);
  const example = docComment.customBlocks.find(x => x.blockTag.tagName === type);
  if (example) {
    const fencedCode = example.content.nodes.find(
      (contentNode: tsdoc.DocNode) => contentNode.kind === 'FencedCode',
    ) as tsdoc.DocFencedCode;
    return fencedCode.code;
  }
}

// function runExample()
