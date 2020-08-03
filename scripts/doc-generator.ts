import * as tsdoc from '@microsoft/api-extractor-model/node_modules/@microsoft/tsdoc';
import DEBUG from 'debug';
import findRoot from 'find-root';
import fs from 'fs';
import makeTemplate from 'lodash.template';
import path from 'path';
import json from '../generated/shift-refactor.api.json';

const api: IApiItemJson = json;

const projectRoot = findRoot(__dirname);

const templateSource = fs.readFileSync(path.join(projectRoot, 'etc', 'README.template'), 'utf-8');
const template = makeTemplate(templateSource);

interface IApiItemJson {
  kind: string;
  canonicalReference: string;
  members?: IApiItemJson[];
  docComment?: string;
  name?: string;
  parameters?: {parameterName: string}[];
}

const customConfiguration: tsdoc.TSDocConfiguration = new tsdoc.TSDocConfiguration();
customConfiguration.addTagDefinitions([
  new tsdoc.TSDocTagDefinition({
    tagName: '@assert',
    syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag,
  }),
]);

const parser = new tsdoc.TSDocParser(customConfiguration);

const debug = DEBUG('doc-generator');

(function main() {
  const context: {[x: string]: any} = {
    title: 'Shift Refactor',
    api,
    repeat,
    printTsDoc,
    callSignature,
    linkify,
    entrypoint: api.members!.find(k => k.kind === 'EntryPoint'),
    example: fs.readFileSync(path.join(projectRoot, 'example.js')),
    exampleDeobfuscation: fs.readFileSync(path.join(projectRoot, 'example-deobfuscation.js')),
  };

  //@ts-ignore don't have time to rejigger ts config for Object.fromEntries.
  context.exports = Object.fromEntries(context.entrypoint.members.map(m => [m.canonicalReference, m]));

  const markdown = template(context);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), markdown);
})();

function repeat(str: string, times: number) {
  return new Array(times).fill(str).join('');
}

function docNodeReducer(text: string, node: tsdoc.DocNode): string {
  debug('handling kind %o', node.kind);
  let toAppend = '';
  switch (node.kind) {
    case 'Paragraph':
      toAppend = reduceNode(node);
      break;
    case 'PlainText':
      toAppend = (node as tsdoc.DocPlainText).text;
      break;
    case 'SoftBreak':
      toAppend = '\n';
      break;
    case 'CodeSpan':
      toAppend = '`' + (node as tsdoc.DocCodeSpan).code + '`';
      break;
    case 'FencedCode':
      toAppend = '```js\n' + (node as tsdoc.DocCodeSpan).code.trim() + '\n```';
      break;
    case 'BlockTag':
      toAppend = reduceNode(node);
      break;
    case 'Excerpt':
      toAppend = ''; // these seem to be @tags and we don't need those printed. May need to be revisited.
    //case 'Excerpt': return text + (node as tsdoc.DocExcerpt).content.toString();
    case 'Section':
      toAppend = reduceNode(node);
      break;
    default:
      throw new Error(`Unhandled kind ${node.kind}`);
  }
  return text + toAppend.trim();
}

function printTsDoc(node: IApiItemJson) {
  if (!node.docComment) return '';
  const doc = getDoc(node.docComment);
  let parts = [doc.summary];
  if (doc.remarks) parts.push('#### Note:', doc.remarks);
  if (doc.deprecated) parts.push('**DEPRECATED**', doc.deprecated);
  if (doc.example) parts.push('#### Example', doc.example);
  return parts.join('\n\n');
}

function reduceNode(node?: tsdoc.DocNode) {
  if (!node) return '';
  const nodes = node.getChildNodes();
  return nodes.reduce(docNodeReducer, '');
}

function callSignature(member: IApiItemJson) {
  return `.${member.name}(${member.parameters ? member.parameters.map(p => p.parameterName).join(', ') : ''})`;
}

function linkify(str: string) {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/[^\$\w0-9\-]/g, '');
}

function getDoc(docString: string) {
  const parserContext = parser.parseString(docString);
  const docComment = parserContext.docComment;
  const summary = reduceNode(docComment.summarySection);
  const example = docComment.customBlocks.find(b => b.blockTag!.tagName === '@example');
  const result = {
    summary,
    example: example ? reduceNode(example.content) : '',
    remarks: reduceNode(docComment.remarksBlock),
    deprecated: reduceNode(docComment.deprecatedBlock),
  };
  debug('got doc: %o', result);
  return result;
}
