#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "source-map-support/register";
import { PlanningPokerServerStack } from "../lib/planning-poker-server-stack";

const app = new cdk.App();
new PlanningPokerServerStack(app, "PlanningPokerServerStack");
