const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { createExplanationRequest, evaluateExplanation, buildGroundedExplanation } = require('./explanationRequest.cjs');

const MODEL_FILENAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
let processHandle = null;
let state = { status: 'checking', message: 'Checking for the optional local model.' };
let apiPort = null;

function getRuntimePaths(app) {
  const resourcesDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'offline-llm')
    : path.resolve(__dirname, '..', 'build', 'offline-llm');
  const runtimeDirectory = path.join(resourcesDirectory, 'llama-runtime');
  const executable = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  return {
    modelPath: path.join(resourcesDirectory, MODEL_FILENAME),
    executablePath: path.join(runtimeDirectory, executable),
    runtimeDirectory,
  };
}

function checkFiles(app) {
  const files = getRuntimePaths(app);
  if (!fs.existsSync(files.modelPath)) {
    return { status: 'missing-model', message: `Place ${MODEL_FILENAME} beside the app executable.` };
  }
  if (!fs.existsSync(files.executablePath)) {
    return { status: 'missing-runtime', message: 'Place the llama.cpp CPU runtime in the llama-runtime folder.' };
  }
  return files;
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntilReady(child, port) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && state.status === 'starting') {
    if (child.exitCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        state = { status: 'ready', message: 'The offline language model is ready.' };
        return;
      }
    } catch {
      // The model server is still starting.
    }
    await delay(500);
  }
  if (state.status === 'starting') {
    state = { status: 'error', message: 'The offline model server did not start. Check the runtime files and model.' };
  }
}

async function start(app) {
  const files = checkFiles(app);
  if (files.status) {
    state = files;
    return state;
  }

  try {
    apiPort = await reservePort();
    state = { status: 'starting', message: 'Loading the local model. First startup can take a few minutes.' };
    processHandle = spawn(files.executablePath, [
      '--model', files.modelPath,
      '--host', '127.0.0.1',
      '--port', String(apiPort),
      '--ctx-size', '8192',
      '--parallel', '1',
      '--n-gpu-layers', '0',
    ], {
      cwd: files.runtimeDirectory,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    processHandle.once('error', () => {
      state = { status: 'error', message: 'Could not launch llama-server. Check the runtime files.' };
    });
    processHandle.once('exit', code => {
      if (state.status === 'starting' || state.status === 'ready') {
        state = { status: 'error', message: `The local model server stopped (${code ?? 'unknown'}).` };
      }
    });
    void waitUntilReady(processHandle, apiPort);
  } catch {
    state = { status: 'error', message: 'Could not reserve a local port for the model server.' };
  }
  return state;
}

function getStatus() {
  return { ...state, model: MODEL_FILENAME };
}

async function explain(facts, format = 'summary', signal) {
  if (state.status !== 'ready' || !apiPort) {
    throw new Error(state.message || 'The offline model is not ready.');
  }
  const request = createExplanationRequest(facts, format);
  const fallback = issues => {
    const text = buildGroundedExplanation(facts, format);
    const evaluation = evaluateExplanation(text, facts, format);
    if (!evaluation.passed) throw new Error('No explanation accepted: supplied facts could not produce a valid grounded analysis.');
    return { text, method: 'grounded-template', qualityIssues: issues };
  };

  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(format === 'report' ? 300000 : 120000)]) : AbortSignal.timeout(format === 'report' ? 300000 : 120000),
  });
    if (!response.ok) return fallback([`local model HTTP ${response.status}`]);
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) return fallback(['empty model output']);
    if (result.choices[0].finish_reason === 'length') return fallback(['truncated model output']);
    const evaluation = evaluateExplanation(text, facts, format);
    if (!evaluation.passed) return fallback(evaluation.issues);
    return { text, method: 'local-model', qualityIssues: [] };
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error;
    return fallback(['local model request failed']);
  }
}

function stop() {
  if (processHandle && processHandle.exitCode == null) processHandle.kill();
}

module.exports = { explain, getStatus, start, stop };