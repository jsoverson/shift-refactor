import {default as codegen, FormattedCodeGen} from '@jsoverson/shift-codegen';
import * as tsdoc from '@microsoft/api-extractor-model/node_modules/@microsoft/tsdoc';
import vm from 'vm';
import api from '../../generated/shift-refactor.api.json';

const {testFunction, wrapAssertion} = require('./source-parts');

const customConfiguration: tsdoc.TSDocConfiguration = new tsdoc.TSDocConfiguration();
customConfiguration.addTagDefinitions([
  new tsdoc.TSDocTagDefinition({
    tagName: '@assert',
    syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag,
  }),
]);

const parser = new tsdoc.TSDocParser(customConfiguration);

interface IApiItemJson {
  kind: string;
  canonicalReference: string;
  members?: IApiItemJson[];
  docComment?: string;
}

type Replacement = {from: string | RegExp; to: string};
class Replacements {
  replacements: Replacement[] = [];
  constructor(replacements: Replacement[]) {
    this.replacements = replacements;
  }
  replace(str: string) {
    return this.replacements.reduce(
      (str: string, replacement: Replacement) => str.replace(replacement.from, replacement.to),
      str,
    );
  }
}
type Interception = {id: string; handler: (id: string, module: any) => any};
class Interceptor {
  interceptions: Interception[] = [];
  constructor(interceptions: Interception[]) {
    this.interceptions = interceptions;
  }
  handle(id: string, originalModule: any) {
    id = require.resolve(id);
    return this.interceptions
      .filter(i => i.id === id)
      .reduce((module: any, int: Interception) => int.handler(id, module), originalModule);
  }
  isHandled(id: string) {
    return this.interceptions.filter(i => i.id === id).length > 0;
  }
  modules() {
    return this.interceptions.map(i => i.id);
  }
}
const replacer = new Replacements([{from: /shift-refactor/g, to: '../../'}]);

(function main() {
  const failures = walk([api]);
  if (failures > 0) throw new Error(`not ok: ${failures} tests failed`);
  else console.log('ok: examples passed');
})();

function walk(nodes: IApiItemJson[]) {
  let failures = 0;
  nodes.forEach((node: IApiItemJson) => {
    if (node.docComment) {
      const exampleSource = replacer.replace(extractFencedBlock(node.docComment));
      const assertSource = replacer.replace(extractCodeOnlyBlock(node.docComment));
      if (exampleSource) {
        const reference = findMethod(node.canonicalReference);
        reference.package = replacer.replace(reference.package);
        const testSrc = testFunction;
        try {
          //   const interceptor = new Interceptor([
          //     {
          //       id: require.resolve(reference.package),
          //       handler: (id: string, module: any) => {
          //         module.RefactorSessionChainable.prototype
          //         return new Proxy(module, {
          //           get: function (target: any, prop: string) {
          //             const orig = target[prop];
          //             if (prop === reference.name) {
          //               if (orig.spy) return orig.spy;
          //               if (typeof orig === 'function') return makeSpy(orig);
          //             }
          //             return orig;
          //           }
          //         });
          //       }
          //     }
          //   ]);
          //   interceptor.modules().forEach(id => require.cache[id]);
          //   const _require: NodeJS.Require = (function () {
          //     const requireFn = function (id: string) {
          //       if (require.cache[id]) return require.cache[id];
          //       const module = interceptor.handle(id, require(id));
          //       return require.cache[id] = module;
          //     }
          //     return Object.assign(requireFn, {
          //       get resolve() { return require.resolve },
          //       get cache() { return require.cache },
          //       get extensions() { return require.extensions; },
          //       get main() { return require.main; },
          //     });
          //   }());
          const context = {
            require,
            console,
            global,
            __dirname,
            reference,
            src: exampleSource,
            assertion: wrapAssertion(assertSource),
          };
          vm.createContext(context);
          vm.runInContext(testSrc, context);
          console.log(`ok: ${reference.ref}`);
        } catch (e) {
          console.log(`/***************************************************/`);
          console.log(`/******* Error in ${node.canonicalReference} *******/`);
          console.log(`/***************************************************/`);
          if (e.aTree) {
            console.log(`Actual tree :\n${JSON.stringify(e.aTree)}`);
            console.log(`Actual src :\n${codegen(e.aTree, new FormattedCodeGen())}`);
          }
          if (e.bTree) {
            console.log(`Expected tree :\n${JSON.stringify(e.bTree)}`);
            console.log(`Expected src :\n${codegen(e.bTree, new FormattedCodeGen())}`);
          }
          // console.log(testSrc);
          console.log(exampleSource);
          console.log(assertSource);
          console.log(`>>>> Error in ${node.canonicalReference}`);
          console.log(e);
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
  const {docComment} = parser.parseString(tsdoc);
  const example = docComment.customBlocks.find(x => x.blockTag.tagName === type);
  if (example) {
    const fencedCode = example.content.nodes.find(
      (contentNode: tsdoc.DocNode) => contentNode.kind === 'FencedCode',
    ) as tsdoc.DocFencedCode;
    return fencedCode.code;
  }
  return '';
}

function extractCodeOnlyBlock(tsdoc: string, type = '@assert') {
  const {docComment} = parser.parseString(tsdoc);
  const block = docComment.customBlocks.find(x => x.blockTag.tagName === type) as tsdoc.DocBlock;
  if (block) {
    const fencedCode = block.content.nodes.find(
      (contentNode: tsdoc.DocNode) => contentNode.kind === 'FencedCode',
    ) as tsdoc.DocFencedCode;
    return fencedCode.code;
  }
  return '';
}

function makeSpy(fn: Function) {
  const spy: Function & {called: boolean; orig: typeof fn} = Object.assign(
    function(this: any, ...args: any[]) {
      spy.called = true;
      return fn.apply(this, args);
    },
    {orig: fn, called: false},
  );
  Object.assign(fn, {spy});
  return spy;
}

function findMethod(ref: string) {
  const match = ref.match(
    /^(?<package>[\w0-9-]*)!(?:(?<class>[\w0-9-]*)#)?(?<name>[\w0-9-$]*):(?<type>[\w0-9-]*)\((?<id>\d+)\)$/,
  );
  if (!match || !match.groups) throw new Error(`Internal error: Unaccounted for reference string format ${ref}`);
  return {
    package: match.groups.package,
    name: match.groups.name,
    id: match.groups.id,
    type: match.groups.type,
    class: match.groups.class,
    ref,
  };
}
