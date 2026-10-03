// 手写单词照片 OCR（Tesseract.js，从 CDN 懒加载，首次使用需联网）
const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('脚本加载失败'));
    document.head.appendChild(s);
  });
}

let workerPromise = null;

async function getWorker() {
  if (!window.Tesseract) {
    await loadScript(CDN);
  }
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('eng').catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use']);

// 识别图片中的英文单词，返回候选词数组
export async function recognizeWords(imageLike, onProgress) {
  const worker = await getWorker();
  const result = await worker.recognize(imageLike, {}, { logger: (m) => { if (onProgress && m.progress !== undefined) onProgress(m.progress); } });
  const text = result.data.text || '';
  const raw = text.match(/[A-Za-z][A-Za-z'-]{1,}/g) || [];
  const seen = new Set();
  const words = [];
  for (const w of raw) {
    const lower = w.toLowerCase();
    if (seen.has(lower) || STOP.has(lower)) continue;
    seen.add(lower);
    words.push(lower);
  }
  return words;
}

export function speak(word) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
