// Bootstrap: wires startup and window events. Loaded last.

// ── End Citation Generator Engine ──────────────────────────────────────

window.addEventListener('resize', () => {
    if (currentMode !== 'table' || !gridData.length) {
        return;
    }

    applyPreviewTableSizing(document.getElementById('prev-table'));
});

window.onload = init;
