import path from 'path';
import {Extractor, ExtractorConfig, ExtractorResult} from '@microsoft/api-extractor';

const apiExtractorJsonPath: string = path.join(__dirname, '..', 'etc', 'api-extractor.json');

const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

console.log('Warnings are unavoidable until https://github.com/microsoft/rushstack/pull/1628 is resolvede');

const extractorResult: ExtractorResult = (Extractor.invoke(extractorConfig as any, {
  localBuild: true,
  showVerboseMessages: true,
}) as unknown) as ExtractorResult;

if (extractorResult.succeeded) {
  console.error(`API Extractor completed successfully`);
  process.exitCode = 0;
} else {
  console.error(
    `API Extractor completed with ${extractorResult.errorCount} errors` +
      ` and ${extractorResult.warningCount} warnings`,
  );
  process.exitCode = 1;
}
