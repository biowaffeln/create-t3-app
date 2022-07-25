import type { Installer } from "./index.js";
import path from "path";
import fs from "fs-extra";
import j from "jscodeshift";
import { PKG_ROOT } from "../consts.js";
import { addImports } from "../utils/codemod/addImports.js";
import { transformFile } from "../utils/codemod/transformFile.js";

export const trpcInstaller: Installer = async ({
  projectDir,
  packages,
  runPkgManagerInstall,
}) => {
  await runPkgManagerInstall({
    packages: [
      "react-query@3.39.2",
      "superjson",
      "@trpc/server@experimental",
      "@trpc/client@experimental",
      "@trpc/next@experimental",
      "@trpc/react@experimental",
    ],
    devMode: false,
  });
  const usingAuth = packages?.nextAuth.inUse;
  const usingPrisma = packages?.prisma.inUse;

  const trpcAssetDir = path.join(PKG_ROOT, "template/addons/trpc");

  const apiHandlerSrc = path.join(trpcAssetDir, "api-handler.ts");
  const apiHandlerDest = path.join(projectDir, "src/pages/api/trpc/[trpc].ts");

  const utilsSrc = path.join(trpcAssetDir, "utils.ts");
  const utilsDest = path.join(projectDir, "src/utils/trpc.ts");

  const serverUtilFile = usingAuth ? "auth-server-utils.ts" : "server-utils.ts";
  const serverUtilSrc = path.join(trpcAssetDir, serverUtilFile);
  const serverUtilDest = path.join(projectDir, "src/server/trpc/utils.ts");

  const contextSrc = path.join(trpcAssetDir, "base-context.ts");
  const contextDest = path.join(projectDir, "src/server/trpc/context.ts");

  const authRouterSrc = path.join(trpcAssetDir, "auth-router.ts");
  const authRouterDest = path.join(
    projectDir,
    "src/server/trpc/router/auth.ts",
  );

  const indexRouterSrc = path.join(trpcAssetDir, "index-router.ts");
  const indexRouterDest = path.join(
    projectDir,
    "src/server/trpc/router/index.ts",
  );

  const exampleRouterSrc = path.join(trpcAssetDir, "example-router.ts");
  const exampleRouterDest = path.join(
    projectDir,
    "src/server/trpc/router/example.ts",
  );

  await Promise.all([
    fs.copy(apiHandlerSrc, apiHandlerDest),
    fs.copy(utilsSrc, utilsDest),
    fs.copy(serverUtilSrc, serverUtilDest),
    fs.copy(contextSrc, contextDest),
    fs.copy(indexRouterSrc, indexRouterDest),
    fs.copy(exampleRouterSrc, exampleRouterDest),
    ...(usingAuth ? [fs.copy(authRouterSrc, authRouterDest)] : []),
  ]);

  await transformFile(contextDest, (program) => {
    if (usingAuth) {
      contextAuthTransform(program);
    }
    if (usingPrisma) {
      contextPrismaTransform(program);
    }
  });

  if (usingAuth) {
    await transformFile(indexRouterDest, (program) => {
      indexRouterTransform(program);
    });
  }

  if (usingPrisma) {
    await transformFile(exampleRouterDest, (program) => {
      exampleRouterTransform(program);
    });
  }
};

const contextAuthTransform = (program: j.Collection) => {
  addImports(program, [
    j.template
      .statement`import { unstable_getServerSession as getServerSession } from "next-auth";\n` as j.Node,
    j.template
      .statement`import { authOptions as nextAuthOptions } from "../../pages/api/auth/[...nextauth]";\n` as j.Node,
  ]);

  program
    .find(j.VariableDeclarator, { id: { name: "createContext" } })
    .find(j.BlockStatement)
    .at(0)
    .forEach((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      p.get("body").unshift(
        "const session = await getServerSession(opts.req, opts.res, nextAuthOptions);",
      );
    });

  const sessionProp = j.objectProperty(
    j.identifier("session"),
    j.identifier("session"),
  );
  sessionProp.shorthand = true;
  program
    .find(j.VariableDeclarator, { id: { name: "createContext" } })
    .find(j.ReturnStatement)
    .find(j.ObjectExpression)
    .at(0)
    .forEach((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      p.get("properties").push(sessionProp);
    });
};

const contextPrismaTransform = (program: j.Collection) => {
  addImports(program, [
    j.template.statement`import { prisma } from "../db/client";` as j.Node,
  ]);

  const prismaProp = j.objectProperty(
    j.identifier("prisma"),
    j.identifier("prisma"),
  );
  prismaProp.shorthand = true;

  program
    .find(j.VariableDeclarator, { id: { name: "createContext" } })
    .find(j.ReturnStatement)
    .find(j.ObjectExpression)
    .at(0)
    .forEach((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      p.get("properties").push(prismaProp);
    });
};

const indexRouterTransform = (program: j.Collection) => {
  addImports(program, [
    j.template.statement`import { authRouter } from "./auth";` as j.Node,
  ]);

  program
    .find(j.VariableDeclarator, { id: { name: "appRouter" } })
    .find(j.ObjectExpression)
    .at(0)
    .forEach((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      p.get("properties").push(
        j.objectProperty(j.identifier("auth"), j.identifier("authRouter")),
      );
    });
};

export const exampleRouterTransform = (program: j.Collection) => {
  const exp = j.objectProperty(j.identifier("text"), j.identifier("text"));
  exp.shorthand = true;

  const getAll = j.callExpression(j.identifier("t.procedure.query"), [
    j.arrowFunctionExpression(
      [j.objectPattern([exp])],
      j.blockStatement([
        j.returnStatement(
          j.callExpression(j.identifier("ctx.prisma.example.findMany"), []),
        ),
      ]),
    ),
  ]);

  program
    .find(j.VariableDeclarator, { id: { name: "exampleRouter" } })
    .find(j.ObjectExpression)
    .at(0)
    .forEach((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      p.get("properties").push(
        j.objectProperty(j.identifier("getAll"), getAll),
      );
    });
};
