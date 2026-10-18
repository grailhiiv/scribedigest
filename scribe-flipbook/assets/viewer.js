(function () {
    'use strict';
    const roots = document.querySelectorAll('.sfb');
    if (!roots.length) return;
    const runtime = new URL('viewer-runtime.js', roots[0].dataset.assets);
    runtime.searchParams.set('ver', roots[0].dataset.version);
    function failed(root, message) {
        if (root.dataset.state === 'ready') return;
        root.dataset.state = 'error';
        root.querySelector('.sfb-status').textContent = message;
        root.querySelector('.sfb-error-fallback').hidden = false;
    }
    const deadline = setTimeout(() => {
        roots.forEach(root => failed(root, 'The reader is taking too long to load. Reload or open the original PDF.'));
        clearInterval(watch);
    }, 60000);
    const watch = setInterval(() => {
        if ([...roots].every(root => ['ready', 'error'].includes(root.dataset.state))) {
            clearTimeout(deadline); clearInterval(watch);
        }
    }, 250);
    import(runtime.href).then(module => Promise.all([...roots].map(root => module.mount(root))))
        .catch(error => {
            console.error('Scribe Flipbook could not start:', error);
            roots.forEach(root => failed(root, 'The reader scripts could not load. Reload or open the original PDF.'));
        });
})();
