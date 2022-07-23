import type { Installer } from "./index.js";
import path from "path";
import fs from "fs-extra";
import j, { Node } from "jscodeshift";
import { PKG_ROOT } from "../consts.js";
import { addImports } from "../utils/codemod/addImports.js";
import { transformFile } from "../utils/codemod/transformFile.js";

export const nextAuthInstaller: Installer = async ({
  projectDir,
  runPkgManagerInstall,
  packages,
}) => {
  await runPkgManagerInstall({
    packages: [
      "next-auth",
      packages?.prisma.inUse ? "@next-auth/prisma-adapter" : "",
    ],
    devMode: false,
  });

  const nextAuthAssetDir = path.join(PKG_ROOT, "template/addons/next-auth");

  const apiHandlerSrc = path.join(nextAuthAssetDir, "api-handler.ts");
  const apiHandlerDest = path.join(
    projectDir,
    "src/pages/api/auth/[...nextauth].ts",
  );

  const restrictedApiSrc = path.join(nextAuthAssetDir, "restricted.ts");
  const restrictedApiDest = path.join(
    projectDir,
    "src/pages/api/restricted.ts",
  );

  const nextAuthDefinitionSrc = path.join(nextAuthAssetDir, "next-auth.d.ts");
  const nextAuthDefinitionDest = path.join(projectDir, "next-auth.d.ts");

  await Promise.all([
    fs.copy(apiHandlerSrc, apiHandlerDest),
    fs.copy(restrictedApiSrc, restrictedApiDest),
    fs.copy(nextAuthDefinitionSrc, nextAuthDefinitionDest),
  ]);

  if (packages?.prisma.inUse) {
    await transformFile(apiHandlerDest, (program) => {
      // 1. add imports
      const adapterImport = j.template
        .statement`\nimport { PrismaAdapter } from "@next-auth/prisma-adapter";` as Node;
      const prismaImport = j.template
        .statement`\nimport { prisma } from "../../../server/db/client";` as Node;
      adapterImport.comments = [
        j.commentLine(
          "Prisma adapter for NextAuth, optional and can be removed",
        ),
      ];
      addImports(program, [adapterImport, prismaImport]);

      // 2. add adapter property to authOptions
      program
        .find(j.VariableDeclarator, { id: { name: "authOptions" } })
        .find(j.ObjectExpression)
        .at(0)
        .forEach((p) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          p.get("properties").push(
            j.objectProperty(
              j.identifier("adapter"),
              j.identifier("PrismaAdapter(prisma)"),
            ),
          );
        });

      return program;
    });
  }
};
