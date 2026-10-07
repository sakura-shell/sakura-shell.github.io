// 撮影枠つきのカメラ画面。カメラが使えないときは写真の選択に切り替える
// 戻り値: Promise<HTMLCanvasElement | null>（やめたときは null）

import { h, ic } from '../ui.js';
import { fileToCanvas, pickImageFile, drawScaled } from './image.js';

const HINTS = {
  box: { title: '箱の四すみまで枠に入れて撮ってください', one: null },
  shell: { title: '貝を1つ、枠の中に大きく写してください', one: null },
};

export function openCamera({ mode = 'box', maxSide = 1600 } = {}) {
  return new Promise((resolve) => {
    let stream = null;
    let done = false;
    const hint = HINTS[mode];

    const video = h('video', { playsinline: true, muted: true, autoplay: true });
    video.muted = true;
    // 枠の名前は frame-box／frame-shell（収集箱のマス目の .box と重ならないように）
    const frame = h('div', { class: `frame frame-${mode}` }, hint.one ? h('span', { class: 'one-mark' }, hint.one) : null);
    const view = h('div', { class: 'view' }, video, frame, h('p', { class: 'hint' }, hint.title));
    const shutter = h('button', { class: 'shutter', type: 'button', 'aria-label': '撮影する', disabled: true });
    const cancel = h('button', { class: 'ctl', type: 'button' }, ic('close'), 'やめる');
    const pick = h('button', { class: 'ctl', type: 'button', style: { justifySelf: 'end' } }, ic('image'), '写真を選ぶ');
    const root = h('div', { class: 'camera', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'カメラ' },
      view, h('div', { class: 'controls' }, cancel, shutter, pick));

    const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
    const finish = (result) => {
      if (done) return;
      done = true;
      stop();
      root.remove();
      window.removeEventListener('hashchange', onNav);
      document.removeEventListener('visibilitychange', onVis);
      resolve(result);
    };
    const onNav = () => finish(null);
    const onVis = () => { if (document.hidden) stop(); else if (!done && !stream && !root.querySelector('.msg')) start(); };

    const fromFile = async (capture) => {
      const file = await pickImageFile({ capture });
      if (!file) return;
      try {
        finish(await fileToCanvas(file, maxSide));
      } catch (e) {
        showMessage(e.message || 'この写真は読み込めませんでした。');
      }
    };

    const showMessage = (text) => {
      stop();
      shutter.disabled = true;
      shutter.style.visibility = 'hidden';
      frame.hidden = true;
      view.querySelector('.msg')?.remove();
      view.append(h('div', { class: 'msg' },
        h('div', { class: 'card stack' },
          h('p', null, text),
          h('button', { class: 'btn block', type: 'button', onclick: () => fromFile(true) }, ic('camera'), 'カメラアプリで撮る'),
          h('button', { class: 'btn block secondary', type: 'button', onclick: () => fromFile(false) }, ic('image'), '写真を選ぶ'),
          h('button', { class: 'btn block ghost', type: 'button', onclick: () => finish(null) }, 'やめる'))));
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        showMessage('このブラウザでは、この画面からカメラを使えません。カメラアプリで撮るか、写真を選んでください。');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (done) { stop(); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        shutter.disabled = false;
      } catch (e) {
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        const missing = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError';
        showMessage(denied
          ? 'カメラの使用が許可されていません。ブラウザの設定で許可するか、写真を選んでください。'
          : missing ? 'カメラが見つかりませんでした。写真を選んでください。'
            : 'カメラを起動できませんでした。カメラアプリで撮るか、写真を選んでください。');
      }
    }

    shutter.addEventListener('click', () => {
      if (!video.videoWidth) return;
      finish(drawScaled(video, video.videoWidth, video.videoHeight, maxSide));
    });
    cancel.addEventListener('click', () => finish(null));
    pick.addEventListener('click', () => fromFile(false));
    window.addEventListener('hashchange', onNav);
    document.addEventListener('visibilitychange', onVis);
    document.body.append(root);
    start();
  });
}
