// Uji pengaturan instrumen (menu Psikometrik): butir nonaktif tidak ditanyakan, skor dimensi disetarakan (prorata),
// butir penanda keselamatan terkunci, dan norma kuantitatif tervalidasi serta dipakai skoring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panjalu-instr-'));
Object.assign(process.env, { MC_DATA_DIR: dir, MC_DB_FILE: path.join(dir, 'panjalu.db'), MC_AUDIT_FILE: path.join(dir, 'audit.db'), MC_DATA_KEY: 'a'.repeat(64), MC_JWT_SECRET: 'b'.repeat(64) });
const instrument = require('../server/instrument');
const { ITEMS, NORMS } = require('../server/reference');
const { scoreAssessment, validateAnswers } = require('../server/scoring');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const actor = { nama: 'Admin Uji' };
const answers = (fn) => ({ A: Object.fromEntries(ITEMS.map((it) => [it.no, fn(it)])), persetujuan: { a: true, b: true, c: true } });

test('butir nonaktif: tidak wajib dijawab & skor dimensi disetarakan', () => {
  assert.ok(instrument.setItemActive(3, false, actor).ok);
  const raw = answers((it) => (it.arah === '+' ? 'S' : 'TS')); delete raw.A[3];
  assert.ok(validateAnswers(raw).data, 'butir 3 boleh kosong');
  const h = scoreAssessment(raw);
  assert.equal(h.dimensi.find((d) => d.kode === 'V1').skor, 12); // 3 butir × skor 3 = 9, disetarakan ke 4 butir = 12
  assert.deepEqual(h.butir_nonaktif, [3]);
  instrument.setItemActive(3, true, actor);
  assert.match(validateAnswers(raw).error, /butir: 3/);
});

test('butir penanda keselamatan terkunci & minimal 2 butir aktif per dimensi', () => {
  assert.match(instrument.setItemActive(28, false, actor).error, /tidak bisa dinonaktifkan/);
  assert.ok(instrument.setItemActive(1, false, actor).ok);
  assert.ok(instrument.setItemActive(2, false, actor).ok);
  assert.match(instrument.setItemActive(3, false, actor).error, /Minimal 2 butir/);
  instrument.setItemActive(1, true, actor); instrument.setItemActive(2, true, actor);
  assert.equal(instrument.disabledItems().length, 0);
});

test('norma kuantitatif: validasi urutan & dipakai skoring, bisa dikembalikan ke bawaan', () => {
  assert.match(instrument.saveInterpretation({ norms: { dimensi: { batas: [[12, 'Kuat', 'a'], [14, 'Rentan', 'b'], [4, 'Lemah', 'c']] } } }, actor).error, /berurutan/);
  assert.ok(instrument.saveInterpretation({ norms: { dimensi: { batas: [[12, 'Kuat', 'Terpenuhi'], [8, 'Rentan', 'Mulai melemah'], [4, 'Lemah', 'Kurang']] } } }, actor).ok);
  assert.equal(NORMS.dimensi.batas[0][0], 12);
  const h = scoreAssessment(answers((it) => (it.arah === '+' ? 'S' : 'TS'))); // tiap dimensi = 12
  assert.equal(h.dimensi.find((d) => d.kode === 'V1').kategori, 'Kuat');
  instrument.saveInterpretation({ reset: ['norms'] }, actor);
  assert.equal(NORMS.dimensi.batas[0][0], 13);
  assert.ok(instrument.view().riwayat.length >= 3, 'perubahan tercatat di riwayat');
});
