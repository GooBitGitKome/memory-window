import { isDemo } from '../services/api';
import { useEffect, useRef, useState } from 'react';

export type MediaKind = 'television' | 'radio' | 'photos';
type Item = { name: string; url: string };
const constraints = {
  television: { title: '思い出のテレビ', accept: 'video/mp4,video/webm', maximum: 150 * 1024 * 1024 },
  radio: { title: '思い出のラジオ', accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4', maximum: 50 * 1024 * 1024 },
  photos: { title: '思い出の写真', accept: 'image/jpeg,image/png,image/webp', maximum: 15 * 1024 * 1024 },
};
export function MemoryMedia({ kind, onClose }: { kind: MediaKind; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [slideshow, setSlideshow] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLMediaElement | null>(null);
  const urls = useRef<string[]>([]);
  const choice = constraints[kind];
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    const pause = () => { player.current?.pause(); setSlideshow(false); };
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('memory-window:suspend', pause);
    return () => {
      player.current?.pause();
      urls.current.forEach(URL.revokeObjectURL);
      document.removeEventListener('visibilitychange', pause);
      window.removeEventListener('memory-window:suspend', pause);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!slideshow || items.length < 2) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % items.length), 8000);
    return () => clearInterval(timer);
  }, [slideshow, items.length]);
  const select = (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    const allowed = choice.accept.split(',');
    if (selected.length > 30 || selected.some(file => !allowed.includes(file.type) || file.size > choice.maximum || file.size === 0)) {
      setError('対応する形式のファイルを選んでください。写真は15MB、音声は50MB、動画は150MBまで、最大30件です。'); return;
    }
    player.current?.pause(); setSlideshow(false);
    urls.current.forEach(URL.revokeObjectURL);
    const next = selected.map(file => ({ name: file.name, url: URL.createObjectURL(file) }));
    urls.current = next.map(item => item.url);
    setItems(next); setIndex(0); setError('');
  };
  const samples = () => {
    player.current?.pause(); setSlideshow(false); urls.current.forEach(URL.revokeObjectURL); urls.current=[];
    const names = kind === 'television' ? ['quiet-train.webm'] : kind === 'radio' ? ['quiet-chime.wav'] : ['spring.svg','summer.svg','winter.svg'];
    setItems(names.map(name => ({name, url: `/samples/${name}`}))); setIndex(0); setError('');
  };
  const current = items[index];
  return <dialog ref={dialog} aria-labelledby="media-title" onCancel={onClose} className="media-dialog">
    <header className="panel-header"><h2 id="media-title">{choice.title}</h2><button onClick={onClose}>閉じる</button></header>
    <p>ご自身が利用できるファイルを選んでください。外部への送信や保存は行いません。</p>
    <label className="file-label">{kind === 'photos' ? '写真を選ぶ' : '音声・動画を選ぶ'}<input type="file" accept={choice.accept} multiple={kind === 'photos'} onChange={e => { select(e.target.files); e.target.value = ''; }}/></label>
    {isDemo && <button onClick={samples}>オリジナルのデモ素材を表示</button>}
    {error && <p role="alert">{error}</p>}
    {current && <section aria-label="再生内容">
      {kind === 'television' && <video key={current.url} ref={node => { player.current = node; }} src={current.url} controls playsInline onError={() => setError('この端末では再生できませんでした。別のファイルを選んでください。')}/>}
      {kind === 'radio' && <audio key={current.url} ref={node => { player.current = node; }} src={current.url} controls onError={() => setError('この端末では再生できませんでした。別のファイルを選んでください。')}/>}
      {kind === 'photos' && <img src={current.url} alt={`選択した写真 ${index + 1}`} onError={() => setError('写真を表示できませんでした。')}/>}
      <p>{current.name}</p>
      {kind === 'photos' && items.length > 1 && <nav aria-label="写真の操作"><button onClick={() => { setSlideshow(false); setIndex(i => (i - 1 + items.length) % items.length); }}>前の写真</button><button onClick={() => setSlideshow(!slideshow)}>{slideshow ? '自動表示を止める' : 'ゆっくり自動表示'}</button><button onClick={() => { setSlideshow(false); setIndex(i => (i + 1) % items.length); }}>次の写真</button></nav>}
    </section>}
  </dialog>;
}
