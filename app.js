(function () {
    'use strict';

    const MAX_DIM = 1600;
    const JPEG_QUALITY = 0.72;
    const SIZE_WARN_MB = 12;

    const form = document.getElementById('report-form');
    const status = document.getElementById('status');
    const peopleList = document.getElementById('people-list');
    const personTemplate = document.getElementById('person-template');
    const photoGrid = document.getElementById('photo-grid');
    const photoInput = document.getElementById('photo-input');
    const dropzone = document.getElementById('dropzone');

    const photos = [];
    let photoSeq = 0;
    let busy = false;

    /* ---------------- status helpers ---------------- */

    function setStatus(el, message, type) {
        el.textContent = message;
        el.className = 'status' + (type ? ' ' + type : '');
    }

    /* ---------------- people ---------------- */

    function renumberPeople() {
        peopleList.querySelectorAll('.person-card').forEach((card, i) => {
            card.querySelector('.person-title').textContent = `Person ${i + 1}`;
        });
    }

    function addPerson() {
        const card = personTemplate.content.firstElementChild.cloneNode(true);
        card.querySelector('.remove-person').addEventListener('click', () => {
            card.remove();
            renumberPeople();
        });
        peopleList.appendChild(card);
        dropPrepared();
        renumberPeople();
        card.querySelector('select').focus();
    }

    function readPerson(card) {
        const get = field => {
            const el = card.querySelector(`[data-field="${field}"]`);
            return el ? el.value.trim() : '';
        };
        return {
            role: get('role'),
            firstName: get('firstName'),
            lastName: get('lastName'),
            birthDate: get('birthDate'),
            street: get('street'),
            zip: get('zip'),
            city: get('city'),
            phone: get('phone'),
            email: get('email'),
            insurance: get('insurance'),
            note: get('note')
        };
    }

    /* ---------------- photos ---------------- */

    async function loadImage(file) {
        try {
            return await createImageBitmap(file, {imageOrientation: 'from-image'});
        } catch (_) {
            return await new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve(img);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Bild konnte nicht gelesen werden'));
                };
                img.src = url;
            });
        }
    }

    async function processPhoto(file) {
        const source = await loadImage(file);
        const scale = Math.min(1, MAX_DIM / Math.max(source.width, source.height));
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0, width, height);
        if (source.close) source.close();

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        return {
            id: ++photoSeq,
            dataUrl,
            width,
            height,
            caption: '',
            bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
        };
    }

    function renderPhotos() {
        photoGrid.textContent = '';
        photos.forEach((photo, index) => {
            const tile = document.createElement('div');
            tile.className = 'photo-tile';

            const img = document.createElement('img');
            img.src = photo.dataUrl;
            img.alt = `Foto ${index + 1}`;

            const meta = document.createElement('div');
            meta.className = 'photo-meta';

            const caption = document.createElement('input');
            caption.type = 'text';
            caption.placeholder = 'Bildunterschrift (optional)';
            caption.value = photo.caption;
            caption.addEventListener('input', () => {
                photo.caption = caption.value;
            });

            const foot = document.createElement('div');
            foot.className = 'photo-foot';
            const size = document.createElement('span');
            size.textContent = `Foto ${index + 1} · ${(photo.bytes / 1024 / 1024).toFixed(1)} MB`;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'icon-btn';
            remove.textContent = 'Entfernen';
            remove.addEventListener('click', () => {
                const at = photos.indexOf(photo);
                if (at > -1) photos.splice(at, 1);
                dropPrepared();
                renderPhotos();
            });

            foot.append(size, remove);
            meta.append(caption, foot);
            tile.append(img, meta);
            photoGrid.appendChild(tile);
        });
    }

    async function addPhotos(fileList) {
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name));
        if (!files.length) return;

        setStatus(status, `${files.length} Foto(s) werden verarbeitet…`, 'busy');
        let failed = 0;
        for (const file of files) {
            try {
                photos.push(await processPhoto(file));
            } catch (_) {
                failed++;
            }
        }
        renderPhotos();
        dropPrepared();
        if (failed) {
            setStatus(status, `${failed} Foto(s) konnten nicht gelesen werden (z. B. HEIC-Format). Bitte als JPG speichern.`, 'error');
        } else {
            setStatus(status, `${photos.length} Foto(s) hinzugefügt.`);
        }
    }

    /* ---------------- collecting & validation ---------------- */

    function collectReport() {
        const f = form.elements;
        const val = name => (f[name] ? f[name].value.trim() : '');

        const people = Array.from(peopleList.querySelectorAll('.person-card'))
            .map(readPerson)
            .filter(p => Object.keys(p).some(k => k !== 'role' && p[k]));

        return {
            damage: {
                type: val('damageType'),
                date: val('damageDate'),
                time: val('damageTime'),
                place: val('damagePlace'),
                policyNumber: val('policyNumber'),
                amount: val('damageAmount'),
                policeInformed: f.policeInformed.checked,
                policeReference: val('policeReference')
            },
            reporter: {
                firstName: val('firstName'),
                lastName: val('lastName'),
                birthDate: val('birthDate'),
                street: val('street'),
                zip: val('zip'),
                city: val('city'),
                phone: val('phone'),
                email: val('email')
            },
            people,
            courseOfEvents: val('courseOfEvents'),
            photos
        };
    }

    function validate() {
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        const required = ['damageDate', 'firstName', 'lastName', 'phone', 'courseOfEvents'];
        const missing = required.filter(name => !form.elements[name].value.trim());

        if (missing.length) {
            missing.forEach(name => form.elements[name].classList.add('invalid'));
            const first = form.elements[missing[0]];
            first.scrollIntoView({behavior: 'smooth', block: 'center'});
            first.focus({preventScroll: true});
            setStatus(status, 'Bitte füllen Sie die mit * markierten Pflichtfelder aus.', 'error');
            return false;
        }
        return true;
    }

    function buildFilename(report) {
        const clean = s => (s || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        const parts = ['Schadensmeldung', report.damage.date || new Date().toISOString().slice(0, 10),
            clean(report.reporter.lastName), clean(report.reporter.firstName)].filter(Boolean);
        return parts.join('_') + '.pdf';
    }

    async function generatePdf() {
        const report = collectReport();
        // Let the browser paint the busy state before the synchronous PDF build blocks the thread.
        await new Promise(resolve => setTimeout(resolve, 30));
        const doc = window.buildReportPdf(report);
        return {
            report,
            blob: doc.output('blob'),
            filename: buildFilename(report)
        };
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function sizeNote(blob) {
        const mb = blob.size / 1024 / 1024;
        return mb > SIZE_WARN_MB
            ? ` Hinweis: Das PDF ist ${mb.toFixed(1)} MB groß – für E-Mail eventuell zu groß.`
            : '';
    }

    async function withBusy(button, label, task) {
        if (busy) return;
        busy = true;
        const original = button.textContent;
        button.textContent = label;
        button.disabled = true;
        try {
            await task();
        } catch (error) {
            setStatus(status, 'Das PDF konnte nicht erstellt werden: ' + error.message, 'error');
        } finally {
            button.textContent = original;
            button.disabled = false;
            busy = false;
        }
    }

    /* ---------------- sending ---------------- */

    function messageText(report) {
        const name = [report.reporter.firstName, report.reporter.lastName].filter(Boolean).join(' ');
        const agent = (window.AGENT && window.AGENT.name) || '';
        const lines = ['Schadensmeldung' + (name ? ' von ' + name : '')];
        if (agent) lines.push('F\u00fcr: ' + agent);
        if (report.damage.date) {
            lines.push('Schadendatum: ' + window.formatDateDe(report.damage.date)
                + (report.damage.time ? ', ' + report.damage.time + ' Uhr' : ''));
        }
        if (report.damage.type) lines.push('Art: ' + report.damage.type);
        if (report.photos.length) lines.push('Fotos: ' + report.photos.length);
        lines.push('', 'Die vollst\u00e4ndige Meldung befindet sich im angeh\u00e4ngten PDF.');
        return lines.join('\n');
    }

    // navigator.share exists only in a secure context (HTTPS or localhost), so a page
    // opened from a file:// path or over plain http:// on the local network has no share
    // sheet at all. Name the actual cause instead of blaming the browser.
    function shareBlockedReason(file) {
        if (!window.isSecureContext) {
            return 'Zum Senden muss die Seite \u00fcber HTTPS ge\u00f6ffnet sein (\u201efile://\u201c '
                + 'oder eine http-Adresse im WLAN reichen nicht).';
        }
        if (!navigator.share || !navigator.canShare) {
            return 'Dieser Browser kennt die Teilen-Funktion nicht \u2013 am PC z. B. Firefox.';
        }
        if (!navigator.canShare({files: [file]})) {
            return 'Dieser Browser kann diese Datei nicht weitergeben.';
        }
        return '';
    }

    // The PDF for the form as it currently stands. Kept because iOS Safari drops the tap's
    // user activation at the first await: once a PDF is ready, the next tap can reach
    // navigator.share() synchronously and the share sheet opens.
    let prepared = null;

    function dropPrepared() {
        prepared = null;
    }

    async function preparePdf() {
        const {report, blob, filename} = await generatePdf();
        return {
            blob,
            filename,
            file: new File([blob], filename, {type: 'application/pdf'}),
            text: messageText(report)
        };
    }

    function fallbackToDownload(data, reason) {
        downloadBlob(data.blob, data.filename);
        setStatus(status, reason + ' Das PDF \u201e' + data.filename
            + '\u201c wurde stattdessen heruntergeladen.' + sizeNote(data.blob), 'error');
    }

    // `retryable` marks the attempt that had to build the PDF first; a refusal there is
    // usually just the spent user activation, so we ask for one more tap instead of giving up.
    async function shareReport(data, retryable) {
        const blocked = shareBlockedReason(data.file);
        if (blocked) {
            fallbackToDownload(data, blocked);
            return;
        }
        try {
            await navigator.share({files: [data.file], title: data.filename, text: data.text});
            setStatus(status, 'Gesendet.');
            dropPrepared();
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setStatus(status, 'Senden abgebrochen.');
                return;
            }
            if (retryable) {
                setStatus(status, 'Das PDF ist fertig \u2013 bitte noch einmal auf \u201eSenden\u201c tippen.', 'busy');
                return;
            }
            fallbackToDownload(data, 'Das Teilen wurde vom Ger\u00e4t abgelehnt.');
        }
    }

    /* ---------------- events ---------------- */

    document.getElementById('add-person-btn').addEventListener('click', addPerson);

    dropzone.addEventListener('click', event => {
        if (event.target !== photoInput) photoInput.click();
    });
    dropzone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            photoInput.click();
        }
    });
    photoInput.addEventListener('change', () => {
        addPhotos(photoInput.files);
        photoInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
        event.preventDefault();
        dropzone.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
        event.preventDefault();
        dropzone.classList.remove('over');
    }));
    dropzone.addEventListener('drop', event => {
        if (event.dataTransfer && event.dataTransfer.files.length) addPhotos(event.dataTransfer.files);
    });

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.addEventListener('click', () => {
        if (!validate()) return;
        withBusy(downloadBtn, 'PDF wird erstellt…', async () => {
            const {blob, filename} = await generatePdf();
            downloadBlob(blob, filename);
            setStatus(status, `PDF „${filename}" wurde heruntergeladen.${sizeNote(blob)}`);
        });
    });

    const sendBtn = document.getElementById('send-btn');
    sendBtn.addEventListener('click', () => {
        if (!validate()) return;
        if (prepared) {
            // No await before this call, so the tap's activation still counts.
            shareReport(prepared, false);
            return;
        }
        withBusy(sendBtn, 'PDF wird erstellt\u2026', async () => {
            prepared = await preparePdf();
            await shareReport(prepared, true);
        });
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        if (!confirm('Alle Eingaben und Fotos verwerfen?')) return;
        form.reset();
        peopleList.textContent = '';
        photos.length = 0;
        dropPrepared();
        renderPhotos();
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        setStatus(status, 'Formular zurückgesetzt.');
        window.scrollTo({top: 0, behavior: 'smooth'});
    });

    form.addEventListener('input', event => {
        event.target.classList.remove('invalid');
        dropPrepared();
    });

    form.addEventListener('change', dropPrepared);

    form.addEventListener('submit', event => event.preventDefault());
})();
