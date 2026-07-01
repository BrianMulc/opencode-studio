import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';

import { aggregateAgents } from './agent-aggregation.js';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-server-test-'));

const findAgent = (agents, name) => agents.find((a) => a.name === name);

const writeJson = (filePath, obj) => fs.writeFileSync(filePath, JSON.stringify(obj));

describe('aggregateAgents opencode.json agents', () => {
    it('reads agents from opencode.json with json source and opencode provider metadata', () => {
        const tempDir = makeTempDir();
        const configPath = path.join(tempDir, 'opencode.json');
        writeJson(configPath, { agent: { myAgent: { mode: 'subagent' } } });

        const agents = aggregateAgents({ roots: [tempDir], agentDirs: [], activeConfigDir: tempDir });
        const myAgent = findAgent(agents, 'myAgent');

        expect(myAgent).toBeTruthy();
        expect(myAgent.source).toBe('json');
        expect(myAgent.sourceProvider).toBe('opencode');
        expect(myAgent.active).toBe(true);
        expect(myAgent.configPath).toBe(configPath);
        expect(myAgent.mode).toBe('subagent');

        const omoAgents = agents.filter((a) => a.sourceProvider === 'oh-my-openagent');
        expect(omoAgents).toEqual([]);
    });

    it('does not load OMO agents when opencode.json plugin array does not include oh-my-openagent (profile without OMO plugin)', () => {
        const tempDir = makeTempDir();
        // opencode.json has NO oh-my-openagent in plugin array
        writeJson(path.join(tempDir, 'opencode.json'), {
            plugin: ['@mohak34/opencode-notifier@0.2.8'],
            agent: { myAgent: { mode: 'subagent' } }
        });
        // oh-my-openagent.json EXISTS but plugin is not enabled
        writeJson(path.join(tempDir, 'oh-my-openagent.json'), {
            agents: { omoAgent: { mode: 'primary' } }
        });

        const agents = aggregateAgents({ roots: [tempDir], agentDirs: [], activeConfigDir: tempDir });

        expect(findAgent(agents, 'myAgent')).toBeTruthy();
        expect(findAgent(agents, 'omoAgent')).toBeUndefined();
    });

    it('does not load OMO agents when activeConfigDir has no oh-my-openagent file (profile without OMO)', () => {
        const tempDir = makeTempDir();
        writeJson(path.join(tempDir, 'opencode.json'), { agent: { myAgent: { mode: 'subagent' } } });

        // A different root has an OMO file, but activeConfigDir does not
        const otherDir = makeTempDir();
        writeJson(path.join(otherDir, 'oh-my-openagent.json'), { agents: { strayOmoAgent: { mode: 'primary' } } });

        const agents = aggregateAgents({ roots: [tempDir, otherDir], agentDirs: [], activeConfigDir: tempDir });

        expect(findAgent(agents, 'myAgent')).toBeTruthy();
        expect(findAgent(agents, 'strayOmoAgent')).toBeUndefined();
    });
});

describe('aggregateAgents OMO agents', () => {
    it('reads active same-root OMO agents with oh-my-openagent provider metadata', () => {
        const tempDir = makeTempDir();
        const configPath = path.join(tempDir, 'opencode.json');
        const omoPath = path.join(tempDir, 'oh-my-openagent.json');
        writeJson(configPath, { plugin: ['oh-my-openagent@latest'], agent: { ocAgent: { mode: 'subagent' } } });
        writeJson(omoPath, { agents: { omoAgent: { mode: 'primary' } } });

        const agents = aggregateAgents({ roots: [tempDir], agentDirs: [], activeConfigDir: tempDir });
        const ocAgent = findAgent(agents, 'ocAgent');
        const omoAgent = findAgent(agents, 'omoAgent');

        expect(ocAgent).toBeTruthy();
        expect(ocAgent.sourceProvider).toBe('opencode');

        expect(omoAgent).toBeTruthy();
        expect(omoAgent.source).toBe('json');
        expect(omoAgent.sourceProvider).toBe('oh-my-openagent');
        expect(omoAgent.active).toBe(true);
        expect(omoAgent.configPath).toBe(omoPath);
        expect(omoAgent.mode).toBe('primary');
    });

    it('hides inactive OMO agents from non-active roots by default', () => {
        const tempDirA = makeTempDir();
        const tempDirB = makeTempDir();
        writeJson(path.join(tempDirA, 'opencode.json'), { plugin: ['oh-my-openagent@latest'], agent: { activeOcAgent: { mode: 'subagent' } } });
        writeJson(path.join(tempDirA, 'oh-my-openagent.json'), { agents: { activeOmoAgent: { mode: 'primary' } } });
        writeJson(path.join(tempDirB, 'oh-my-openagent.json'), { agents: { inactiveOmoAgent: { mode: 'subagent' } } });

        const agents = aggregateAgents({ roots: [tempDirA, tempDirB], agentDirs: [], activeConfigDir: tempDirA });

        expect(findAgent(agents, 'activeOcAgent')).toBeTruthy();
        expect(findAgent(agents, 'activeOmoAgent')).toBeTruthy();
        expect(findAgent(agents, 'inactiveOmoAgent')).toBeUndefined();
    });

    it('supports oh-my-openagent.jsonc and legacy oh-my-opencode.json aliases in the active config dir', () => {
        const tempDir = makeTempDir();
        writeJson(path.join(tempDir, 'opencode.json'), { plugin: ['oh-my-openagent@latest'], agent: {} });
        const omoJsoncPath = path.join(tempDir, 'oh-my-openagent.jsonc');
        fs.writeFileSync(omoJsoncPath, '{\n  // comment\n  "agents": { "jsoncAgent": { "mode": "primary" } }\n}\n');

        const agents = aggregateAgents({ roots: [tempDir], agentDirs: [], activeConfigDir: tempDir });
        const jsoncAgent = findAgent(agents, 'jsoncAgent');

        expect(jsoncAgent).toBeTruthy();
        expect(jsoncAgent.sourceProvider).toBe('oh-my-openagent');
        expect(jsoncAgent.configPath).toBe(omoJsoncPath);
    });
});

describe('aggregateAgents built-in agents', () => {
    it('includes build and plan agents with builtin source', () => {
        const agents = aggregateAgents({ roots: [], agentDirs: [], activeConfigDir: null });

        const build = findAgent(agents, 'build');
        const plan = findAgent(agents, 'plan');

        expect(build).toBeTruthy();
        expect(build.source).toBe('builtin');
        expect(build.active).toBe(true);

        expect(plan).toBeTruthy();
        expect(plan.source).toBe('builtin');
        expect(plan.active).toBe(true);
    });
});

describe('aggregateAgents markdown agents', () => {
    it('reads markdown agents from agentDirs with markdown source and file path', () => {
        const tempDir = makeTempDir();
        const agentsDir = path.join(tempDir, 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        const mdPath = path.join(agentsDir, 'myMdAgent.md');
        fs.writeFileSync(mdPath, '---\ndescription: Test agent\nmode: subagent\nmodel: claude-sonnet-4-20250514\n---\n\nThis is the agent prompt.\n');

        const agents = aggregateAgents({ roots: [], agentDirs: [agentsDir], activeConfigDir: null });
        const mdAgent = findAgent(agents, 'myMdAgent');

        expect(mdAgent).toBeTruthy();
        expect(mdAgent.source).toBe('markdown');
        expect(mdAgent.path).toBe(mdPath);
        expect(mdAgent.configPath).toBe(mdPath);
        expect(mdAgent.active).toBe(true);
        expect(mdAgent.description).toBe('Test agent');
        expect(mdAgent.mode).toBe('subagent');
        expect(mdAgent.prompt).toContain('This is the agent prompt.');
    });
});
