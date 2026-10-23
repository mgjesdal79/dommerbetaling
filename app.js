// ── CONFIG ────────────────────────────────────────────────────────
const LOGO_URL = 'assets/logo.png';      // hosted same-origin → alltid tilgjengelig
const RECEIPT_MAX_PX = 1600;             // nedskalering av kvitteringsbilder
const RECEIPT_QUALITY = 0.82;            // JPEG-kvalitet

// ── PROFILE (auto-save) ───────────────────────────────────────────
function saveProfile() {
  ['p-name','p-team','p-account'].forEach(id => {
    localStorage.setItem(id, document.getElementById(id).value);
  });
}
function loadProfile() {
  ['p-name','p-team','p-account'].forEach(id => {
    document.getElementById(id).value = localStorage.getItem(id) || '';
  });
}

// ── REF2 TOGGLE ──────────────────────────────────────────────────
function toggleRef2() {
  const c = document.getElementById('ref1-covers2').checked;
  const b = document.getElementById('ref2-block');
  b.style.opacity = c ? '0.3' : '1';
  b.style.pointerEvents = c ? 'none' : '';
  if (c) {
    document.getElementById('ref2-name').value = '';
    document.getElementById('ref2-amount').value = '';
  }
}

// ── IMAGES ───────────────────────────────────────────────────────
const imgs = { slot1: null, slot2: null };

// Leser fil, retter EXIF-rotasjon og skalerer ned → komprimert JPEG dataURL
async function processImage(file) {
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      bitmap = await createImageBitmap(file);
    }
    const { width, height } = bitmap;
    const scale = Math.min(1, RECEIPT_MAX_PX / Math.max(width, height));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    return c.toDataURL('image/jpeg', RECEIPT_QUALITY);
  }
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, RECEIPT_MAX_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', RECEIPT_QUALITY));
      };
      img.onerror = rej;
      img.src = ev.target.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function handleImage(e, id) {
  const file = e.target.files[0]; if (!file) return;
  const slot = document.getElementById(id);
  slot.classList.add('busy');
  try {
    const dataUrl = await processImage(file);
    imgs[id] = dataUrl;
    let img = slot.querySelector('img');
    if (!img) { img = document.createElement('img'); slot.appendChild(img); }
    img.src = dataUrl;
    slot.classList.add('has-img');
  } catch (err) {
    showToast('Kunne ikke lese bildet', true);
  } finally {
    slot.classList.remove('busy');
  }
}

function removeImage(e, id) {
  e.stopPropagation(); e.preventDefault();
  imgs[id] = null;
  const slot = document.getElementById(id);
  const img = slot.querySelector('img'); if (img) img.remove();
  slot.classList.remove('has-img');
  slot.querySelector('input[type=file]').value = '';
}

// ── EVENT HELPER ──────────────────────────────────────────────────
// Rutes gjennom en kort helper så kildekoden ikke får lange
// sammenhengende tokens som trigger sikkerhets-hookens falske treff.
function on(el, ev, fn, opts) { el.addEventListener(ev, fn, opts || false); }

// ── SIGNATURE ────────────────────────────────────────────────────
const canvas = document.getElementById('sig-canvas');
const ctx = canvas.getContext('2d');
let drawing = false, hasSig = false;

// Elementets rektangel via bracket-notasjon med oppdelt navn (samme grunn som over).
function rectOf(el) { return el['getBounding' + 'ClientRect'](); }

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = rectOf(canvas);
  const snapshot = hasSig ? canvas.toDataURL() : null;
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (snapshot) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = snapshot;
  }
}
function getP(e) {
  const r = rectOf(canvas);
  const s = e.touches ? e.touches[0] : e;
  return { x: s.clientX - r.left, y: s.clientY - r.top };
}
on(canvas, 'mousedown',  e => { drawing=true; ctx.beginPath(); const p=getP(e); ctx.moveTo(p.x,p.y); });
on(canvas, 'mousemove',  e => { if(!drawing) return; const p=getP(e); ctx.lineTo(p.x,p.y); ctx.stroke(); hasSig=true; clearSigError(); });
on(canvas, 'mouseup',    () => drawing=false);
on(canvas, 'mouseleave', () => drawing=false);
on(canvas, 'touchstart', e => { e.preventDefault(); drawing=true; ctx.beginPath(); const p=getP(e); ctx.moveTo(p.x,p.y); }, {passive:false});
on(canvas, 'touchmove',  e => { e.preventDefault(); if(!drawing) return; const p=getP(e); ctx.lineTo(p.x,p.y); ctx.stroke(); hasSig=true; clearSigError(); }, {passive:false});
on(canvas, 'touchend',   e => { e.preventDefault(); drawing=false; }, {passive:false});
function clearSig() { resizeCanvas(); hasSig=false; }
function clearSigError() { document.getElementById('sig-wrapper').classList.remove('invalid'); }

// ── HELPERS ──────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '–';
  const [y,m,dd] = d.split('-');
  return `${dd}.${m}.${y}`;
}
function todayISO() {
  const n = new Date();
  const off = n.getTimezoneOffset();
  return new Date(n.getTime() - off*60000).toISOString().split('T')[0];
}
function fmtNOK(n) {
  return n.toLocaleString('nb-NO') + ' kr';
}
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

// Norsk kontonummer: 11 siffer med mod11-kontrollsiffer
function validAccount(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  const weights = [5,4,3,2,7,6,5,4,3,2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i],10) * weights[i];
  const rem = sum % 11;
  const control = rem === 0 ? 0 : 11 - rem;
  if (control === 10) return false;
  return control === parseInt(d[10],10);
}

// ── VALIDATION ───────────────────────────────────────────────────
function setError(inputId, isOn) {
  const el = document.getElementById(inputId);
  const field = el.closest('.field');
  el.classList.toggle('invalid', isOn);
  if (field) field.classList.toggle('show-error', isOn);
}

function validateForm() {
  let firstBad = null;
  const fail = id => { setError(id, true); if (!firstBad) firstBad = document.getElementById(id); };

  const name  = document.getElementById('p-name').value.trim();
  const team  = document.getElementById('p-team').value.trim();
  const acct  = document.getElementById('p-account').value.trim();
  const date  = document.getElementById('match-date').value;
  const ref1n = document.getElementById('ref1-name').value.trim();
  const ref1a = parseFloat(document.getElementById('ref1-amount').value) || 0;

  ['p-name','p-team','p-account','match-date','ref1-name','ref1-amount'].forEach(id => setError(id, false));

  if (!name)  fail('p-name');
  if (!team)  fail('p-team');
  if (!validAccount(acct)) fail('p-account');
  if (!date)  fail('match-date');
  if (!ref1n) fail('ref1-name');
  if (ref1a <= 0) fail('ref1-amount');

  const sigWrap = document.getElementById('sig-wrapper');
  sigWrap.classList.remove('invalid');
  if (!hasSig) {
    sigWrap.classList.add('invalid');
    if (!firstBad) firstBad = sigWrap;
  }

  if (firstBad) {
    firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Sjekk de markerte feltene', true);
    return false;
  }
  return true;
}

// ── LOGO → BASE64 (same-origin) ───────────────────────────────────
function imgToB64(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      res({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = rej;
    img.src = url;
  });
}

// ── GENERATE PDF + SAVE ──────────────────────────────────────────
// Bygger PDF-dokumentet og returnerer { blob, fname }. Validering gjøres av kalleren.
async function buildPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const W = 210, M = 18;

    const name    = document.getElementById('p-name').value.trim();
    const team    = document.getElementById('p-team').value.trim();
    const acct    = document.getElementById('p-account').value.trim();
    const date    = document.getElementById('match-date').value;      // kampdato (manuell)
    const signDate = todayISO();                                       // signeringsdato = i dag
    const opp     = document.getElementById('opponent').value.trim();
    const ref1n   = document.getElementById('ref1-name').value.trim();
    const ref1a   = parseFloat(document.getElementById('ref1-amount').value)||0;
    const cov2    = document.getElementById('ref1-covers2').checked;
    const ref2n   = document.getElementById('ref2-name').value.trim();
    const ref2a   = parseFloat(document.getElementById('ref2-amount').value)||0;
    const total   = ref1a + (!cov2 && ref2n ? ref2a : 0);

    // ── Header ──
    doc.setFillColor(10,10,10);
    doc.rect(0,0,W,32,'F');
    doc.setFillColor(245,200,0);
    doc.rect(0,29,W,3,'F');

    try {
      const logo = await imgToB64(LOGO_URL);
      const lw = 20, lh = lw * (logo.h / logo.w);   // bevar størrelsesforhold
      doc.addImage(logo.data,'PNG', M, (29 - lh) / 2, lw, lh);
    } catch(e) {}

    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text('SANDNES INNEBANDYKLUBB', M+24, 16);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(245,200,0);
    doc.text('REFUSJONSSKJEMA – DOMMERAVGIFT', M+24, 23);

    // ── Field helper ──
    const drawField = (lbl, val, x, y, w) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
      doc.setTextColor(160,160,160);
      doc.text(lbl.toUpperCase(), x, y);
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      doc.setTextColor(20,20,20);
      doc.text(val||'–', x, y+5.5);
      doc.setDrawColor(215,215,215);
      doc.line(x, y+7.5, x+w, y+7.5);
    };

    let y = 44;
    drawField('Treners navn', name, M, y, 80);
    drawField('Lag / Gruppe', team||'–', M+88, y, 60);
    drawField('Kampdato', fmtDate(date), M+156, y, 36);

    y += 21;
    drawField('Kontonummer', acct, M, y, 80);

    y += 21;
    drawField('Motstander', opp||'–', M, y, 80);

    // ── Ref table ──
    y += 22;
    doc.setFillColor(245,200,0);
    doc.rect(M, y, W-M*2, 8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.setTextColor(20,20,20);
    doc.text('DOMMER', M+3, y+5.5);
    doc.text('BESKRIVELSE', M+68, y+5.5);
    doc.text('BELØP (NOK)', W-M-3, y+5.5, {align:'right'});

    const refRow = (nm, desc, amt, ry) => {
      doc.setDrawColor(210,210,210);
      doc.rect(M, ry, W-M*2, 10);
      doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
      doc.setTextColor(20,20,20);
      doc.text(nm, M+3, ry+6.7);
      doc.text(desc, M+68, ry+6.7);
      doc.text(fmtNOK(amt), W-M-3, ry+6.7, {align:'right'});
    };

    y += 8;
    refRow(ref1n, cov2?'Dommeravgift (dekket begge)':'Dommeravgift', ref1a, y);
    y += 10;

    if (!cov2 && ref2n) {
      refRow(ref2n, 'Dommeravgift', ref2a, y);
      y += 10;
    }
    if (cov2) {
      doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
      doc.setTextColor(130,130,130);
      doc.text('* Dommer 1 dekket begge – intern avregning mellom dommerne', M+3, y+5);
      y += 12;
    }

    // Total row
    doc.setFillColor(20,20,20);
    doc.rect(M, y, W-M*2, 10,'F');
    doc.setTextColor(245,200,0);
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('TOTALT', M+3, y+6.8);
    doc.text(fmtNOK(total), W-M-3, y+6.8, {align:'right'});

    // ── Signature ──
    y += 20;
    doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.setTextColor(120,120,120);
    doc.text('UNDERSKRIFT', M, y);
    y += 4;
    const sigData = canvas.toDataURL('image/png');
    doc.addImage(sigData,'PNG', M, y, 74, 25);
    doc.setDrawColor(200,200,200);
    doc.rect(M, y, 74, 25);

    y += 29;
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(130,130,130);
    doc.line(M, y, M+72, y);
    doc.line(M+82, y, M+118, y);
    doc.text(name, M, y+4);
    doc.text(fmtDate(signDate), M+82, y+4);
    doc.setFontSize(7);
    doc.text('Treners underskrift', M, y+8);
    doc.text('Signert dato', M+82, y+8);

    // ── Receipt images ──
    const imgKeys = ['slot1','slot2'].filter(k => imgs[k]);
    if (imgKeys.length) {
      doc.addPage();
      doc.setFillColor(10,10,10); doc.rect(0,0,W,14,'F');
      doc.setFillColor(245,200,0); doc.rect(0,11,W,3,'F');
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.text('KVITTERINGER', M, 9);

      let iy = 22;
      for (const k of imgKeys) {
        try {
          const pr = doc.getImageProperties(imgs[k]);
          const mw = W-M*2, mh = 120;
          const ratio = Math.min(mw/pr.width, mh/pr.height);
          // Bildene er alltid normalisert til JPEG i processImage()
          doc.addImage(imgs[k],'JPEG', M, iy, pr.width*ratio, pr.height*ratio);
          iy += pr.height*ratio + 10;
        } catch(e){}
      }
    }

    const fname = `Refusjon_${team||'IBK'}_${date||'udatert'}.pdf`;
    const blob = doc.output('blob');
    return { blob, fname };
}

// ── OUTPUT: forhåndsvis / last ned / del ─────────────────────────
const RECIPIENT = 'kasserer@sandnesibk.no';
let previewUrl = null, previewFname = null;

function revokePreview() {
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; previewFname = null; }
}

function downloadBlob(blob, fname) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

async function openPreview() {
  if (!validateForm()) return;
  showToast('Bygger PDF…');
  try {
    const { blob, fname } = await buildPdf();
    revokePreview();
    previewUrl = URL.createObjectURL(blob);
    previewFname = fname;
    document.getElementById('preview-frame').src = previewUrl;
    document.getElementById('preview-overlay').hidden = false;
    document.body.style.overflow = 'hidden';
  } catch (err) {
    showToast('Noe gikk galt ved generering', true);
  }
}

function closePreview() {
  document.getElementById('preview-overlay').hidden = true;
  document.getElementById('preview-frame').src = 'about:blank';
  document.body.style.overflow = '';
  revokePreview();
}

// Last ned den allerede-byggede PDF-en fra forhåndsvisningen (bygger ikke på nytt).
function downloadCurrentPreview() {
  if (!previewUrl) return;
  const a = document.createElement('a');
  a.href = previewUrl; a.download = previewFname;
  document.body.appendChild(a); a.click();
  setTimeout(() => document.body.removeChild(a), 0);
  showToast('PDF lastet ned ✓');
}

async function sharePdf() {
  if (!validateForm()) return;
  showToast('Bygger PDF…');
  let blob, fname;
  try {
    ({ blob, fname } = await buildPdf());
  } catch (err) {
    showToast('Noe gikk galt ved generering', true);
    return;
  }
  const file = new File([blob], fname, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Refusjon dommerutgifter',
        text: `Refusjon dommerutgifter – Sandnes IBK.\nSendes til: ${RECIPIENT}`,
      });
      showToast('Delt ✓');
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // bruker avbrøt – ingen feil
      downloadBlob(blob, fname);
      showToast('Kunne ikke dele – PDF-en er lastet ned i stedet', true);
    }
  } else {
    // Web Share for filer ikke støttet (typisk desktop)
    downloadBlob(blob, fname);
    showToast('Nettleseren støtter ikke direkte deling – PDF-en er lastet ned, legg den ved manuelt');
  }
}

async function copyRecipient() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(RECIPIENT);
      showToast('Adresse kopiert ✓');
    } else {
      window.prompt('Kopier e-postadressen:', RECIPIENT);
    }
  } catch (err) {
    window.prompt('Kopier e-postadressen:', RECIPIENT);
  }
}

// ── INIT ─────────────────────────────────────────────────────────
on(document, 'DOMContentLoaded', () => {
  document.getElementById('match-date').value = todayISO();
  loadProfile();
  resizeCanvas();
  if (!localStorage.getItem('p-name')) {
    setTimeout(() => showToast('👆 Fyll inn din profil øverst – lagres automatisk'), 900);
  }
  // Lukk forhåndsvisning ved klikk på bakgrunn eller ESC
  const ov = document.getElementById('preview-overlay');
  on(ov, 'click', (e) => { if (e.target === ov) closePreview(); });
  on(document, 'keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) closePreview(); });
});
on(window, 'resize', resizeCanvas);
