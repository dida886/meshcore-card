import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import svg from "rollup-plugin-svg"; 

export default {
  input: "src/index.ts",
  output: {
    file: "dist/meshcore-card.js",
    format: "iife",
    name: "MeshcoreCardBundle",
    sourcemap: false,
  },
  plugins: [
    json(),
    nodeResolve(),
    typescript({
      tsconfig: "./tsconfig.json",
      noEmit: false,
    }),
    svg(),
  ],
};
