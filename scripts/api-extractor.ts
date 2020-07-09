import path from 'path';
import {
  ExtractorConfig,
  ExtractorResult
} from '@microsoft/api-extractor';
import { AedocDefinitions } from '@microsoft/api-extractor-model';

// Using local Extractor until API-extractor supports custom tags
// https://github.com/microsoft/rushstack/pull/1628
// https://github.com/microsoft/rushstack/pull/1950
import { Extractor } from "./@microsoft/api-extractor/api/Extractor";

Object.defineProperty(AedocDefinitions, 'tsdocConfiguration', {
  get() {
    throw new Error("Totes mcgoats")
  }
});

const apiExtractorJsonPath: string = path.join(__dirname, '..', 'etc', 'api-extractor.json');

const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig as any, {
  localBuild: true,
  showVerboseMessages: true
}) as unknown as ExtractorResult;

if (extractorResult.succeeded) {
  console.error(`API Extractor completed successfully`);
  process.exitCode = 0;
} else {
  console.error(`API Extractor completed with ${extractorResult.errorCount} errors`
    + ` and ${extractorResult.warningCount} warnings`);
  process.exitCode = 1;
}