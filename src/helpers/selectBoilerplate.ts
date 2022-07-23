import type { InstallerOptions } from "../installers/index.js";
import path from "path";
import fs from "fs-extra";
import j from "jscodeshift";
import { PKG_ROOT } from "../consts.js";
import { addImports } from "../utils/codemod/addImports.js";
import { transformFile } from "../utils/codemod/transformFile.js";

type SelectBoilerplateProps = Required<
  Pick<InstallerOptions, "projectDir" | "packages">
>;
// This generates the _app.tsx file that is used to render the app
export const transformAppFile = async ({
  projectDir,
  packages,
}: SelectBoilerplateProps) => {
  const usingTrpc = packages.trpc.inUse;
  const usingNextAuth = packages.nextAuth.inUse;

  const appDest = path.join(projectDir, "src/pages/_app.tsx");
  await transformFile(appDest, (program) => {
    if (usingNextAuth) {
      nextAuthTransform(program);
    }
    if (usingTrpc) {
      trpcTransform(program);
    }
  });
};

const nextAuthTransform = (program: j.Collection) => {
  addImports(program, [
    j.template
      .statement`import { SessionProvider } from "next-auth/react"` as j.Node,
  ]);

  program
    .find(j.JSXElement, { openingElement: { name: { name: "Component" } } })
    .forEach((p) => {
      p.replace(
        j.jsxElement(
          j.jsxOpeningElement(j.jsxIdentifier("SessionProvider"), [
            j.jsxAttribute(
              j.jsxIdentifier("session"),
              j.jsxExpressionContainer(j.identifier("pageProps.session")),
            ),
          ]),
          j.jsxClosingElement(j.jsxIdentifier("SessionProvider")),
          [j.jsxText("\n"), p.node, j.jsxText("\n")],
        ),
      );
    });
};

const trpcTransform = (program: j.Collection) => {
  addImports(program, [
    j.template.statement`import { trpc } from "../utils/trpc";` as j.Node,
  ]);

  // wrap default export with withTrpc
  program
    .find(j.ExportDefaultDeclaration)
    .find(j.Identifier)
    .forEach((p) => {
      p.node.name = `trpc.withTRPC(${p.node.name})`;
    });
};

// This selects the proper index.tsx to be used that showcases the chosen tech
export const selectIndexFile = async ({
  projectDir,
  packages,
}: SelectBoilerplateProps) => {
  const indexFileDir = path.join(PKG_ROOT, "template/page-studs/index");

  const usingTrpc = packages.trpc.inUse;
  const usingTw = packages.tailwind.inUse;
  const usingAuth = packages.nextAuth.inUse;
  const usingPrisma = packages.prisma.inUse;

  let indexFile = "";
  // FIXME: auth showcase doesn't work with prisma since it requires more setup
  if (usingTrpc && usingTw && usingAuth && !usingPrisma) {
    indexFile = "with-auth-trpc-tw.tsx";
  } else if (usingTrpc && !usingTw && usingAuth && !usingPrisma) {
    indexFile = "with-auth-trpc.tsx";
  } else if (usingTrpc && usingTw) {
    indexFile = "with-trpc-tw.tsx";
  } else if (usingTrpc && !usingTw) {
    indexFile = "with-trpc.tsx";
  } else if (!usingTrpc && usingTw) {
    indexFile = "with-tw.tsx";
  }

  if (indexFile !== "") {
    const indexSrc = path.join(indexFileDir, indexFile);
    const indexDest = path.join(projectDir, "src/pages/index.tsx");
    await fs.copy(indexSrc, indexDest);
  }
};
