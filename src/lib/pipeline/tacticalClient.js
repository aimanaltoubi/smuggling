import { useEffect, useState } from "react";
import { pipelineTacticalPrediction } from "./PipelineBridge";

// Tactical runs take seconds on large files, so they go to a worker and are
// cached per incidents array + options so tab switches never recompute.
const cache = new WeakMap();
const pending = new Map();
let worker = null;
let seq = 0;

function getWorker() {
  if (typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./tactical.worker.js", import.meta.url), { type: "module" });
    } catch {
      return null;
    }
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
    };
    worker.onerror = (event) => {
      for (const job of pending.values()) job.reject(event.error || new Error(event.message || "worker failed"));
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  return worker;
}

export function predictTactical(incidents, opts = {}) {
  const key = JSON.stringify(opts);
  let perSet = cache.get(incidents);
  if (!perSet) cache.set(incidents, perSet = new Map());
  if (perSet.has(key)) return perSet.get(key);
  const w = getWorker();
  const run = w
    ? new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, incidents, opts });
    }).catch(() => pipelineTacticalPrediction(incidents, opts))
    : Promise.resolve().then(() => pipelineTacticalPrediction(incidents, opts));
  perSet.set(key, run);
  return run;
}

export function useTacticalPrediction(incidents, opts, enabled = true) {
  const key = JSON.stringify(opts || {});
  const [state, setState] = useState({ status: "idle", prediction: null });
  useEffect(() => {
    if (!enabled || !incidents || !incidents.length) {
      setState({ status: "idle", prediction: null });
      return undefined;
    }
    let live = true;
    setState({ status: "computing", prediction: null });
    predictTactical(incidents, JSON.parse(key)).then(
      (prediction) => { if (live) setState({ status: "ready", prediction }); },
      (error) => { if (live) setState({ status: "error", prediction: null, error }); },
    );
    return () => { live = false; };
  }, [incidents, key, enabled]);
  return state;
}
