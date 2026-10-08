// ---------------------------------------------------------------------------
// Grimsolf Sprite Viewer - pure logic (no vscode dependency, unit-testable).
//
// Mirrors the rules used by the in-game Sprite Editor / tools/sprite_texture.py:
//   - texturename is relative to resources/sprites/<texturename>.png
//     (data refs use "unit/...", sprite files use "units/...")
//   - each animation row: sprite-direction-left/top/width/height
//   - sprite-limit is the X of the LAST frame: (frames-1) * frame width
//   - frame count of an animation = (sprite-limit - left) / width + 1
//   - speed = seconds per frame, loop / reverse-mode / side-flip flags
// ---------------------------------------------------------------------------
'use strict';

const path = require('path');
const fs = require('fs');

function num(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// Describes one animation entry of a texture JSON (same fields the Sprite
// Editor shows / the game plays).
function describeAnimation(a, index) {
    const width = num(a['sprite-direction-width'], 0);
    const height = num(a['sprite-direction-height'], 0);
    const left = num(a['sprite-direction-left'], 0);
    const top = num(a['sprite-direction-top'], 0);
    const limit = num(a['sprite-limit'], 0);
    const speed = num(a.speed, 0.15);

    // frame count: last frame X is sprite-limit; a limit of 0 = single frame
    // (e.g. the procedural "death" placeholder).
    let frames = 1;
    if (width > 0 && limit > left)
        frames = Math.max(1, Math.floor((limit - left) / width) + 1);

    return {
        index,
        name: (typeof a.name === 'string' && a.name) ? a.name : 'animation-' + (index + 1),
        left,
        top,
        width,
        height,
        limit,
        frames,
        speed: speed > 0 ? speed : 0.15,
        loop: a.loop !== false,
        animated: a.animated !== false,
        sideFlip: a['side-flip'] === true,
        reverseMode: a['reverse-mode'] === true
    };
}

// Parses the text of a texture JSON. Returns { error } or
// { texturename, animations[], dimensionWidth, dimensionHeight }.
function parseTextureText(text) {
    let data = null;
    try {
        data = JSON.parse(text);
    } catch (err) {
        return { error: 'Invalid JSON: ' + err.message };
    }
    if (!data || typeof data !== 'object' || typeof data.texturename !== 'string') {
        return { error: 'Not a Grimsolf texture JSON (missing "texturename").' };
    }
    const animations = Array.isArray(data.animation) ? data.animation.map(describeAnimation) : [];
    return {
        texturename: data.texturename,
        animations,
        dimensionWidth: num(data['dimension-width'], 0),
        dimensionHeight: num(data['dimension-height'], 0)
    };
}

// Resolves resources/sprites/<texturename>.png under `root`. Tries the
// "units/" <-> "unit/" variant when the exact path does not exist. Returns
// the best candidate even when missing (caller checks existsSync).
function resolveSpritePng(root, texturename, spritesRoot) {
    const base = spritesRoot || 'resources/sprites';
    const candidates = [];
    const push = (name) => candidates.push(path.join(root, base, name + '.png'));
    push(texturename);
    if (texturename.startsWith('units/'))
        push('unit/' + texturename.slice('units/'.length));
    else if (texturename.startsWith('unit/'))
        push('units/' + texturename.slice('unit/'.length));
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return candidates[0];
}

module.exports = {
    num,
    describeAnimation,
    parseTextureText,
    resolveSpritePng
};
