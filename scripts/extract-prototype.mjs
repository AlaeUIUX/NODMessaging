import fs from "fs";
import path from "path";

const htmlPath = "c:/Users/HomePC/Desktop/nod-prototype.html";
const html = fs.readFileSync(htmlPath, "utf8");

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const body = html.match(/<body>([\s\S]*)<script>/)[1];

const src = "C:/Users/HomePC/Desktop/NOD/src";
fs.mkdirSync(path.join(src, "lib"), { recursive: true });
fs.mkdirSync(path.join(src, "components"), { recursive: true });

fs.writeFileSync(path.join(src, "app/globals.css"), css.trim() + "\n");
fs.writeFileSync(
  path.join(src, "lib/prototype-markup.ts"),
  `export const prototypeMarkup = ${JSON.stringify(body.trim())};\n`,
);

let inner = script.trim();
if (inner.startsWith("(function(){")) inner = inner.slice("(function(){".length);
if (inner.endsWith("})();")) inner = inner.slice(0, -5);

const ts = `/* eslint-disable @typescript-eslint/no-explicit-any */
export function runPrototype(): () => void {
${inner}
  return () => {};
}
`;
fs.writeFileSync(path.join(src, "lib/run-prototype.ts"), ts);

console.log({ css: css.length, markup: body.length, script: inner.length });
