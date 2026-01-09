import { Config } from "@pulumi/pulumi";
import { ReactService } from "./react-service";
import { Service } from "./service";

const registeredServices: {
  [name: string]: { new(config: Config): Service };
} = {
  "react-service": ReactService,
};

export function createService(name: string, config: Config): Service {
  const serviceConstructor = registeredServices[name];
  if (!serviceConstructor) {
    throw new Error(`No service registered for stack ${name}`);
  }
  return new serviceConstructor(config);
}
