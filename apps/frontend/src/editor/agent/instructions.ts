// AGENTS.md, the user's own file of standing instructions for agents in one project, and the starter Spectrum offers.
// The backend (agentInstructions.js) decides whether the file reaches a prompt. What the Spectrum agent remembers is
// kept apart from it, by Spectrum (agentMemory.js).

export const INSTRUCTIONS_FILE = 'AGENTS.md';

/** The file Spectrum offers to start from: what the project is, and a few rules for the user to make their own. */
export const starterInstructions = ({ mainFile, language }: { mainFile: string; language: string }) => `# Instructions for agents

Agents that work on this project read this file as your standing instructions. Keep it short, one rule a line, and change the examples to your own.

## Project

- ${mainFile ? `Main file: ${mainFile} (${language})` : `Language: ${language}`}

## Rules

- Spelling: Australian English.
- Change only what a task asks for, and keep the document’s own commands, packages and style.
- Do not change the files in figures/ or diagrams/.
`;
