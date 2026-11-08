import { pipelineTacticalPrediction } from "./PipelineBridge";

self.onmessage = ({ data }) => {
  try {
    const result = pipelineTacticalPrediction(data.incidents, data.opts);
    // Raw pipeline objects are large and unused by the UI; keep the message small.
    self.postMessage({ id: data.id, result: result ? { ...result, pipeline: undefined } : null });
  } catch (error) {
    self.postMessage({ id: data.id, error: error?.message || String(error) });
  }
};
