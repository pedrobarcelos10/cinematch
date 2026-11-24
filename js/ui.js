/**
 * ui.js — Componentes de interface do CineMatch
 * ------------------------------------------------------------
 * Funções reutilizáveis que geram HTML e cuidam do feedback
 * visual (cards, estrelas, toasts, diálogos, skeletons).
 * Este arquivo NÃO contém regras de negócio: ele apenas recebe
 * dados e devolve interface.
 *
 * Segurança: todo texto dinâmico passa por escapeHTML() antes
 * de entrar no DOM, evitando injeção de HTML (XSS) vinda das
 * APIs externas ou de nomes de perfil digitados pelo usuário.
 */
const UI = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /** Escapa caracteres especiais de HTML. */
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /** 169 → "2h49min" | 45 → "45 min" */
  function formatDuration(minutes) {
    if (!minutes) return 'Duração não informada';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, '0')}min` : `${h}h`;
  }

  /** Data relativa amigável: "Agora há pouco", "Hoje às 14:32", "Ontem às 09:10"... */
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const diffMin = Math.round((Date.now() - timestamp) / 60000);
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (diffMin < 2) return 'Agora há pouco';
    if (date.toDateString() === today.toDateString()) return `Hoje às ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `Ontem às ${time}`;
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${time}`;
  }

  const genreLabel = (id) => (GENRES.find((g) => g.id === id) || {}).label || id;
  const typeLabel = (type) => (type === 'serie' ? 'Série' : 'Filme');

  /** Gradiente determinístico (mesmo título → mesmas cores) para o pôster alternativo. */
  function posterGradient(text) {
    let hash = 0;
    for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = hash % 360;
    return `linear-gradient(160deg, hsl(${hue} 70% 32%), hsl(${(hue + 50) % 360} 65% 14%))`;
  }

  /** Pôster: imagem real (API) ou capa alternativa com emoji. */
  function posterHTML(item, posterUrl, size = 'card') {
    const fallback = `<div class="poster__fallback" style="background:${posterGradient(item.title)}" aria-hidden="true">
        <span class="poster__emoji">${escapeHTML(item.emoji || '🎬')}</span>
        <span class="poster__fallback-title">${escapeHTML(item.title)}</span>
      </div>`;
    const img = posterUrl
      ? `<img src="${escapeHTML(posterUrl)}" alt="Pôster de ${escapeHTML(item.title)}" loading="lazy" decoding="async"
           onerror="this.remove()">`
      : '';
    return `<div class="poster poster--${size}">${fallback}${img}</div>`;
  }

  /** Selo de classificação indicativa nas cores oficiais. */
  function ageBadge(age) {
    if (!age) return '';
    const label = age === 'L' ? 'Livre' : `${age} anos`;
    return `<span class="age age--${age}" title="Classificação indicativa: ${label}" aria-label="Classificação: ${label}">${age}</span>`;
  }

  /** Estrelas somente leitura (ex.: "★★★★☆"). */
  const starsText = (value) => '★'.repeat(value) + '☆'.repeat(5 - value);

  /**
   * Card de título.
   * @param {object} item          título (catálogo ou API)
   * @param {object} opts
   *   poster     → URL do pôster
   *   isFavorite → coração preenchido?
   *   compat     → % de compatibilidade (cards de recomendação)
   *   reasons    → motivos da recomendação
   *   userRating → estrelas que o usuário deu
   *   index      → posição (atraso da animação de entrada)
   */
  function card(item, opts = {}) {
    const { poster, isFavorite = false, compat, reasons, userRating, index = 0, extraActions = '' } = opts;
    const meta = [
      item.year,
      item.type === 'serie' && item.seasons ? `${item.seasons} temporada${item.seasons > 1 ? 's' : ''}` : null,
      item.duration ? (item.type === 'serie' ? `${item.duration} min/ep.` : formatDuration(item.duration)) : null
    ].filter(Boolean).join(' • ');

    const compatHTML = compat !== undefined ? `
      <div class="compat" aria-label="${compat}% compatível com você">
        <div class="compat__bar"><span style="width:${compat}%"></span></div>
        <strong>${compat}%</strong> <span>compatível</span>
      </div>` : '';

    const reasonsHTML = reasons && reasons.length ? `
      <details class="reasons">
        <summary>Por que indicamos?</summary>
        <ul>${reasons.map((r) => `<li><span aria-hidden="true">${r.icon}</span> ${escapeHTML(r.text)}</li>`).join('')}</ul>
      </details>` : '';

    return `
      <article class="card" style="--i:${index}" data-id="${escapeHTML(item.id)}">
        <button class="card__poster-btn" type="button" data-action="details" data-id="${escapeHTML(item.id)}"
                aria-label="Ver detalhes de ${escapeHTML(item.title)}">
          ${posterHTML(item, poster)}
          <span class="badge badge--type">${item.type === 'serie' ? '📺' : '🎬'} ${typeLabel(item.type)}</span>
          ${item.source ? `<span class="badge badge--source">via ${escapeHTML(item.source)}</span>` : ''}
        </button>
        <button class="fav-btn ${isFavorite ? 'is-active' : ''}" type="button" data-action="toggle-favorite"
                data-id="${escapeHTML(item.id)}" aria-pressed="${isFavorite}"
                aria-label="${isFavorite ? 'Remover dos' : 'Adicionar aos'} favoritos: ${escapeHTML(item.title)}"
                title="${isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2.3 4 6.4 4c2.3 0 3.8 1.3 5.6 3.3C13.8 5.3 15.3 4 17.6 4c4.1 0 6 4.3 4.4 7.7C19.5 16.4 12 21 12 21z"/></svg>
        </button>
        <div class="card__body">
          <h3 class="card__title">${escapeHTML(item.title)}</h3>
          <p class="card__meta">
            ${item.rating ? `<span class="rating" aria-label="Nota ${item.rating.toFixed(1)} de 10">⭐ ${item.rating.toFixed(1)}</span>` : ''}
            ${ageBadge(item.age)}
            <span>${escapeHTML(meta)}</span>
          </p>
          ${item.genres && item.genres.length ? `<ul class="tags" aria-label="Gêneros">${item.genres.slice(0, 3).map((g) => `<li>${escapeHTML(genreLabel(g))}</li>`).join('')}</ul>` : ''}
          ${userRating ? `<p class="card__user-rating" aria-label="Sua avaliação: ${userRating} de 5"><span aria-hidden="true">${starsText(userRating)}</span> sua nota</p>` : ''}
          ${compatHTML}
          ${reasonsHTML}
          ${extraActions}
        </div>
      </article>`;
  }

  /** Cards "fantasmas" exibidos enquanto algo carrega. */
  function skeletons(count = 3) {
    return Array.from({ length: count }, () => `
      <div class="card card--skeleton" aria-hidden="true">
        <div class="poster poster--card skeleton"></div>
        <div class="card__body"><div class="skeleton line"></div><div class="skeleton line short"></div></div>
      </div>`).join('');
  }

  /** Estado vazio com ilustração, texto e ação sugerida. */
  function emptyState({ icon, title, text, actionLabel, actionHref }) {
    return `
      <div class="empty">
        <div class="empty__icon" aria-hidden="true">${icon}</div>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(text)}</p>
        ${actionLabel ? `<a class="btn btn--primary" href="${actionHref}">${escapeHTML(actionLabel)}</a>` : ''}
      </div>`;
  }

  /** Grupo de estrelas interativo (radiogroup acessível por teclado). */
  function starRating(id, value = 0) {
    const labels = ['Não gostei', 'Mais ou menos', 'Bom', 'Muito bom', 'Amei!'];
    return `
      <div class="stars" role="radiogroup" aria-label="Sua avaliação" data-id="${escapeHTML(id)}">
        ${[1, 2, 3, 4, 5].map((n) => `
          <button type="button" role="radio" class="star ${n <= value ? 'is-on' : ''}" data-action="rate"
                  data-id="${escapeHTML(id)}" data-value="${n}" aria-checked="${n === value}"
                  tabindex="${n === (value || 1) ? 0 : -1}" title="${labels[n - 1]}"
                  aria-label="${n} estrela${n > 1 ? 's' : ''}: ${labels[n - 1]}">★</button>`).join('')}
        <span class="stars__label" aria-live="polite">${value ? labels[value - 1] : 'Já assistiu? Avalie!'}</span>
      </div>`;
  }

  // ─────────────── Toasts (feedback de ações) ───────────────
  /**
   * Exibe uma notificação temporária.
   * @param {string} message
   * @param {object} opts  type: 'success'|'error'|'info', action: { label, onClick }
   */
  function toast(message, { type = 'success', action = null, duration = 4500 } = {}) {
    const region = $('#toast-region');
    const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span aria-hidden="true">${icons[type]}</span><p>${escapeHTML(message)}</p>`;

    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast__action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.onClick(); dismiss(); });
      el.appendChild(btn);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Fechar notificação');
    close.textContent = '×';
    close.addEventListener('click', dismiss);
    el.appendChild(close);

    region.appendChild(el);
    const timer = setTimeout(dismiss, duration);
    function dismiss() {
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
    }
  }

  // ─────────────── Diálogos ───────────────
  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('no-scroll');
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  /** Confirmação acessível (substitui o window.confirm). Retorna Promise<boolean>. */
  function confirm({ title, message, confirmLabel = 'Confirmar', danger = true }) {
    const dialog = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const okBtn = $('#confirm-ok');
    okBtn.textContent = confirmLabel;
    okBtn.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
    openDialog(dialog);
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    });
  }

  return {
    $, $$, escapeHTML, formatDuration, formatDate, genreLabel, typeLabel, posterHTML, ageBadge,
    starsText, card, skeletons, emptyState, starRating, toast, openDialog, closeDialog, confirm
  };
})();
