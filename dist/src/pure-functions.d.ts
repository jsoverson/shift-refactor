import { FunctionDeclaration } from "shift-ast";
export declare enum ImpureFunctionQualities {
    ThroughAccess = 0,
    ParameterMemberMutation = 1,
    ArgumentsMemberMutation = 2,
    CallsImpureFunctions = 3
}
export declare enum PureFunctionVerdict {
    Probably = "Probably",
    ProbablyNot = "ProbablyNot"
}
export interface PureFunctionAssessmentOptions {
    fnAllowList?: string[];
}
declare type AssessmentNode = FunctionDeclaration;
export declare class PureFunctionAssessment {
    verdict: PureFunctionVerdict;
    qualities: Set<ImpureFunctionQualities>;
    node: AssessmentNode;
    constructor(fnNode: AssessmentNode, options?: PureFunctionAssessmentOptions);
}
export {};
