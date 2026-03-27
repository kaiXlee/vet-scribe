import * as cdk from 'aws-cdk-lib';
import { VetScribeStack } from '../lib/vet-scribe-stack';

const app = new cdk.App();

// Testing — us-west-2 (Oregon, close to Seattle)
new VetScribeStack(app, 'VetScribe-Dev', {
  env: { region: 'us-west-2' },
  stageName: 'dev',
});

// Production — ap-northeast-1 (Tokyo, for Taiwan)
// Uncomment when ready to go live:
// new VetScribeStack(app, 'VetScribe-Prod', {
//   env: { region: 'ap-northeast-1' },
//   stageName: 'prod',
// });
