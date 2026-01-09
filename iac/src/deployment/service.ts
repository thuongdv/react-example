import * as pulumi from "@pulumi/pulumi";

export abstract class Service {
  protected pulumiConfig: pulumi.Config;

  constructor(config: pulumi.Config) {
    this.pulumiConfig = config;
  }

  abstract deploy(): Promise<{ [key: string]: pulumi.Input<string> }>;
}
