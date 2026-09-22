import './style.css';
import { MIN_SPREAD_METERS, ROUNDS, type LonLat } from './config';
import { formatDistance, haversine, pickSpread, score } from './geo';
import { GuessMap } from './map';
import { fetchZonePictures, viewerLink, type Picture } from './panoramax';
import { ZoomedViewer } from './viewer';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  hud: $('hud'),
  hudRound: $('hud-round'),
  hudRounds: $('hud-rounds'),
  hudScore: $('hud-score'),
  credits: $('credits'),
  mapPanel: $('map-panel'),
  mapToggle: $<HTMLButtonElement>('map-toggle'),
  resultBar: $('result-bar'),
  resultText: $('result-text'),
  resultLink: $<HTMLAnchorElement>('result-link'),
  guessBtn: $<HTMLButtonElement>('guess-btn'),
  nextBtn: $<HTMLButtonElement>('next-btn'),
  screen: $('screen'),
  screenText: $('screen-text'),
  screenExtra: $('screen-extra'),
  startBtn: $<HTMLButtonElement>('start-btn'),
};

const BEST_KEY = 'descartesguessr.best';
const readBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeBest = (v: number) => {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* stockage indisponible : tant pis */
  }
};

const viewer = new ZoomedViewer($('viewer'));
const guessMap = new GuessMap($('map'));

interface RoundResult {
  pic: Picture;
  guess: LonLat;
  distance: number;
  points: number;
}

let pool: Picture[] | null = null;
let queue: Picture[] = [];
let used = new Set<string>();
let results: RoundResult[] = [];
let current: Picture | null = null;
let guess: LonLat | null = null;
let totalRounds = ROUNDS;

guessMap.onGuess = (coords) => {
  guess = coords;
  ui.guessBtn.disabled = false;
  ui.guessBtn.textContent = 'Valider';
};

function showScreen(html: string, extra: string, button: string): void {
  ui.screenText.innerHTML = html;
  ui.screenExtra.innerHTML = extra;
  ui.startBtn.textContent = button;
  ui.startBtn.disabled = false;
  ui.screen.hidden = false;
}

function setPanelMode(mode: 'guess' | 'result' | 'summary'): void {
  ui.mapPanel.classList.toggle('expanded', mode !== 'guess');
  ui.mapPanel.classList.toggle('summary', mode === 'summary');
  ui.mapPanel.classList.remove('open');
  ui.resultBar.hidden = mode === 'guess';
  ui.guessBtn.hidden = mode !== 'guess';
  ui.nextBtn.hidden = mode === 'guess';
  // Laisse la transition CSS finir avant de recalculer la taille de la carte
  setTimeout(() => guessMap.invalidate(), 320);
}

async function startGame(): Promise<void> {
  ui.startBtn.disabled = true;
  ui.startBtn.textContent = 'Chargement des photos…';
  try {
    pool ??= await fetchZonePictures();
  } catch (e) {
    pool = null;
    showScreen(
      `Impossible de contacter Panoramax.<br><small>${(e as Error).message}</small>`,
      '',
      'Réessayer',
    );
    return;
  }
  if (pool.length === 0) {
    showScreen("Aucune photo Panoramax n'a été trouvée dans la zone.", '', 'Réessayer');
    pool = null;
    return;
  }
  // On tire plus de photos que nécessaire pour pouvoir remplacer celles qui ne chargent pas
  queue = pickSpread(pool, pool.length, MIN_SPREAD_METERS, (p) => p.coords);
  totalRounds = Math.min(ROUNDS, queue.length);
  used = new Set();
  results = [];
  ui.hudRounds.textContent = String(totalRounds);
  ui.hudScore.textContent = '0';
  ui.screen.hidden = true;
  ui.hud.hidden = false;
  ui.mapPanel.hidden = false;
  ui.mapToggle.hidden = false;
  await nextRound();
}

async function nextRound(): Promise<void> {
  guessMap.reset();
  guess = null;
  ui.guessBtn.disabled = true;
  ui.guessBtn.textContent = 'Placez votre réponse sur la carte';
  ui.hudRound.textContent = String(results.length + 1);
  setPanelMode('guess');

  while (queue.length) {
    const pic = queue.shift()!;
    if (used.has(pic.id)) continue;
    used.add(pic.id);
    try {
      await viewer.show(pic);
      current = pic;
      renderCredits(pic);
      return;
    } catch (e) {
      console.warn('Photo ignorée', pic.id, e);
    }
  }
  // Plus aucune photo utilisable
  if (results.length) endGame();
  else showScreen("Les photos n'ont pas pu être chargées.", '', 'Réessayer');
}

function renderCredits(pic: Picture): void {
  const parts = ['Photo <a href="https://panoramax.fr" target="_blank" rel="noopener">Panoramax</a>'];
  if (pic.author) parts.push(`© ${escapeHtml(pic.author)}`);
  if (pic.license) parts.push(escapeHtml(pic.license));
  ui.credits.innerHTML = parts.join(' · ');
  ui.credits.hidden = false;
}

function submitGuess(): void {
  if (!current || !guess) return;
  const distance = haversine(current.coords, guess);
  const points = score(distance);
  results.push({ pic: current, guess, distance, points });
  const total = results.reduce((s, r) => s + r.points, 0);
  ui.hudScore.textContent = total.toLocaleString('fr-FR');

  const date = current.date ? ` · photo du ${new Date(current.date).toLocaleDateString('fr-FR')}` : '';
  ui.resultText.innerHTML = `À <b>${formatDistance(distance)}</b> — <b>+${points.toLocaleString('fr-FR')}</b> points${date}`;
  ui.resultLink.href = viewerLink(current);
  ui.nextBtn.textContent = results.length >= totalRounds ? 'Voir le résultat' : 'Manche suivante';
  setPanelMode('result');
  guessMap.showResult(current.coords, guess);
}

function endGame(): void {
  const total = results.reduce((s, r) => s + r.points, 0);
  const best = readBest();
  const record = total > best;
  if (record) writeBest(total);
  const rows = results
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td>${formatDistance(r.distance)}</td><td>${r.points.toLocaleString('fr-FR')}</td>` +
        `<td><a href="${viewerLink(r.pic)}" target="_blank" rel="noopener">photo ↗</a></td></tr>`,
    )
    .join('');
  ui.hud.hidden = true;
  ui.credits.hidden = true;
  ui.mapToggle.hidden = true;
  setPanelMode('summary');
  ui.mapPanel.hidden = false;
  ui.nextBtn.hidden = true;
  ui.resultBar.hidden = true;
  guessMap.showSummary(results.map((r) => ({ answer: r.pic.coords, guess: r.guess })));
  showScreen(
    `Score final : <b class="total">${total.toLocaleString('fr-FR')}</b> / ${(results.length * 5000).toLocaleString('fr-FR')}` +
      (record ? '<br>Nouveau record !' : best ? `<br><small>Record : ${best.toLocaleString('fr-FR')}</small>` : ''),
    `<table class="recap"><thead><tr><th>#</th><th>Distance</th><th>Points</th><th></th></tr></thead><tbody>${rows}</tbody></table>`,
    'Rejouer',
  );
  ui.screen.classList.add('summary');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

ui.startBtn.addEventListener('click', () => {
  ui.screen.classList.remove('summary');
  void startGame();
});
ui.guessBtn.addEventListener('click', submitGuess);
ui.nextBtn.addEventListener('click', () => {
  if (results.length >= totalRounds) endGame();
  else void nextRound();
});
ui.mapToggle.addEventListener('click', () => {
  ui.mapPanel.classList.toggle('open');
  setTimeout(() => guessMap.invalidate(), 320);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (!ui.guessBtn.hidden && !ui.guessBtn.disabled && !ui.mapPanel.hidden) submitGuess();
  else if (!ui.nextBtn.hidden && !ui.mapPanel.hidden) ui.nextBtn.click();
  else return;
  e.preventDefault();
});
