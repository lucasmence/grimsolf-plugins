// Grimsolf Sprite Viewer - sheet popup logic (webview).
// window.DATA = { texturename, pngUri, pngPath, pngExists, animations[], scale }
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const DATA = window.DATA;

    const sheetImg = document.getElementById('sheet-img');
    const sheetDims = document.getElementById('sheet-dims');
    const zoomSlider = document.getElementById('sheet-zoom');
    const zoomLabel = document.getElementById('sheet-zoom-label');
    const sheetMeta = document.getElementById('sheet-meta');

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ---- sheet image + dimensions ---------------------------------------
    sheetImg.addEventListener('load', function () {
        const w = sheetImg.naturalWidth;
        const h = sheetImg.naturalHeight;
        sheetDims.textContent = w + ' x ' + h + ' px';
        if (sheetMeta) {
            sheetMeta.textContent = DATA.pngPath + '  \u00b7  ' + w + 'x' + h + ' px';
        }
        applyZoom();
    });

    function applyZoom() {
        if (!sheetImg.naturalWidth) return;
        const s = parseFloat(zoomSlider.value) || 1;
        sheetImg.style.width = Math.round(sheetImg.naturalWidth * s) + 'px';
        zoomLabel.textContent = s.toFixed(2).replace(/\.?0+$/, '') + 'x';
    }
    zoomSlider.addEventListener('input', applyZoom);

    if (DATA.pngExists) {
        sheetImg.src = DATA.pngUri;
    } else if (sheetMeta) {
        sheetMeta.textContent = DATA.pngPath + '  (missing)';
    }

    // ---- animation list --------------------------------------------------
    const listEl = document.getElementById('anim-list');
    DATA.animations.forEach(function (anim) {
        const card = document.createElement('div');
        card.className = 'anim-card';
        card.title = 'Click to play \u201c' + anim.name + '\u201d';

        const tags = [];
        tags.push('<span class="tag' + (anim.animated ? ' on' : ' off') + '">' +
            (anim.animated ? '\u25b6 animated' : 'static') + '</span>');
        tags.push('<span class="tag' + (anim.loop ? ' on' : ' off') + '">loop</span>');
        tags.push('<span class="tag' + (anim.sideFlip ? ' on' : ' off') + '">side-flip</span>');
        if (anim.reverseMode)
            tags.push('<span class="tag on">reverse</span>');

        card.innerHTML =
            '<div class="anim-name">' + escapeHtml(anim.name) + '</div>' +
            '<div class="anim-meta">' + anim.frames + ' frame(s) \u00b7 ' +
                anim.width + 'x' + anim.height + 'px \u00b7 speed ' + anim.speed +
                's \u00b7 limit ' + anim.limit + '</div>' +
            '<div class="anim-tags">' + tags.join('') + '</div>';

        card.addEventListener('click', function () {
            vscode.postMessage({ type: 'play', index: anim.index });
        });
        listEl.appendChild(card);
    });

    if (!DATA.animations.length) {
        const empty = document.createElement('div');
        empty.className = 'anim-card';
        empty.style.cursor = 'default';
        empty.textContent = 'No animations in this JSON.';
        listEl.appendChild(empty);
    }
})();
