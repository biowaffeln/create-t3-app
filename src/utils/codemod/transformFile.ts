import fs from "fs-extra";
import { Collection } from "jscodeshift";
import { updateAST } from "./updateAST.js";

export const transformFile = async (
  src: string,
  transform: (program: Collection) => unknown,
) => {
  const content = await fs.readFile(src, "utf8");
  const newContent = updateAST(content, transform);
  await fs.writeFile(src, newContent);
};
