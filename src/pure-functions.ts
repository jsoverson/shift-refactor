import {CallExpression, FunctionDeclaration, Node, Script} from 'shift-ast';
import {parseScript} from 'shift-parser';
import shiftScope, {Reference, ScopeLookup, Variable} from 'shift-scope';
import {traverse} from 'shift-traverser';
import {SimpleIdentifier} from './types';
import {getRootIdentifier, isDeepSimilar, isMemberAssignment, isMemberExpression} from './util';
const {query} = require('shift-query');

export enum ImpureFunctionQualities {
  ThroughAccess,
  ParameterMemberMutation,
  ArgumentsMemberMutation,
  CallsImpureFunctions,
}

export enum PureFunctionVerdict {
  Probably = 'Probably',
  ProbablyNot = 'ProbablyNot',
}

export interface PureFunctionAssessmentOptions {
  fnAllowList?: string[];
}

type AssessmentNode = FunctionDeclaration;

function processAllowList(fnsSrc: string[]): CallExpression[] {
  return fnsSrc.map(fnSrc => {
    const ast = parseScript(fnSrc);
    const firstStatement = ast.statements.shift();
    if (firstStatement && firstStatement.type === 'ExpressionStatement') {
      if (firstStatement.expression.type === 'CallExpression') return firstStatement.expression;
    }
    throw new Error(
      'Source passed to fnAllowList must result in a CallExpression (first statement must be a function call)',
    );
  });
}

export class PureFunctionAssessment {
  verdict: PureFunctionVerdict = PureFunctionVerdict.ProbablyNot;
  qualities: Set<ImpureFunctionQualities> = new Set();
  node: AssessmentNode;

  constructor(fnNode: AssessmentNode, options: PureFunctionAssessmentOptions = {}) {
    this.node = fnNode;
    const tempProgram = new Script({directives: [], statements: [fnNode]});
    const globalScope = shiftScope(tempProgram);
    const lookupTable = new ScopeLookup(globalScope);

    function lookup(id: SimpleIdentifier): Variable {
      return lookupTable.variableMap.get(id)[0];
    }

    let throughVariables = (Array.from(
      //@ts-ignore
      globalScope.through._.values(),
    ) as Reference[][]).flatMap((ref: Reference[]) => lookup(ref[0].node));

    const qualities = {
      throughAccess: false,
      parameterMemberMutation: false,
      argumentsMemberMutation: false,
      callsImpureFunctions: false,
    };

    const paramIdentifiers = query(fnNode.params, 'BindingIdentifier').map((id: SimpleIdentifier) => lookup(id));

    const innerFunctionAssessments = new WeakMap<Variable, PureFunctionAssessment>();

    const fnAllowList = options.fnAllowList ? processAllowList(options.fnAllowList) : [];

    traverse(tempProgram, {
      enter: function(node: Node, parent: Node) {
        if (node === fnNode) return;
        // need to hoist...
        if (node.type === 'FunctionDeclaration') {
          const variable = lookup(node.name);
          if (variable) {
            innerFunctionAssessments.set(variable, new PureFunctionAssessment(node));
          }
          return this.skip();
        } else if (isMemberAssignment(node) && node.object.type === 'IdentifierExpression') {
          const variable = lookup(node.object);
          if (paramIdentifiers.includes(variable)) qualities.parameterMemberMutation = true;
        } else if (
          isMemberExpression(node) &&
          isMemberAssignment(parent) &&
          node.object.type === 'IdentifierExpression'
        ) {
          const variable = lookup(node.object);
          if (variable.name === 'arguments') qualities.argumentsMemberMutation = true;
        } else if (node.type === 'CallExpression') {
          let bypass = false;
          if (fnAllowList) {
            const allowed = fnAllowList.filter(fnGeneric => isDeepSimilar(fnGeneric, node));
            if (allowed.length > 0) {
              bypass = true;
              if (isMemberExpression(node.callee) || node.callee.type === 'IdentifierExpression') {
                const id = getRootIdentifier(node.callee);
                const variable = lookup(id);
                //@ts-ignore
                throughVariables = throughVariables.filter((v: Variable) => variable !== v);
              }
            }
          }
          if (!bypass) {
            if (node.callee.type === 'IdentifierExpression') {
              const variable = lookup(node.callee);
              if (innerFunctionAssessments.has(variable)) {
                const calleeAssessment = innerFunctionAssessments.get(variable) as PureFunctionAssessment;
                if (calleeAssessment.verdict !== PureFunctionVerdict.Probably) qualities.callsImpureFunctions = true;
              }
            }
          }
        }
      },
    });

    if (qualities.parameterMemberMutation) this.qualities.add(ImpureFunctionQualities.ParameterMemberMutation);
    if (qualities.argumentsMemberMutation) this.qualities.add(ImpureFunctionQualities.ArgumentsMemberMutation);
    if (qualities.callsImpureFunctions) this.qualities.add(ImpureFunctionQualities.CallsImpureFunctions);
    if (throughVariables.length > 0) this.qualities.add(ImpureFunctionQualities.ThroughAccess);
    if (this.qualities.size === 0) this.verdict = PureFunctionVerdict.Probably;
  }
}
