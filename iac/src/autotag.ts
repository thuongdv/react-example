import * as pulumi from "@pulumi/pulumi";

export function registerAutoTags(autoTags: Record<string, string>): void {
  pulumi.runtime.registerStackTransformation((args) => {
    if ("tags" in (args.props || {})) {
      args.props["tags"] = { ...args.props["tags"], ...autoTags };
      return { props: args.props, opts: args.opts };
    }
    return undefined;
  });
}
