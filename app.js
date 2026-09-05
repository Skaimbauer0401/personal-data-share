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
    const shareDialog = document.getElementById('share-dialog');
    const shareStatus = document.getElementById('share-status');
    const recipientEmail = document.getElementById('recipient-email');
    const recipientPhone = document.getElementById('recipient-phone');

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

    /* ---------------- sharing ---------------- */

    function messageText(report) {
        const name = [report.reporter.firstName, report.reporter.lastName].filter(Boolean).join(' ');
        const lines = ['Schadensmeldung' + (name ? ' von ' + name : '')];
        if (report.damage.date) {
            lines.push('Schadendatum: ' + window.formatDateDe(report.damage.date)
                + (report.damage.time ? ', ' + report.damage.time + ' Uhr' : ''));
        }
        if (report.damage.type) lines.push('Art: ' + report.damage.type);
        if (report.photos.length) lines.push('Fotos: ' + report.photos.length);
        lines.push('', 'Die vollständige Meldung befindet sich im PDF im Anhang.');
        return lines.join('\n');
    }

    function canShareFiles(file) {
        try {
            return Boolean(navigator.canShare && navigator.canShare({files: [file]}));
        } catch (_) {
            return false;
        }
    }

    // Probed with a dummy PDF so the answer is available synchronously: the dialog needs it
    // before a report exists, and the click handler needs it before the PDF build starts.
    function supportsFileShare() {
        try {
            return canShareFiles(new File([new Blob(['x'])], 'test.pdf', {type: 'application/pdf'}));
        } catch (_) {
            return false;
        }
    }

    function phoneDigits(value) {
        return (value || '').replace(/[^\d]/g, '');
    }

    function setChannelsBusy(on) {
        shareDialog.querySelectorAll('.channel').forEach(button => {
            if (on) {
                button.dataset.wasDisabled = button.disabled ? '1' : '';
                button.disabled = true;
            } else {
                button.disabled = button.dataset.wasDisabled === '1';
            }
        });
    }

    function setShareStatusLink(message, url, linkText) {
        setStatus(shareStatus, message + ' ');
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = linkText;
        shareStatus.appendChild(link);
    }

    // A popup has to be claimed inside the click that started the flow: building the PDF
    // outlasts the transient user activation (Safari drops it at the first await), so a
    // window.open() afterwards is silently refused. Reserve a blank tab up front instead
    // and point it at the real URL once the PDF is ready.
    function reserveTab() {
        try {
            const tab = window.open('', '_blank');
            if (tab) tab.opener = null;
            return tab;
        } catch (_) {
            return null;
        }
    }

    function openExternal(tab, url, linkText, message) {
        if (tab && !tab.closed) {
            tab.location.replace(url);
        } else if (!window.open(url, '_blank', 'noopener')) {
            // Popup blocked and no reserved tab left: give the user something to tap.
            setShareStatusLink(message, url, linkText);
            return;
        }
        setStatus(shareStatus, message);
    }

    // Returns false when the browser refuses the share sheet \u2014 iOS drops the tap's user
    // activation while the PDF is built, and some browsers reject large files or lack the
    // API entirely \u2014 so the caller can fall back to a download. A real cancel still throws.
    async function shareFile(file, filename, text) {
        try {
            await navigator.share({files: [file], title: filename, text});
            return true;
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            return false;
        }
    }

    async function handleChannel(channel) {
        if (busy) return;
        busy = true;
        setChannelsBusy(true);
        setStatus(shareStatus, 'PDF wird erstellt\u2026', 'busy');

        // Only reserve a tab for the route we will actually take, otherwise the native
        // share sheet would leave a stray blank tab behind on mobile.
        const usesLink = channel === 'whatsapp' || channel === 'signal';
        const tab = usesLink && !supportsFileShare() ? reserveTab() : null;
        let tabUsed = false;

        try {
            const {report, blob, filename} = await generatePdf();
            const file = new File([blob], filename, {type: 'application/pdf'});
            const text = messageText(report);
            const digits = phoneDigits(recipientPhone.value);

            if (channel === 'share') {
                if (await shareFile(file, filename, text)) {
                    setStatus(shareStatus, 'Geteilt.');
                } else {
                    downloadBlob(blob, filename);
                    setStatus(shareStatus, `PDF \u201e${filename}\u201c wurde heruntergeladen. Bitte manuell anh\u00e4ngen.${sizeNote(blob)}`);
                }
                return;
            }

            // Native share attaches the real file, so prefer it on devices that support it.
            if (channel !== 'email' && canShareFiles(file) && await shareFile(file, filename, text)) {
                setStatus(shareStatus, 'Geteilt.');
                return;
            }

            downloadBlob(blob, filename);
            // Navigating to mailto: or pointing the tab at the chat in the same tick can
            // cancel the blob download in Chrome, so let it commit first.
            await new Promise(resolve => setTimeout(resolve, 600));

            if (channel === 'email') {
                const subject = 'Schadensmeldung' + (report.damage.date ? ' vom ' + window.formatDateDe(report.damage.date) : '');
                // Keep "@" literal: some desktop mail clients choke on a percent-encoded address.
                const address = encodeURIComponent(recipientEmail.value.trim().replace(/\s+/g, '')).replace(/%40/g, '@');
                window.location.href = `mailto:${address}`
                    + `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
                setStatus(shareStatus, `Text vorbereitet. Das PDF \u201e${filename}\u201c liegt in Ihren Downloads \u2013 bitte in der E-Mail anh\u00e4ngen.${sizeNote(blob)}`);
            } else if (channel === 'whatsapp') {
                const url = (digits ? `https://wa.me/${digits}?text=` : 'https://wa.me/?text=') + encodeURIComponent(text);
                tabUsed = true;
                openExternal(tab, url, 'WhatsApp \u00f6ffnen',
                    `Text vorbereitet. Das PDF \u201e${filename}\u201c liegt in Ihren Downloads \u2013 bitte im Chat als Datei anh\u00e4ngen.`);
            } else if (channel === 'signal') {
                const note = `Text vorbereitet. Das PDF \u201e${filename}\u201c liegt in Ihren Downloads \u2013 bitte im Chat als Datei anh\u00e4ngen.`;
                if (digits) {
                    tabUsed = true;
                    openExternal(tab, `https://signal.me/#p/+${digits}`, 'Signal \u00f6ffnen', note);
                } else {
                    setStatus(shareStatus, note + ' Ohne Telefonnummer kann Signal nicht direkt ge\u00f6ffnet werden.');
                }
            }
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setStatus(shareStatus, 'Senden abgebrochen.', 'busy');
            } else {
                setStatus(shareStatus, 'Fehler beim Senden: ' + (error ? error.message : 'unbekannt'), 'error');
            }
        } finally {
            if (tab && !tabUsed && !tab.closed) tab.close();
            setChannelsBusy(false);
            busy = false;
        }
    }

    function openShareDialog() {
        if (!validate()) return;
        const agent = window.AGENT || {};
        if (!recipientEmail.value) recipientEmail.value = agent.email || '';
        if (!recipientPhone.value) recipientPhone.value = agent.phone || '';

        const supported = supportsFileShare();
        const shareButton = document.getElementById('channel-share');
        shareButton.disabled = !supported;
        document.getElementById('channel-share-note').textContent = supported
            ? 'PDF wird angeh\u00e4ngt \u2013 Sie w\u00e4hlen die App'
            : 'Von diesem Browser nicht unterst\u00fctzt';

        setStatus(shareStatus, supported
            ? '\u201eTeilen\u201c \u00f6ffnet die App-Auswahl Ihres Ger\u00e4ts mit dem PDF im Anhang.'
            : 'Dieser Browser kann keine Datei weitergeben \u2013 bitte das PDF herunterladen und selbst anh\u00e4ngen.',
            'busy');
        shareDialog.showModal();
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

    document.getElementById('send-btn').addEventListener('click', openShareDialog);

    shareDialog.querySelectorAll('.channel').forEach(button => {
        button.addEventListener('click', () => handleChannel(button.dataset.channel));
    });

    // The dialog form is method="dialog", so Enter in a recipient field would submit it
    // and close the dialog before anything was sent.
    shareDialog.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        if (!confirm('Alle Eingaben und Fotos verwerfen?')) return;
        form.reset();
        peopleList.textContent = '';
        photos.length = 0;
        renderPhotos();
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        setStatus(status, 'Formular zurückgesetzt.');
        window.scrollTo({top: 0, behavior: 'smooth'});
    });

    form.addEventListener('input', event => {
        event.target.classList.remove('invalid');
    });

    form.addEventListener('submit', event => event.preventDefault());
})();
