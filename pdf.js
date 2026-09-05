(function () {
    'use strict';

    const PAGE_W = 210;
    const PAGE_H = 297;
    const MARGIN = 18;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    const LABEL_W = 46;
    const FOOTER_H = 14;
    const PHOTO_MAX_H = 95;

    const COLOR_TEXT = [17, 24, 39];
    const COLOR_MUTED = [107, 114, 128];
    const COLOR_LINE = [226, 232, 240];
    const COLOR_ACCENT = [37, 99, 235];
    const COLOR_BAND = [239, 244, 255];

    const lineHeight = pt => pt * 0.3528 * 1.28;

    function formatDate(iso) {
        if (!iso) return '';
        const parts = iso.split('-');
        if (parts.length !== 3) return iso;
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function timestamp() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} um ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
    }

    function createWriter(doc) {
        let y = MARGIN;

        function space(needed) {
            if (y + needed > PAGE_H - FOOTER_H) {
                doc.addPage();
                y = MARGIN;
                return true;
            }
            return false;
        }

        return {
            get y() {
                return y;
            },
            set y(v) {
                y = v;
            },
            space,

            title(text, subtitle) {
                doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...COLOR_TEXT);
                doc.text(text, MARGIN, y + 7);
                y += 11;
                doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...COLOR_MUTED);
                doc.text(subtitle, MARGIN, y + 3);
                y += 10;
                doc.setDrawColor(...COLOR_ACCENT).setLineWidth(0.8);
                doc.line(MARGIN, y, PAGE_W - MARGIN, y);
                y += 8;
            },

            section(text) {
                space(18);
                doc.setFillColor(...COLOR_BAND);
                doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
                doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...COLOR_ACCENT);
                doc.text(text, MARGIN + 3, y + 5.6);
                y += 12;
            },

            row(label, value) {
                if (value === undefined || value === null || String(value).trim() === '') return;
                const text = String(value).trim();
                const valueW = CONTENT_W - LABEL_W;
                doc.setFont('helvetica', 'normal').setFontSize(10);
                const lines = doc.splitTextToSize(text, valueW);
                const blockH = Math.max(lines.length * lineHeight(10), 5) + 3.5;

                space(blockH);

                doc.setTextColor(...COLOR_MUTED);
                doc.text(label, MARGIN, y + 3.4);
                doc.setTextColor(...COLOR_TEXT);
                doc.text(lines, MARGIN + LABEL_W, y + 3.4);

                y += blockH;
                doc.setDrawColor(...COLOR_LINE).setLineWidth(0.2);
                doc.line(MARGIN, y - 1.5, PAGE_W - MARGIN, y - 1.5);
            },

            subheading(text) {
                space(12);
                doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...COLOR_TEXT);
                doc.text(text, MARGIN, y + 3.4);
                y += 7;
            },

            paragraph(text) {
                doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...COLOR_TEXT);
                const lines = doc.splitTextToSize(String(text), CONTENT_W);
                const lh = lineHeight(10.5);
                lines.forEach(line => {
                    space(lh);
                    doc.text(line, MARGIN, y + 3.4);
                    y += lh;
                });
                y += 3;
            },

            gap(mm) {
                y += mm;
            }
        };
    }

    function drawPhoto(doc, w, photo, index) {
        const ratio = photo.height / photo.width;
        let width = CONTENT_W;
        let height = width * ratio;
        if (height > PHOTO_MAX_H) {
            height = PHOTO_MAX_H;
            width = height / ratio;
        }

        const captionH = photo.caption ? 6 : 0;
        const blockH = height + captionH + 10;
        if (w.y + blockH > PAGE_H - FOOTER_H) {
            doc.addPage();
            w.y = MARGIN;
        }

        const x = MARGIN + (CONTENT_W - width) / 2;

        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COLOR_MUTED);
        doc.text(`Foto ${index}`, MARGIN, w.y + 3);
        w.y += 5;

        doc.addImage(photo.dataUrl, 'JPEG', x, w.y, width, height, undefined, 'FAST');
        doc.setDrawColor(...COLOR_LINE).setLineWidth(0.2);
        doc.rect(x, w.y, width, height);
        w.y += height + 3;

        if (photo.caption) {
            doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COLOR_TEXT);
            doc.text(doc.splitTextToSize(photo.caption, CONTENT_W)[0], MARGIN, w.y + 3);
            w.y += captionH;
        }
        w.y += 6;
    }

    function addFooters(doc, reporterName) {
        const total = doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setDrawColor(...COLOR_LINE).setLineWidth(0.2);
            doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
            doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COLOR_MUTED);
            const left = reporterName ? `Schadensmeldung – ${reporterName}` : 'Schadensmeldung';
            doc.text(left, MARGIN, PAGE_H - 7.5);
            doc.text(`Seite ${i} von ${total}`, PAGE_W - MARGIN, PAGE_H - 7.5, {align: 'right'});
        }
    }

    function buildReportPdf(report) {
        const doc = new window.jspdf.jsPDF({unit: 'mm', format: 'a4', compress: true});
        const w = createWriter(doc);
        const r = report.reporter;
        const reporterName = [r.firstName, r.lastName].filter(Boolean).join(' ');

        w.title('Schadensmeldung', `Erstellt am ${timestamp()}`);

        w.section('Angaben zum Schaden');
        const d = report.damage;
        w.row('Art des Schadens', d.type);
        w.row('Datum', formatDate(d.date) + (d.time ? `, ${d.time} Uhr` : ''));
        w.row('Ort', d.place);
        w.row('Versicherungsnr.', d.policyNumber);
        w.row('Schadenhöhe', d.amount);
        w.row('Polizei', d.policeInformed ? 'Ja, wurde verständigt' : '');
        w.row('Aktenzeichen', d.policeReference);
        w.gap(6);

        w.section('Meldende Person');
        w.row('Name', reporterName);
        w.row('Geburtsdatum', formatDate(r.birthDate));
        w.row('Adresse', [r.street, [r.zip, r.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
        w.row('Telefon', r.phone);
        w.row('E-Mail', r.email);
        w.gap(6);

        if (report.people.length) {
            w.section('Weitere beteiligte Personen');
            report.people.forEach((p, i) => {
                const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
                w.subheading(`${i + 1}. ${p.role}${name ? ' – ' + name : ''}`);
                w.row('Geburtsdatum', formatDate(p.birthDate));
                w.row('Adresse', [p.street, [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
                w.row('Telefon', p.phone);
                w.row('E-Mail', p.email);
                w.row('Versicherung', p.insurance);
                w.row('Anmerkung', p.note);
                w.gap(5);
            });
            w.gap(1);
        }

        w.section('Unfallhergang');
        w.paragraph(report.courseOfEvents);
        w.gap(4);

        if (report.photos.length) {
            w.section(`Fotos (${report.photos.length})`);
            report.photos.forEach((photo, i) => drawPhoto(doc, w, photo, i + 1));
        }

        addFooters(doc, reporterName);
        return doc;
    }

    window.buildReportPdf = buildReportPdf;
    window.formatDateDe = formatDate;
})();
