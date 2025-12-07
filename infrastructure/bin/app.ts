#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BearlyMailStack } from '../lib/bearlymail-stack';

const app = new cdk.App();

new BearlyMailStack(app, 'BearlyMailStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '841162709871',
    region: 'ap-southeast-2', // Sydney
  },
  description: 'BearlyMail - ADHD-friendly email client infrastructure',
  // Domain configuration
  domainName: 'bearlymail.com',
  hostedZoneId: 'Z08919233O73NFKRK9QHU',
});

