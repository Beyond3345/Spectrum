import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const fixture = fileURLToPath(new URL('./fixtures/acp-draft-agent.mjs', import.meta.url));
const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
const skill = (id) => `---\nname: ${id}\ndescription: The ${id} skill\n---\nDo ${id}.\n`;

test('the project’s skills are copied into the agent’s home, marked, and only ours are ever replaced or removed', { skip: !native && 'Requires native macOS or Windows sandbox execution.', timeout: 60000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-skills-')));
  const seed = path.join(dir, 'seed');
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: seed });
  for (const id of ['alpha', 'beta', 'gamma']) await write(path.join(seed, id, 'SKILL.md'), skill(id));
  // what isolation keeps from agents stays behind, rather than stopping every skill after it
  for (const name of ['.git/config', '.env.example', 'notes/server.key']) await write(path.join(seed, 'alpha', name), 'kept from agents');
  // Windows has no Claude, and its isolation refuses a home with a link anywhere in it
  const windows = process.platform === 'win32';
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig, agentHome } = await import('../src/services/agentProfiles.js');
  const { updateProjectSettings } = await import('../src/services/projectSettings.js');
  const { setSkillEnabled } = await import('../src/services/skillService.js');
  const { newAgentRun, getAgentRun, promptAgent, stopAgentRun, shutdownAgents } = await import('../src/services/agentSessionService.js');
  const turn = async (run) => { await promptAgent(run, 'answer'); await run.task; assert.equal(run.status, 'completed'); };
  try {
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [path.dirname(fixture)] });
    const home = await agentHome('qoder');
    const agents = path.join(home, '.agents', 'skills'), claude = path.join(home, '.claude', 'skills');
    await write(path.join(agents, 'beta', 'SKILL.md'), 'the agent’s own beta');
    await write(path.join(claude, 'their-own', 'SKILL.md'), 'installed by the agent');
    const outside = path.join(dir, 'outside');
    await fs.mkdir(outside);
    if (!windows) await fs.symlink(outside, path.join(claude, 'gamma'));

    const project = await createProject({ name: 'Skills at home' });
    await updateProjectSettings(project.path, (s) => ({ ...s, skills: { on: [], off: ['beta'] } }));
    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder' })).id);
    await run.ready;
    assert.equal(await fs.readFile(path.join(agents, 'alpha', 'SKILL.md'), 'utf8'), skill('alpha'));
    assert.deepEqual((await fs.readdir(path.join(agents, 'alpha'), { recursive: true })).sort(), ['.spectrum-managed', 'SKILL.md', 'notes'], 'no .git, .env or key');
    assert.equal(await fs.readFile(path.join(agents, 'beta', 'SKILL.md'), 'utf8'), 'the agent’s own beta');
    assert.equal(await fs.readFile(path.join(agents, 'gamma', 'SKILL.md'), 'utf8'), skill('gamma'));
    if (windows) await assert.rejects(fs.stat(path.join(claude, 'alpha')), 'only .agents/skills on Windows');
    else {
      assert.ok((await fs.readFile(path.join(claude, 'alpha', '.spectrum-managed'), 'utf8')).length > 10);
      await assert.rejects(fs.stat(path.join(claude, 'beta')), 'off in this project');
      assert.equal(await fs.readFile(path.join(claude, 'their-own', 'SKILL.md'), 'utf8'), 'installed by the agent');
      assert.ok((await fs.lstat(path.join(claude, 'gamma'))).isSymbolicLink(), 'something else of that name stays');
      assert.deepEqual(await fs.readdir(outside), [], 'nothing went through the link');
    }

    // a change reaches the agent on its next connection (the first turn has the one made when the session started)
    await turn(run);
    await updateProjectSettings(project.path, (s) => ({ ...s, skills: { on: [], off: [] } }));
    await write(path.join(dir, 'data', 'skills', 'bundled', 'alpha', 'SKILL.md'), skill('alpha') + 'Updated.\n');
    await turn(run);
    if (!windows) assert.equal(await fs.readFile(path.join(claude, 'beta', 'SKILL.md'), 'utf8'), skill('beta'));
    assert.equal(await fs.readFile(path.join(agents, 'beta', 'SKILL.md'), 'utf8'), 'the agent’s own beta');
    assert.match(await fs.readFile(path.join(agents, 'alpha', 'SKILL.md'), 'utf8'), /Updated/);

    // while another project's session of the agent runs, skills are only added
    const other = await createProject({ name: 'Other project' });
    const second = await getAgentRun((await newAgentRun({ projectId: other.id, agentId: 'qoder' })).id);
    await second.ready;
    await setSkillEnabled('alpha', false);
    second.busy = true;
    await turn(run);
    assert.ok(await fs.stat(path.join(agents, 'alpha')));
    second.busy = false;
    await stopAgentRun(second); // its agent, waiting for a prompt, could still read them
    await turn(run);
    await assert.rejects(fs.stat(path.join(agents, 'alpha')), 'removed once nothing else uses the home');
    await assert.rejects(fs.stat(path.join(claude, 'alpha')));
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
