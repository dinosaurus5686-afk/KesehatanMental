// Uji rumus psikometri yang dipakai menu Asesmen admin (Cronbach's alpha & r tabel).
// Basis data sementara khusus file uji ini (menghindari bentrok dengan uji lain yang berjalan paralel)
{ const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panjalu-t-'));
  Object.assign(process.env, { MC_DATA_DIR: dir, MC_DB_FILE: path.join(dir, 'panjalu.db'), MC_AUDIT_FILE: path.join(dir, 'audit.db'), MC_DATA_KEY: 'a'.repeat(64), MC_JWT_SECRET: 'b'.repeat(64) });
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true })); }
const test = require('node:test');
const assert = require('node:assert/strict');
const { alpha, rTable } = require('../server/routes/psikometri');

test("Cronbach's alpha: butir identik = 1, contoh buku teks, data kurang = null", () => {
  assert.equal(alpha([[1, 1], [2, 2], [3, 3], [4, 4]]), 1);
  // 5 responden × 3 butir (hitungan manual: Σvar butir = 1,3 + 1,0 + 1,3 = 3,6; var total = 9,2 → α = 1,5 × (1 − 3,6/9,2) ≈ 0,9130)
  const a = alpha([[3, 4, 3], [2, 2, 3], [4, 4, 4], [1, 2, 1], [3, 3, 2]]);
  assert.ok(Math.abs(a - 0.9130) < 0.001, `alpha = ${a}`);
  assert.equal(alpha([[1, 2], [2, 1]]), null);
});

test('r tabel (α = 0,05 dua sisi) sesuai tabel standar', () => {
  assert.ok(Math.abs(rTable(30) - 0.361) < 0.002, `n=30 → ${rTable(30)}`);
  assert.ok(Math.abs(rTable(100) - 0.197) < 0.002, `n=100 → ${rTable(100)}`);
  assert.ok(Math.abs(rTable(10) - 0.632) < 0.01, `n=10 → ${rTable(10)}`);
});
