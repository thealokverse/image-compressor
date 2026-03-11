document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const [uploadArea, fileInput, workspace, cardsContainer] = 
        ['uploadArea', 'fileInput', 'workspace', 'cardsContainer'].map($);
    const [slider, sliderVal, maxWidth, format, addMoreBtn, clearAllBtn] = 
        ['compressionSlider', 'compressionValue', 'maxWidthInput', 'formatSelect', 'addMoreBtn', 'clearAllBtn'].map($);
    
    let filesData = [], debounceTimer;

    const updateSliderBg = (el) => {
        const p = ((el.value - el.min) / (el.max - el.min)) * 100;
        const c1 = getComputedStyle(document.body).getPropertyValue('--accent-color').trim() || '#0a84ff';
        const c2 = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#38383a';
        el.style.background = `linear-gradient(to right, ${c1} ${p}%, ${c2} ${p}%)`;
    };
    updateSliderBg(slider);

    const onDrop = e => { e.preventDefault(); uploadArea.classList.remove('dragover'); handleFiles(e.dataTransfer?.files || []); };
    uploadArea.onclick = () => fileInput.click();
    uploadArea.ondragover = e => { e.preventDefault(); uploadArea.classList.add('dragover'); };
    uploadArea.ondragleave = () => uploadArea.classList.remove('dragover');
    uploadArea.ondrop = onDrop;
    fileInput.onchange = e => { handleFiles(e.target.files || []); e.target.value = ''; };
    addMoreBtn.onclick = () => fileInput.click();
    
    clearAllBtn.onclick = () => {
        filesData.forEach(fd => cleanupUIData(fd.id));
        cardsContainer.innerHTML = '';
        filesData = [];
        toggleWorkspace();
    };

    const fmtBytes = (b) => b===0 ? '0 B' : parseFloat((b/Math.pow(1024, Math.floor(Math.log(b)/Math.log(1024)))).toFixed(2)) + ' ' + ['B','KB','MB','GB'][Math.floor(Math.log(b)/Math.log(1024))];

    function handleFiles(files) {
        let added = false;
        Array.from(files).filter(f => /^image\/(jpeg|png|webp)$/.test(f.type)).forEach(file => {
            const fd = { id: Math.random().toString(36).slice(2), file, origUrl: URL.createObjectURL(file) };
            filesData.push(fd);
            createCard(fd);
            compress(fd);
            added = true;
        });
        if (added) toggleWorkspace();
    }

    function toggleWorkspace() {
        workspace.classList.toggle('hidden', !filesData.length);
        uploadArea.classList.toggle('hidden', !!filesData.length);
    }

    const triggerAll = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => filesData.forEach(compress), 500); };
    
    slider.oninput = e => { sliderVal.textContent = e.target.value + '%'; updateSliderBg(e.target); triggerAll(); };
    maxWidth.oninput = triggerAll;
    format.onchange = triggerAll;
    window.matchMedia('(prefers-color-scheme: dark)').onchange = () => setTimeout(() => updateSliderBg(slider), 10);

    function createCard(fd) {
        const card = document.createElement('div');
        card.className = 'image-card app-card';
        card.id = `card-${fd.id}`;
        card.innerHTML = `
            <button class="remove-btn" title="Remove">&times;</button>
            <div class="card-images">
                <div class="image-panel"><div class="panel-header"><h4>Original</h4><span class="size-badge">${fmtBytes(fd.file.size)}</span></div>
                <div class="img-wrapper checkerboard"><img id="orig-${fd.id}" src="${fd.origUrl}"></div></div>
                <div class="arrow-divider"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
                <div class="image-panel"><div class="panel-header"><h4>Compressed</h4><div class="stats-group"><span class="size-badge highlight" id="sz-${fd.id}">--</span><span class="savings-badge hidden" id="save-${fd.id}">--</span></div></div>
                <div class="img-wrapper checkerboard"><img id="comp-${fd.id}" src=""><div class="loading-overlay" id="ldr-${fd.id}"><div class="spinner"></div></div></div></div>
            </div>
            <div class="card-footer"><div class="filename">${fd.file.name}</div><button class="btn btn-primary" id="dl-${fd.id}" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button></div>`;
        cardsContainer.prepend(card);
        card.querySelector('.remove-btn').onclick = () => { cleanupUIData(fd.id); card.remove(); filesData = filesData.filter(f => f.id !== fd.id); toggleWorkspace(); };
        $(`dl-${fd.id}`).onclick = () => download(fd);
    }

    async function compress(fd) {
        if (fd.locked) return;
        fd.locked = true;
        const [ldr, img, sz, save, dl] = [`ldr-${fd.id}`, `comp-${fd.id}`, `sz-${fd.id}`, `save-${fd.id}`, `dl-${fd.id}`].map($);
        if(ldr) ldr.classList.remove('hidden');
        if(dl) dl.disabled = true;

        const w = parseInt(maxWidth.value), fType = format.value;
        const opts = { useWebWorker: true, initialQuality: slider.value / 100, alwaysKeepResolution: !w };
        if (w > 0) opts.maxWidthOrHeight = w;
        opts.fileType = fType !== 'original' ? fType : fd.file.type;

        try {
            fd.blob = await imageCompression(fd.file, opts);
            if (img.src) URL.revokeObjectURL(img.src);
            img.src = URL.createObjectURL(fd.blob);
            img.style.opacity = '0'; img.onload = () => img.style.opacity = '1';
            
            if(sz) sz.textContent = fmtBytes(fd.blob.size);
            if(save) {
                save.classList.remove('hidden');
                const p = (fd.file.size - fd.blob.size) / fd.file.size * 100;
                save.textContent = (p > 0 ? '-' : '+') + Math.abs(p).toFixed(1) + '%';
                save.style.color = p > 0 ? 'var(--success-text)' : 'var(--danger-text)';
                save.style.background = p > 0 ? 'var(--success-bg)' : 'var(--danger-bg)';
            }
            if(dl) dl.disabled = false;
        } catch (e) {
            console.error(e);
        } finally {
            fd.locked = false;
            if(ldr) ldr.classList.add('hidden');
        }
    }

    const cleanupUIData = id => {
        const orig = $(`orig-${id}`), comp = $(`comp-${id}`);
        if(orig?.src) URL.revokeObjectURL(orig.src);
        if(comp?.src) URL.revokeObjectURL(comp.src);
    };

    const download = fd => {
        if (!fd.blob) return;
        const url = URL.createObjectURL(fd.blob), a = document.createElement('a');
        const fileExt = fd.blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        a.href = url;
        a.download = `compressed-${fd.file.name.replace(/\.[^/.]+$/, "")}.${fileExt}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
});
