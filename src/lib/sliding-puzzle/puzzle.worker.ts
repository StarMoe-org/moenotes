import { createPuzzleWorkerHandler } from "./worker-handler";
import { createPuzzleMatchHandler } from "./match-handler";
import { createPuzzleDetectHandler } from "./detect-handler";
import { isPuzzleRecord } from "./worker-protocol";

const handle = createPuzzleWorkerHandler(reply => self.postMessage(reply));
const match = createPuzzleMatchHandler(reply => self.postMessage(reply));
const detect = createPuzzleDetectHandler(reply => self.postMessage(reply));
self.onmessage = ({ data }: MessageEvent<unknown>) => {
  if (isPuzzleRecord(data) && data.type === "match") match(data);
  else if (isPuzzleRecord(data) && data.type === "detect") detect(data);
  else handle(data);
};
