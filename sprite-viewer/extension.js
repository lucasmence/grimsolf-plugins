// ---------------------------------------------------------------------------
// Grimsolf Sprite Viewer - VSCodium extension
//
// Shows the sprite sheet of a Grimsolf texture JSON in a popup (WebviewPanel),
// resolving the PNG through the "texturename" path (resources/sprites), and
// plays each animation in a second popup using the same rules as the in-game
// Sprite Editor (sprite-limit = X of the last frame, speed = seconds per
// frame, loop / reverse-mode / side-flip).
//
// Triggers:
//   - CodeLens "Preview sprite sheet" on the first line of a texture JSON
//   - Editor right-click context menu (texture JSONs only)
//   - Command palette / Ctrl+Alt+G
// ---------------------------------------------------------------------------
'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const textureUtils = require('./texture-utils');

// ---------------------------------------------------------------------------
// State (single instances: reuse the popups instead of stacking new ones)
// ---------------------------------------------------------------------------
let extensionContext = null;
let sheetPanel = undefined;
let animPanel = undefined;
let lastTexture = null; // parsed texture + resolved PNG info of the sheet popup

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; ++i)
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    return text;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function embedJson(value) {
    // Safe to inline into a <script> block (CSP nonce) even if the data
    // contains "</script>".
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function workspaceRootFor(uri) {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
        const fsPath = uri ? uri.fsPath : '';
        for (const folder of folders) {
            if (fsPath && fsPath.startsWith(folder.uri.fsPath))
                return folder.uri.fsPath;
        }
        return folders[0].uri.fsPath;
    }
    return uri ? path.dirname(uri.fsPath) : process.cwd();
}

function defaultScale() {
    return vscode.workspace.getConfiguration('grimsolfSpriteViewer').get('defaultScale', 1);
}

// Local resources the webviews may load: the extension media (css/js) and the
// workspace roots (the sprite PNGs live under the game/workspace folder, e.g.
// resources/sprites/... - without this VS Code blocks the images).
function panelLocalRoots() {
    const roots = [vscode.Uri.joinPath(extensionContext.extensionUri, 'media')];
    const folders = vscode.workspace.workspaceFolders;
    if (folders)
        folders.forEach(function (folder) { roots.push(folder.uri); });
    return roots;
}

function getActiveTextureDocument() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'json') {
        vscode.window.showInformationMessage(
            'Grimsolf Sprite Viewer: open a texture JSON first.');
        return null;
    }
    return editor.document;
}

// ---------------------------------------------------------------------------
// Context key (enables the right-click menu only on texture JSONs)
// ---------------------------------------------------------------------------
function refreshTextureContextKey(editor) {
    let isTexture = false;
    if (editor && editor.document.languageId === 'json') {
        const text = editor.document.getText();
        isTexture = text.includes('"texturename"');
    }
    vscode.commands.executeCommand('setContext', 'grimsolfIsTextureJson', isTexture);
}

// ---------------------------------------------------------------------------
// CodeLens: "Preview sprite sheet" on the first line of a texture JSON
// ---------------------------------------------------------------------------
class TextureCodeLensProvider {
    provideCodeLenses(document) {
        if (document.languageId !== 'json')
            return [];
        if (!document.getText().includes('"texturename"'))
            return [];
        const line = document.lineAt(0);
        const range = new vscode.Range(line.range.start, line.range.start);
        return [new vscode.CodeLens(range, {
            title: '\u{1F441} Preview sprite sheet',
            command: 'grimsolfSpriteViewer.showSheet',
            arguments: [document.uri]
        })];
    }
}

// ---------------------------------------------------------------------------
// Popup 1: sprite sheet viewer (with the animation list)
// ---------------------------------------------------------------------------
function buildSheetHtml(webview, data) {
    const nonce = getNonce();
    const jsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, 'media', 'sheetViewer.js'));
    const cssUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, 'media', 'sheetViewer.css'));
    const localResources = [
        vscode.Uri.joinPath(extensionContext.extensionUri, 'media')
    ];
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${cssUri}">
<title>Sprite sheet</title>
</head>
<body>
    <header class="app-header">
        <div class="title-row">
            <span class="title">Sprite sheet</span>
            <span class="texture-name" id="texture-name">${escapeHtml(data.texturename)}</span>
        </div>
        <div class="meta" id="sheet-meta">${data.pngExists ? escapeHtml(data.pngPath) : 'PNG not found'}</div>
    </header>
    ${data.pngExists ? '' : '<div class="warn-banner">Sprite sheet not found. Check the "texturename" path / <code>grimsolfSpriteViewer.spritesRoot</code>.</div>'}
    <main class="sheet-layout">
        <section class="sheet-pane">
            <div class="pane-header">
                <span>Sheet</span>
                <label class="zoom-control">Zoom
                    <input type="range" id="sheet-zoom" min="0.1" max="8" step="0.05" value="${data.scale}">
                    <span id="sheet-zoom-label">${data.scale}x</span>
                </label>
            </div>
            <div class="sheet-viewport">
                <img id="sheet-img" alt="sprite sheet" ${data.pngExists ? '' : 'hidden'}>
            </div>
            <div class="sheet-dims" id="sheet-dims"></div>
        </section>
        <section class="list-pane">
            <div class="pane-header"><span>Animations (${data.animations.length})</span></div>
            <div class="anim-list" id="anim-list"></div>
        </section>
    </main>
<script nonce="${nonce}">window.DATA = ${embedJson(data)};</script>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function showSheet() {
    const document = getActiveTextureDocument();
    if (!document)
        return;

    const texture = textureUtils.parseTextureText(document.getText());
    if (texture.error) {
        vscode.window.showInformationMessage('Grimsolf Sprite Viewer: ' + texture.error);
        return;
    }

    const root = workspaceRootFor(document.uri);
    const spritesRoot = vscode.workspace.getConfiguration('grimsolfSpriteViewer')
        .get('spritesRoot', 'resources/sprites');
    const pngPath = textureUtils.resolveSpritePng(root, texture.texturename, spritesRoot);
    const pngExists = fs.existsSync(pngPath);

    if (!pngExists)
        vscode.window.showWarningMessage(
            'Grimsolf Sprite Viewer: sprite sheet not found at ' + pngPath);

    lastTexture = { ...texture, root, pngPath, pngExists };

    if (!sheetPanel) {
        sheetPanel = vscode.window.createWebviewPanel(
            'grimsolfSheet',
            'Grimsolf - Sprite sheet',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: panelLocalRoots()
            }
        );
        sheetPanel.onDidDispose(() => { sheetPanel = undefined; }, null, extensionContext.subscriptions);
        sheetPanel.webview.onDidReceiveMessage((msg) => {
            if (msg.type === 'play')
                showAnimation(lastTexture, msg.index);
        }, null, extensionContext.subscriptions);
    } else {
        sheetPanel.reveal(vscode.ViewColumn.Beside);
    }

    const data = {
        texturename: texture.texturename,
        pngUri: sheetPanel.webview.asWebviewUri(vscode.Uri.file(pngPath)).toString(),
        pngPath,
        pngExists,
        animations: texture.animations,
        scale: defaultScale()
    };
    sheetPanel.webview.html = buildSheetHtml(sheetPanel.webview, data);
}

// ---------------------------------------------------------------------------
// Popup 2: animation player (same playback rules as the Sprite Editor)
// ---------------------------------------------------------------------------
function buildAnimHtml(webview, data) {
    const nonce = getNonce();
    const jsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, 'media', 'animViewer.js'));
    const cssUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, 'media', 'animViewer.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${cssUri}">
<title>Animation</title>
</head>
<body>
    <header class="app-header">
        <div class="title-row">
            <span class="title">Animation</span>
            <span class="anim-name" id="anim-name">${escapeHtml(data.anim.name)}</span>
            <span class="texture-name" id="texture-name">${escapeHtml(data.texturename)}</span>
        </div>
        <div class="meta" id="anim-meta"></div>
    </header>
    ${data.pngExists ? '' : '<div class="warn-banner">Sprite sheet not found.</div>'}
    <main class="anim-layout">
        <section class="stage-pane">
            <canvas id="anim-canvas"></canvas>
            <div class="stage-overlay" id="stage-overlay"></div>
        </section>
        <section class="controls-pane">
            <div class="ctrl-row">
                <button id="btn-play" title="Play / Pause">&#9208;</button>
                <button id="btn-restart" title="Restart">&#8635;</button>
                <button id="btn-prev" title="Previous frame">&#9664;</button>
                <button id="btn-next" title="Next frame">&#9654;</button>
            </div>
            <div class="ctrl-row">
                <label>Frame <input type="range" id="frame-slider" min="0" max="${Math.max(0, data.anim.frames - 1)}" step="1" value="0">
                <span id="frame-label">0 / ${data.anim.frames}</span></label>
            </div>
            <div class="ctrl-row">
                <label><input type="checkbox" id="chk-loop" ${data.anim.loop ? 'checked' : ''}> Loop</label>
                <label><input type="checkbox" id="chk-flip" ${data.anim.sideFlip ? 'checked' : ''}> Side flip</label>
            </div>
            <div class="ctrl-row">
                <label>Zoom <input type="range" id="anim-zoom" min="0.1" max="8" step="0.05" value="${data.scale}">
                <span id="anim-zoom-label">${data.scale}x</span></label>
            </div>
            <dl class="info-grid" id="info-grid"></dl>
        </section>
    </main>
<script nonce="${nonce}">window.DATA = ${embedJson(data)};</script>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function showAnimation(texture, index) {
    if (!texture || !texture.animations || !texture.animations[index])
        return;
    const anim = texture.animations[index];

    if (!animPanel) {
        animPanel = vscode.window.createWebviewPanel(
            'grimsolfAnim',
            'Grimsolf - Animation',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: panelLocalRoots()
            }
        );
        animPanel.onDidDispose(() => { animPanel = undefined; }, null, extensionContext.subscriptions);
    } else {
        animPanel.reveal(vscode.ViewColumn.Beside);
    }
    animPanel.title = 'Grimsolf - ' + anim.name;

    const data = {
        texturename: texture.texturename,
        pngUri: animPanel.webview.asWebviewUri(vscode.Uri.file(texture.pngPath)).toString(),
        pngExists: texture.pngExists,
        anim,
        scale: defaultScale()
    };
    animPanel.webview.html = buildAnimHtml(animPanel.webview, data);
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
    extensionContext = context;

    refreshTextureContextKey(vscode.window.activeTextEditor);
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(refreshTextureContextKey),
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document)
                refreshTextureContextKey(editor);
        }),
        vscode.commands.registerCommand('grimsolfSpriteViewer.showSheet', showSheet),
        vscode.commands.registerCommand('grimsolfSpriteViewer.showAnimation', () => {
            if (lastTexture && lastTexture.animations.length)
                showAnimation(lastTexture, 0);
            else
                vscode.window.showInformationMessage(
                    'Grimsolf Sprite Viewer: open a texture sheet first.');
        }),
        vscode.languages.registerCodeLensProvider('json', new TextureCodeLensProvider())
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
