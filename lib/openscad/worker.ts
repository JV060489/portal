/// <reference lib="webworker" />

import {
  OpenScadWorkerMessageType,
  type OpenScadWorkerRequest,
  type OpenScadWorkerResponse,
} from "./worker-types";

type OpenScadModule = {
  default: (options?: {
    noInitialRun?: boolean;
    printErr?: (text: string) => void;
    locateFile?: (path: string) => string;
  }) => Promise<{
    callMain(args: string[]): number;
    FS: {
      readFile(path: string, options: { encoding: "binary" }): Uint8Array;
      writeFile(path: string, data: string | ArrayBufferView): void;
    };
  }>;
};

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<OpenScadWorkerRequest>) => {
  const { id, type, data } = event.data;
  if (type !== OpenScadWorkerMessageType.COMPILE) return;
  const stderr: string[] = [];

  try {
    const openscadModule = (await import(
      "./vendor/openscad.js"
    )) as OpenScadModule;
    const openscad = await openscadModule.default({
      noInitialRun: true,
      printErr: (text) => stderr.push(text),
      locateFile: (path) =>
        path.endsWith(".wasm")
          ? `${self.location.origin}/vendor/openscad-wasm/openscad.wasm`
          : path,
    });

    openscad.FS.writeFile("/input.scad", data.code);
    const outputPath = "/out.stl";
    const exitCode = openscad.callMain([
      "/input.scad",
      "-o",
      outputPath,
      "--export-format=binstl",
      "--enable=manifold",
      "--enable=fast-csg",
      "--enable=lazy-union",
      "--enable=roof",
    ]);

    if (exitCode !== 0) {
      throw new Error(stderr.join("\n") || "OpenSCAD compilation failed.");
    }

    const output = openscad.FS.readFile(outputPath, { encoding: "binary" });
    const response: OpenScadWorkerResponse = {
      id,
      type: OpenScadWorkerMessageType.COMPILE,
      data: {
        output,
        fileType: "stl",
      },
    };
    ctx.postMessage(response, [output.buffer]);
  } catch (error) {
    const response: OpenScadWorkerResponse = {
      id,
      type: OpenScadWorkerMessageType.COMPILE,
      error:
        error instanceof Error ? error.message : "OpenSCAD compilation failed.",
    };
    ctx.postMessage(response);
  }
};
