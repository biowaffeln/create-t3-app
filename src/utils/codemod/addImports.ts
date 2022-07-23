import j, { Statement } from "jscodeshift";

export const addImports = (program: j.Collection, statements: Statement[]) => {
  const imports = program.find(j.ImportDeclaration);

  if (imports.length > 0) {
    imports.at(-1).insertAfter(statements);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    program.get().node.program.body.unshift(...statements);
  }
};
