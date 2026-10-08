// Extracts GUI_EVENT_DEFS / GUI_CONDITION_DEFS / GUI_ACTION_DEFS from
// triggerDefs.cpp into plugin JSON files.
// Run from the plugin folder: node extract-defs.js
const fs = require('fs');
const path = require('path');
const defsPath = path.join(__dirname, '..', 'realm-editor', 'source', 'system', 'trigger', 'triggerDefs.cpp');
const src = fs.readFileSync(defsPath, 'utf8');

function parseList(name) {
    const start = src.indexOf(`GUI_${name}_DEFS =`);
    if (start < 0) throw new Error(name + ' not found');
    const braceStart = src.indexOf('{', start);
    let depth = 0, end = braceStart;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(braceStart + 1, end);
    const defs = [];
    // Each T("key", "description", PT({...}))
    const re = /T\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*PT\(\s*(\{|\{\})/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const key = JSON.parse(`"${m[1]}"`);
        const description = JSON.parse(`"${m[2]}"`);
        const paramsStart = m.index + m[0].length - 1;
        let pdepth = 0, pend = paramsStart;
        for (let i = paramsStart; i < body.length; i++) {
            if (body[i] === '{') pdepth++;
            else if (body[i] === '}') { pdepth--; if (pdepth === 0) { pend = i; break; } }
        }
        const pbody = body.slice(paramsStart + 1, pend);
        const params = [];
        const pre = /P\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*(-?\d+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(\w+)"\s*(?:,\s*(true|false))?\s*\)/g;
        let p;
        while ((p = pre.exec(pbody)) !== null) {
            params.push({
                field: JSON.parse(`"${p[1]}"`),
                index: parseInt(p[2], 10),
                label: JSON.parse(`"${p[3]}"`),
                type: p[4],
                required: p[5] === 'true'
            });
        }
        defs.push({ key, description, params });
    }
    return defs;
}

const out = {
    events: parseList('EVENT'),
    conditions: parseList('CONDITION'),
    actions: parseList('ACTION')
};

const total = out.events.length + out.conditions.length + out.actions.length;
fs.mkdirSync('vscodium-plugin/syntaxes', { recursive: true });
fs.writeFileSync('vscodium-plugin/trigger-defs.json', JSON.stringify(out, null, 2) + '\n');
console.log(`events=${out.events.length} conditions=${out.conditions.length} actions=${out.actions.length} total=${total}`);

// sanity: check a known action has params parsed
const spawn = out.actions.find(a => a.key === 'spawn-unit');
console.log('spawn-unit params:', spawn ? spawn.params.length : 'MISSING');
