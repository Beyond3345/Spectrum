import path from 'path';

// The Python that Spectrum runs: SPECTRUM_PYTHON, the active conda environment's, or the one on PATH. DDGS web search
// uses it, and Settings › System checks it.
export function resolvePythonExecutable() {
  if (process.env.SPECTRUM_PYTHON) return process.env.SPECTRUM_PYTHON;
  // Windows keeps python.exe at the environment's top, and has no python3 command
  // ponytail: Python installed without "Add to PATH" only has the py launcher; try py too if that bites
  if (process.platform === 'win32') return process.env.CONDA_PREFIX ? path.join(process.env.CONDA_PREFIX, 'python.exe') : 'python';
  if (process.env.CONDA_PREFIX) return `${process.env.CONDA_PREFIX}/bin/python`;
  return 'python3';
}
