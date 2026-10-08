// Grimsolf Sprite Viewer - animation player (webview).
//
// Playback rules mirror the in-game Sprite Editor:
//   - frame count = (sprite-limit - left) / width + 1  (1 if limit <= left)
//   - speed = seconds per frame
//   - loop wraps; reverse-mode ping-pongs (forward then backward)
//   - side-flip mirrors horizontally
// window.DATA = { texturename, pngUri, pngExists, anim, scale }
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const DATA = window.DATA;
    const anim = DATA.anim;

    const canvas = document.getElementById('anim-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const frames = Math.max(1, anim.frames);
    let frame = 0;
    let direction = 1;      // 1 = forward, -1 = backward (reverse-mode)
    let playing = true;
    let loop = anim.loop;
    let sideFlip = anim.sideFlip;
    let zoom = parseFloat(DATA.scale) || 1;
    let finished = false;
    let lastTime = 0;
    let accumulator = 0;

    // ---- DOM refs --------------------------------------------------------
    const btnPlay = document.getElementById('btn-play');
    const btnRestart = document.getElementById('btn-restart');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const slider = document.getElementById('frame-slider');
    const frameLabel = document.getElementById('frame-label');
    const chkLoop = document.getElementById('chk-loop');
    const chkFlip = document.getElementById('chk-flip');
    const zoomSlider = document.getElementById('anim-zoom');
    const zoomLabel = document.getElementById('anim-zoom-label');
    const overlay = document.getElementById('stage-overlay');
    const infoGrid = document.getElementById('info-grid');
    const animMeta = document.getElementById('anim-meta');

    // ---- info --------------------------------------------------------------
    if (animMeta) {
        animMeta.textContent = anim.width + 'x' + anim.height +
            'px @ (' + anim.left + ',' + anim.top + ')  \u00b7  limit ' + anim.limit +
            '  \u00b7  ' + frames + ' frame(s)';
    }
    if (infoGrid) {
        const rows = [
            ['name', anim.name],
            ['frames', String(frames)],
            ['frame size', anim.width + 'x' + anim.height + 'px'],
            ['sheet offset', '(' + anim.left + ', ' + anim.top + ')'],
            ['sprite-limit', String(anim.limit)],
            ['speed', anim.speed + ' s/frame'],
            ['loop', loop ? 'yes' : 'no'],
            ['reverse-mode', anim.reverseMode ? 'yes' : 'no'],
            ['side-flip', anim.sideFlip ? 'yes' : 'no'],
            ['animated', anim.animated ? 'yes' : 'no']
        ];
        let html = '';
        rows.forEach(function (row) {
            html += '<dt>' + row[0] + '</dt><dd>' + row[1] + '</dd>';
        });
        infoGrid.innerHTML = html;
    }

    // ---- playback ----------------------------------------------------------
    function step(dt) {
        if (!playing || !anim.animated || frames <= 1)
            return;
        const duration = anim.speed * 1000;
        if (duration <= 0)
            return;

        accumulator += dt;
        while (accumulator >= duration) {
            accumulator -= duration;
            frame += direction;

            if (frame >= frames) {
                if (loop) {
                    if (anim.reverseMode) {
                        direction = -1;
                        frame = frames - 2;
                    } else {
                        frame = 0;
                    }
                } else {
                    frame = frames - 1;
                    playing = false;
                    finished = true;
                }
            } else if (frame < 0) {
                if (anim.reverseMode) {
                    direction = 1;
                    frame = 1;
                } else {
                    frame = 0;
                }
            }
        }
    }

    function draw() {
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth || 300;
        const cssH = canvas.clientHeight || 300;
        if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        if (anim.width <= 0 || anim.height <= 0) {
            ctx.fillStyle = '#ff6b6b';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('invalid frame size (' + anim.width + 'x' + anim.height + ')',
                cssW / 2, cssH / 2);
            return;
        }

        if (!img.complete || !img.naturalWidth) {
            ctx.fillStyle = '#9a9ab0';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('loading sprite sheet...', cssW / 2, cssH / 2);
            return;
        }

        // Fit the frame into the stage, keeping the user zoom.
        const fit = Math.min((cssW * 0.9) / anim.width, (cssH * 0.9) / anim.height);
        const s = Math.max(0.01, fit * zoom);
        const drawW = anim.width * s;
        const drawH = anim.height * s;
        const dx = (cssW - drawW) / 2;
        const dy = (cssH - drawH) / 2;

        const sx = anim.left + frame * anim.width;
        const sy = anim.top;

        if (sideFlip) {
            ctx.save();
            ctx.translate(dx + drawW / 2, dy + drawH / 2);
            ctx.scale(-1, 1);
            ctx.drawImage(img, sx, sy, anim.width, anim.height,
                -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
        } else {
            ctx.drawImage(img, sx, sy, anim.width, anim.height,
                dx, dy, drawW, drawH);
        }
    }

    function updateHud() {
        btnPlay.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
        slider.value = String(frame);
        frameLabel.textContent = frame + ' / ' + (frames - 1);
        overlay.textContent = (anim.name || '') + '  \u00b7  ' + (frame + 1) + '/' + frames +
            (finished ? '  \u00b7  done' : '');
    }

    function animationLoop(ts) {
        const dt = lastTime ? ts - lastTime : 0;
        lastTime = ts;
        step(dt);
        draw();
        updateHud();
        requestAnimationFrame(animationLoop);
    }

    // ---- controls ----------------------------------------------------------
    // autoplay: true only when the user explicitly asks to (re)start playback
    // (play button / restart). Scrubbing or stepping a frame stays paused.
    function seek(f, autoplay) {
        frame = Math.max(0, Math.min(f, frames - 1));
        accumulator = 0;
        finished = false;
        if (autoplay && anim.animated && frames > 1)
            playing = true;
        updateHud();
        draw();
    }

    btnPlay.addEventListener('click', function () {
        if (anim.animated && frames > 1) {
            playing = !playing;
            if (playing && finished) seek(0, true);
        }
        updateHud();
    });

    btnRestart.addEventListener('click', function () {
        direction = 1;
        seek(0, true);
    });

    btnPrev.addEventListener('click', function () { playing = false; seek(frame - 1, false); });
    btnNext.addEventListener('click', function () { playing = false; seek(frame + 1, false); });

    slider.addEventListener('input', function () {
        playing = false;
        seek(parseInt(slider.value, 10) || 0, false);
    });

    chkLoop.addEventListener('change', function () { loop = chkLoop.checked; });
    chkFlip.addEventListener('change', function () { sideFlip = chkFlip.checked; });

    zoomSlider.addEventListener('input', function () {
        zoom = parseFloat(zoomSlider.value) || 1;
        zoomLabel.textContent = zoom.toFixed(2).replace(/\.?0+$/, '') + 'x';
    });

    // Space toggles play/pause (when the buttons are not focused).
    document.addEventListener('keydown', function (event) {
        if (event.code === 'Space' && event.target === document.body) {
            event.preventDefault();
            btnPlay.click();
        }
    });

    // ---- start ---------------------------------------------------------------
    if (DATA.pngExists) {
        img.src = DATA.pngUri;
    }
    img.addEventListener('load', function () { updateHud(); draw(); });
    requestAnimationFrame(animationLoop);
})();
