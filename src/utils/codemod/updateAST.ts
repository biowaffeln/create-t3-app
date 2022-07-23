import type { Collection } from "jscodeshift";
import pkg from "jscodeshift";

export const updateAST = (
  src: string,
  transfrom: (program: Collection) => unknown,
): string => {
  const j = pkg.withParser("tsx");
  const program = j(src);
  transfrom(program);
  return program.toSource();
};
