export const enum OpenScadWorkerMessageType {
  COMPILE = "compile",
}

export type OpenScadWorkerRequest = {
  id: string;
  type: OpenScadWorkerMessageType.COMPILE;
  data: {
    code: string;
  };
};

export type OpenScadWorkerResponse =
  | {
      id: string;
      type: OpenScadWorkerMessageType.COMPILE;
      data: {
        output: Uint8Array;
        fileType: "stl";
      };
    }
  | {
      id: string;
      type: OpenScadWorkerMessageType.COMPILE;
      error: string;
    };
