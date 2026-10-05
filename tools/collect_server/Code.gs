/**
 * 36 shells Collection：学習用写真の受け取り（Google Apps Script のウェブアプリ）
 *
 * スタッフのスマホ（サイトの「学習用の写真を集める」画面）から送られた写真を、
 * この Google アカウントのドライブの「36shells-学習用写真」フォルダに、貝の番号ごとに保存する。
 * パソコンの tools/fetch_collected.py が、ここから写真を受け取って学習に使う。
 *
 * 設定：下の STAFF_KEY を、スタッフ用QRコードに入れる合鍵と同じにする（他の人が送れないように）。
 * デプロイ：デプロイ → 新しいデプロイ → 種類「ウェブアプリ」→ 実行ユーザー「自分」→ アクセス「全員」
 */
const STAFF_KEY = 'ここに合鍵';
const ROOT_NAME = '36shells-学習用写真';

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function root_() {
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
}

// 写真を受け取る
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.key !== STAFF_KEY) return out_({ ok: false, error: 'key' });
    const label = String(req.label || '');
    if (!/^(other|[1-9]|[12][0-9]|3[0-6])$/.test(label)) return out_({ ok: false, error: 'label' });
    const dir = label === 'other' ? 'other' : ('0' + label).slice(-2);
    const group = String(req.group || 'kai').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 60) || 'kai';
    const name = String(req.name || Date.now()).replace(/[^0-9A-Za-z_.-]/g, '').slice(0, 60) + '.jpg';
    const folder = folder_(folder_(root_(), dir), group);
    const existing = folder.getFilesByName(name);
    if (existing.hasNext()) return out_({ ok: true, id: existing.next().getId(), dup: true }); // 送り直しで重ならない
    const blob = Utilities.newBlob(Utilities.base64Decode(req.data), 'image/jpeg', name);
    const file = folder.createFile(blob);
    file.setDescription(JSON.stringify({ label: label, group: group, t: req.t || '', note: req.note || '' }));
    return out_({ ok: true, id: file.getId() });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

// パソコンからの受け取り：?key=…&action=list（一覧）／?key=…&action=file&id=…（写真）
function doGet(e) {
  const p = e.parameter || {};
  if (p.key !== STAFF_KEY) return out_({ ok: false, error: 'key' });
  if (p.action === 'file') {
    const f = DriveApp.getFileById(p.id);
    return out_({ ok: true, data: Utilities.base64Encode(f.getBlob().getBytes()) });
  }
  const files = [];
  const walk = (folder, path) => {
    const fs = folder.getFiles();
    while (fs.hasNext()) {
      const f = fs.next();
      files.push({ id: f.getId(), path: path.concat(f.getName()).join('/'), size: f.getSize(), created: f.getDateCreated().toISOString() });
    }
    const ds = folder.getFolders();
    while (ds.hasNext()) { const d = ds.next(); walk(d, path.concat(d.getName())); }
  };
  walk(root_(), []);
  return out_({ ok: true, files: files });
}
