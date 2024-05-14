import { notNullEmpty, nullEmpty } from "@repo/common";
import { $, BunFile, Glob } from "bun";

const glob = new Glob("**/*.env*");

const envFiles: string[] = [];
const bunFiles: BunFile[] = [];

// Scans the current working directory and each of its sub-directories recursively
for await (const file of glob.scan({
  cwd: ".",
  dot: true,
})) {
  const fileNameWithStartingPath = `.\\${file}`;

  // Regex to match only .env files
  if (fileNameWithStartingPath.match(/[^\/\n]?\\.env/)) {
    envFiles.push(fileNameWithStartingPath);
    bunFiles.push(Bun.file(fileNameWithStartingPath));
  }
}

interface IEnvVarInfo {
  key: string;
  value: string;
  filePath: string;
  isCommitted: boolean;
  isLocal: boolean;
}

const envVarInfoArray: IEnvVarInfo[] = [];

for (const bunFile of bunFiles) {
  const filePath = bunFile.name as string;
  // console.log(`Found file: ${filePath}`);

  // Check file's git status
  const gitStatus = await $`git status --porcelain ${filePath}`.quiet();
  const gitFileList = await $`git ls-files ${filePath}`.quiet();
  const isUncommittedOrIgnored = gitStatus.text().length === 0 && gitFileList.text().length === 0;

  const envFileText = await bunFile.text();
  const envVariables: { key: string; value: string }[] = envFileText
    .split("\n")
    .filter((line) => notNullEmpty(line) && !line.startsWith("#"))
    .map((line) => {
      const [key, value] = line.split("=");

      if (nullEmpty(value)) {
        return { key, value: "" };
      }

      const valueWithoutEdgeQuotes = value.trim().replace(/^"|"$/g, "");
      return { key, value: valueWithoutEdgeQuotes };
    })
    .filter((env) => !nullEmpty(env.value));
  // console.log(envVariables);
  // console.log("--------------------\n");

  let envVarInfo = envVariables.map((envVar) => ({
    ...envVar,
    filePath,
    isCommitted: !isUncommittedOrIgnored,
    isLocal: filePath.endsWith(".local"),
  }));

  if (envVariables.length === 0) {
    envVarInfo = [
      {
        key: "*EMPTY_FILE*",
        value: "*EMPTY_FILE*",
        filePath,
        isCommitted: !isUncommittedOrIgnored,
        isLocal: filePath.endsWith(".local"),
      },
    ];
  }

  envVarInfoArray.push(...envVarInfo);
}

const console_color_green = "\x1b[32m";
const console_color_red = "\x1b[31m";
const console_color_yellow = "\x1b[33m";

for (const { isCommitted, isLocal, filePath, key, value } of envVarInfoArray) {
  const print = `${filePath} -> ${key}=${value}${isCommitted ? " COMMITTED" : ""} ${
    isLocal ? " LOCAL" : ""
  }`;

  const prefixColor = isCommitted
    ? console_color_green
    : isCommitted && isLocal
      ? console_color_red
      : console_color_yellow;

  // console.log(prefixColor, print);
}

// console.log("\x1b[0m");

const hasCommittedAndLocalFiles = envVarInfoArray.some(
  (envInfo) => envInfo.isLocal && envInfo.isCommitted,
);

if (hasCommittedAndLocalFiles) {
  throw new Error(`
There are committed .local files:

${[
  ...new Set(
    envVarInfoArray
      .filter((envInfo) => envInfo.isLocal && envInfo.isCommitted)
      .map((envInfo) => envInfo.filePath),
  ),
].join("\n")}

Please remove them before committing.`);
}
