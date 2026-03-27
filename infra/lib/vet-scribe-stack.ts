// DEPLOY WORKFLOW:
// 1. npm install
// 2. cdk bootstrap (first time only)
// 3. cdk deploy VetScribe-Dev
// 4. After deploy, go to AWS Secrets Manager and update:
//    - vetscribe/dev/secrets with your real API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
// 5. Build and push Docker image to ECR:
//    - aws ecr get-login-password | docker login --username AWS --password-stdin <ECR_URI>
//    - docker build -t vetscribe-backend ../backend
//    - docker tag vetscribe-backend:latest <ECR_URI>:latest
//    - docker push <ECR_URI>:latest
// 6. Go to App Runner in AWS Console and deploy the latest image
// 7. Update mobile app EXPO_PUBLIC_API_URL with the App Runner service URL
// 8. cdk destroy VetScribe-Dev  (to tear down all resources when not in use)

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';

// Extend the base StackProps to include a stageName for environment-specific naming
export interface VetScribeStackProps extends cdk.StackProps {
  stageName: string;
}

export class VetScribeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: VetScribeStackProps) {
    super(scope, id, props);

    const { stageName } = props;

    // =========================================================================
    // VPC
    // 2 AZs, 1 public subnet + 1 private-with-egress subnet per AZ.
    // NAT gateway allows private resources (RDS) to make outbound requests
    // (e.g. package downloads) without being directly reachable from the internet.
    // natGateways: 1 keeps costs low for MVP (one NAT covers both AZs).
    // =========================================================================
    const vpc = new ec2.Vpc(this, 'VetScribeVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      // Remove default subnets (ISOLATED) to save cost
      restrictDefaultSecurityGroup: true,
    });

    // =========================================================================
    // SECRETS MANAGER — Application API keys
    // Stores third-party API keys as a single JSON secret.
    // IMPORTANT: After deploying, open AWS Secrets Manager in the console and
    // replace the placeholder "REPLACE_ME" values with your real credentials.
    // =========================================================================
    const appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
      secretName: `vetscribe/${stageName}/secrets`,
      description: 'VetScribe application API keys (update after deploy)',
      secretObjectValue: {
        API_KEY: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
        OPENAI_API_KEY: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
        ANTHROPIC_API_KEY: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
      },
    });

    // =========================================================================
    // SECURITY GROUPS
    // Separate SGs for the App Runner VPC connector and RDS so we can grant
    // least-privilege inbound access: only the connector SG can reach RDS on 5432.
    // =========================================================================

    // Security group for the App Runner VPC connector (attached to private subnets)
    const appRunnerConnectorSg = new ec2.SecurityGroup(this, 'AppRunnerConnectorSg', {
      vpc,
      description: 'Security group for App Runner VPC connector',
      allowAllOutbound: true,
    });

    // Security group for RDS — only allow inbound Postgres from the App Runner connector
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: 'Security group for VetScribe RDS instance',
      allowAllOutbound: false,
    });
    rdsSg.addIngressRule(
      appRunnerConnectorSg,
      ec2.Port.tcp(5432),
      'Allow Postgres from App Runner VPC connector',
    );

    // =========================================================================
    // RDS POSTGRESQL
    // t3.micro is the cheapest burstable option — sufficient for single-user MVP.
    // Runs in private subnets so it is never directly reachable from the internet.
    // Credentials are auto-generated and stored in Secrets Manager.
    // =========================================================================
    const dbCredentials = rds.Credentials.fromGeneratedSecret('vetscribe', {
      secretName: `vetscribe/${stageName}/db-credentials`,
    });

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_2,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsSg],
      credentials: dbCredentials,
      databaseName: 'vetscribe',
      allocatedStorage: 20,       // GB — starting size
      maxAllocatedStorage: 100,   // GB — auto-scale storage up to 100 GB
      multiAz: false,             // MVP: single AZ keeps costs low
      deletionProtection: false,  // MVP: allow easy destroy
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy DB when stack is destroyed (dev only)
      backupRetention: cdk.Duration.days(7),
      storageEncrypted: true,
    });

    // =========================================================================
    // S3 BUCKET — Audio file storage
    // Named with account ID suffix to guarantee global uniqueness.
    // RETAIN removal policy ensures audio is never accidentally deleted when
    // tearing down the stack (important for vet records).
    // =========================================================================
    const audioBucket = new s3.Bucket(this, 'AudioBucket', {
      bucketName: `vetscribe-audio-${stageName}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep audio even if stack is destroyed
      versioned: false, // MVP: versioning not needed yet
      cors: [
        {
          // Allow mobile app to PUT audio directly and GET recordings
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // =========================================================================
    // ECR REPOSITORY — Docker image storage
    // The backend FastAPI image is pushed here and pulled by App Runner.
    // MUTABLE tags let us overwrite :latest on each push (simpler for MVP).
    // =========================================================================
    const ecrRepository = new ecr.Repository(this, 'BackendRepository', {
      repositoryName: `vetscribe-backend-${stageName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      // Automatically clean up untagged images to control storage costs
      lifecycleRules: [
        {
          description: 'Remove untagged images after 7 days',
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: cdk.Duration.days(7),
        },
      ],
    });

    // =========================================================================
    // IAM — App Runner instance role
    // Grants the running container permission to:
    //   • Pull images from ECR (managed policy)
    //   • Read/write audio files in the S3 bucket
    //   • Read secrets from Secrets Manager
    // =========================================================================
    const appRunnerRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Role assumed by VetScribe App Runner container instances',
      managedPolicies: [
        // Allows pulling images from any ECR repository in the account
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    // S3 access: allow the backend to store, retrieve, and delete audio recordings
    appRunnerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AudioBucketAccess',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [`${audioBucket.bucketArn}/*`],
      }),
    );

    // Secrets Manager access: allow reading API keys at runtime
    appRunnerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          appSecrets.secretArn,
          // Also grant access to the DB credentials secret (used to build DATABASE_URL)
          database.secret?.secretArn ?? '*',
        ],
      }),
    );

    // IAM role that allows App Runner to access ECR (used during image pull, separate from instance role)
    const appRunnerAccessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      description: 'Role used by App Runner to pull images from ECR',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    // =========================================================================
    // APP RUNNER VPC CONNECTOR
    // Bridges App Runner (which runs outside the VPC) into the private subnets
    // so the backend container can reach RDS on 5432.
    // =========================================================================
    const vpcConnector = new apprunner.CfnVpcConnector(this, 'VpcConnector', {
      vpcConnectorName: `vetscribe-connector-${stageName}`,
      subnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
      securityGroups: [appRunnerConnectorSg.securityGroupId],
    });

    // =========================================================================
    // APP RUNNER SERVICE (L1 CfnService)
    // We use the L1 construct because App Runner L2 constructs are still limited
    // and don't expose all the configuration options we need (VPC connector,
    // fine-grained health checks, auto-scaling configuration).
    //
    // Environment variables are injected at runtime using Secrets Manager ARN
    // references — the secret values are never stored in CloudFormation templates.
    // =========================================================================

    // Build a DATABASE_URL from the RDS endpoint + auto-generated credentials.
    // Format: postgresql://user:password@host:5432/vetscribe
    // We reference the secret fields by ARN so the plaintext never touches CDK/CFn.
    const dbSecretArn = database.secret!.secretArn;

    const appRunnerService = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: `vetscribe-backend-${stageName}`,

      sourceConfiguration: {
        authenticationConfiguration: {
          // Role that App Runner uses to pull the image from ECR
          accessRoleArn: appRunnerAccessRole.roleArn,
        },
        autoDeploymentsEnabled: false, // Manual deploys — trigger from console after pushing image
        imageRepository: {
          imageIdentifier: `${ecrRepository.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8000',
            runtimeEnvironmentVariables: [
              // S3 bucket name — safe to store as plaintext env var
              { name: 'S3_BUCKET_NAME', value: audioBucket.bucketName },
              { name: 'AWS_REGION', value: this.region },
            ],
            // Secrets pulled directly from Secrets Manager at container startup.
            // App Runner injects these as environment variables — the plaintext
            // values are never visible in CloudFormation or CDK outputs.
            runtimeEnvironmentSecrets: [
              {
                name: 'API_KEY',
                value: `${appSecrets.secretArn}:API_KEY::`,
              },
              {
                name: 'OPENAI_API_KEY',
                value: `${appSecrets.secretArn}:OPENAI_API_KEY::`,
              },
              {
                name: 'ANTHROPIC_API_KEY',
                value: `${appSecrets.secretArn}:ANTHROPIC_API_KEY::`,
              },
              {
                // DATABASE_URL assembled from the RDS-managed secret fields:
                // username, password, host, port, dbname
                // Note: App Runner can reference individual JSON keys from a secret.
                // We reference the full secret and let the application parse it,
                // or use a Lambda/custom resource to pre-assemble the URL.
                // For simplicity here we expose the DB secret ARN and let the
                // backend construct its own DATABASE_URL using the JSON fields.
                name: 'DB_SECRET_ARN',
                value: dbSecretArn,
              },
            ],
          },
        },
      },

      instanceConfiguration: {
        cpu: '1 vCPU',
        memory: '2 GB',
        instanceRoleArn: appRunnerRole.roleArn,
      },

      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,       // seconds between health checks
        timeout: 5,         // seconds to wait for a response
        healthyThreshold: 1,
        unhealthyThreshold: 3,
      },

      // Single instance: MVP is single-user, keep costs at minimum
      autoScalingConfigurationArn: undefined, // Will use App Runner default; override below via CfnAutoScalingConfiguration

      networkConfiguration: {
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
        ingressConfiguration: {
          isPubliclyAccessible: true, // The API endpoint must be reachable by the mobile app
        },
      },
    });

    // Auto-scaling configuration: pin to exactly 1 instance for single-user MVP
    const autoScalingConfig = new apprunner.CfnAutoScalingConfiguration(
      this,
      'AppRunnerAutoScaling',
      {
        autoScalingConfigurationName: `vetscribe-scaling-${stageName}`,
        minSize: 1,
        maxSize: 1, // Single user — no need to scale out
        maxConcurrency: 100,
      },
    );

    // Attach the auto-scaling config to the service
    (appRunnerService as cdk.CfnResource).addPropertyOverride(
      'AutoScalingConfigurationArn',
      autoScalingConfig.attrAutoScalingConfigurationArn,
    );

    // Ensure the service is created after the VPC connector is ready
    appRunnerService.addDependency(vpcConnector);

    // =========================================================================
    // STACK OUTPUTS
    // Printed to the terminal after `cdk deploy` completes.
    // =========================================================================

    new cdk.CfnOutput(this, 'AppRunnerServiceUrl', {
      description: 'App Runner service URL — use this as EXPO_PUBLIC_API_URL in the mobile app',
      value: `https://${appRunnerService.attrServiceUrl}`,
      exportName: `VetScribe-${stageName}-ServiceUrl`,
    });

    new cdk.CfnOutput(this, 'RdsEndpoint', {
      description: 'RDS PostgreSQL endpoint (internal — only reachable from VPC)',
      value: database.instanceEndpoint.hostname,
      exportName: `VetScribe-${stageName}-RdsEndpoint`,
    });

    new cdk.CfnOutput(this, 'AudioBucketName', {
      description: 'S3 bucket name for audio recordings',
      value: audioBucket.bucketName,
      exportName: `VetScribe-${stageName}-AudioBucket`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      description: 'ECR repository URI — push Docker images here before deploying to App Runner',
      value: ecrRepository.repositoryUri,
      exportName: `VetScribe-${stageName}-EcrUri`,
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      description: 'ARN of the Secrets Manager secret containing RDS credentials',
      value: dbSecretArn,
      exportName: `VetScribe-${stageName}-DbSecretArn`,
    });
  }
}
