/**
 * app.js — Controlador principal do CineMatch
 * ------------------------------------------------------------
 * Liga todas as peças: lê o formulário, chama o motor de
 * recomendação, salva dados com o StorageService, consome a
 * API e desenha a interface com o módulo UI.
 *
 * Seções deste arquivo:
 *   1. Estado e utilitários
 *   2. Inicialização
 *   3. Navegação (rotas por hash: #descobrir, #favoritos…)
 *   4. Formulário de preferências + validação
 *   5. Recomendações e "Surpreenda-me"
 *   6. Favoritos (com desfazer)
 *   7. Avaliações por estrelas e detalhes do título
 *   8. Explorar (busca local + API)
 *   9. Histórico
 *  10. Estatísticas
 *  11. Perfis
 *  12. Tema, ajustes, backup e atalhos de teclado
 */
(() => {
  'use strict';

  const { $, $$, escapeHTML } = UI;

  // ═════════════ 1. ESTADO E UTILITÁRIOS ═════════════
  const ROUTES = ['descobrir', 'explorar', 'favoritos', 'historico', 'estatisticas'];
  const AVATARS = ['🍿', '🎬', '🦸', '🧙', '👻', '🚀', '🐱', '🦊'];
  const MAX_PROFILES = 6;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    route: 'descobrir',
    posters: {},          // { idDoTitulo: urlDoPoster } vindo da API
    lastPrefs: null,      // últimas preferências usadas
    shownIds: [],         // títulos já mostrados (para "Gerar outras")
    onlineResults: [],    // resultados da busca na internet
    searchType: 'todos',
    selectedAvatar: AVATARS[1]
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const debounce = (fn, ms) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
  const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label;

  /** Encontra um título pelo id: catálogo, resultados online, favoritos ou histórico. */
  function findItem(id) {
    return MOVIES.find((m) => m.id === id)
      || state.onlineResults.find((m) => m.id === id)
      || StorageService.getFavorites().find((f) => f.id === id)
      || StorageService.getHistory().flatMap((h) => h.items).find((i) => i.id === id);
  }

  const posterOf = (item) => state.posters[item.id] || item.poster || null;
  const isFavorite = (id) => StorageService.getFavorites().some((f) => f.id === id);

  /** Contexto do perfil para o motor de recomendação. */
  const buildContext = () => Recommender.buildContext({
    ratings: StorageService.getRatings(),
    favorites: StorageService.getFavorites(),
    history: StorageService.getHistory()
  });

  /** Opções padrão para desenhar um card. */
  function cardOptions(item, extra = {}) {
    return {
      poster: posterOf(item),
      isFavorite: isFavorite(item.id),
      userRating: StorageService.getRatings()[item.id],
      ...extra
    };
  }

  // ═════════════ 2. INICIALIZAÇÃO ═════════════
  function init() {
    renderFormOptions();
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', false);
    refreshProfileUI();
    loadPrefsIntoForm();
    bindEvents();
    handleRoute();

    if (!StorageService.isAvailable()) {
      UI.toast('Seu navegador bloqueou o LocalStorage: os dados valem só até fechar a aba.', { type: 'error', duration: 8000 });
    }

    loadPosters();
    registerServiceWorker();
  }

  /** Busca os pôsteres do catálogo (Wikipédia/TVMaze) e redesenha a tela atual. */
  async function loadPosters() {
    try {
      const update = (posters) => { state.posters = posters; rerenderCurrentView(); };
      update(await ApiService.getPosters(MOVIES, update));
    } catch (error) {
      console.warn('[CineMatch] Pôsteres indisponíveis:', error);
      UI.toast('Sem conexão com a API de pôsteres: usando capas alternativas.', { type: 'info' });
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[CineMatch] SW:', e));
    }
  }

  // ═════════════ 3. NAVEGAÇÃO ═════════════
  function handleRoute() {
    const hash = location.hash.replace('#', '');
    const route = ROUTES.includes(hash) ? hash : 'descobrir';
    const changed = route !== state.route;
    state.route = route;

    $$('.view').forEach((view) => { view.hidden = view.dataset.view !== route; });
    $$('.main-nav a').forEach((link) => {
      if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = `${labelOfRoute(route)} · CineMatch`;
    rerenderCurrentView();

    if (changed) {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      // Leva o foco ao título da página (ajuda leitores de tela)
      const heading = $(`#view-${route} h1`);
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }
  }

  const labelOfRoute = (route) => ({
    descobrir: 'Descobrir', explorar: 'Explorar', favoritos: 'Favoritos',
    historico: 'Histórico', estatisticas: 'Estatísticas'
  })[route];

  function rerenderCurrentView() {
    switch (state.route) {
      case 'descobrir': refreshResultCards(); break;
      case 'explorar': renderLocalSearch(); renderOnlineResults(); break;
      case 'favoritos': renderFavorites(); break;
      case 'historico': renderHistory(); break;
      case 'estatisticas': renderStats(); break;
      default: break;
    }
  }

  // ═════════════ 4. FORMULÁRIO DE PREFERÊNCIAS ═════════════
  /** Gera chips, botões segmentados e selects a partir das constantes de movies.js. */
  function renderFormOptions() {
    $('#mood-options').innerHTML = MOODS.map((m) => `
      <label class="chip chip--mood">
        <input type="radio" name="mood" value="${m.id}">
        <span><span class="chip__icon" aria-hidden="true">${m.icon}</span>${m.label}</span>
      </label>`).join('');

    $('#genre-options').innerHTML = GENRES.map((g) => `
      <label class="chip">
        <input type="checkbox" name="genres" value="${g.id}">
        <span><span class="chip__icon" aria-hidden="true">${g.icon}</span>${g.label}</span>
      </label>`).join('');

    $('#type-options').innerHTML = CONTENT_TYPES.map((t) => `
      <label class="segmented__item">
        <input type="radio" name="type" value="${t.id}" ${t.id === 'todos' ? 'checked' : ''}>
        <span><span aria-hidden="true">${t.icon}</span> ${t.label}</span>
      </label>`).join('');

    $('#age-select').insertAdjacentHTML('beforeend',
      AGE_GROUPS.map((a) => `<option value="${a.id}">${a.label}</option>`).join(''));

    $('#time-options').innerHTML = TIME_OPTIONS.map((t) => `
      <label class="chip chip--small">
        <input type="radio" name="time" value="${t.id}" ${t.id === 120 ? 'checked' : ''}>
        <span>${t.label}</span>
      </label>`).join('');

    $('#search-type').innerHTML = CONTENT_TYPES.map((t) => `
      <label class="segmented__item">
        <input type="radio" name="search-type" value="${t.id}" ${t.id === 'todos' ? 'checked' : ''}>
        <span>${t.id === 'todos' ? 'Todos' : t.label}</span>
      </label>`).join('');

    $('#avatar-picker').innerHTML = AVATARS.map((a) => `
      <label class="avatar-option">
        <input type="radio" name="avatar" value="${a}" ${a === state.selectedAvatar ? 'checked' : ''}>
        <span aria-label="Avatar ${a}">${a}</span>
      </label>`).join('');
  }

  /** Lê o formulário e devolve um objeto de preferências. */
  function readForm() {
    const form = $('#prefs-form');
    const data = new FormData(form);
    return {
      mood: data.get('mood'),
      genres: data.getAll('genres'),
      type: data.get('type') || 'todos',
      age: data.get('age'),
      time: Number(data.get('time') || 0)
    };
  }

  /** Preenche o formulário com as preferências salvas (reconhecer em vez de lembrar). */
  function loadPrefsIntoForm() {
    const form = $('#prefs-form');
    form.reset();
    const prefs = StorageService.getPrefs();
    if (prefs) {
      $$('input[name="mood"]', form).forEach((i) => { i.checked = i.value === prefs.mood; });
      $$('input[name="genres"]', form).forEach((i) => { i.checked = prefs.genres.includes(i.value); });
      $$('input[name="type"]', form).forEach((i) => { i.checked = i.value === prefs.type; });
      $$('input[name="time"]', form).forEach((i) => { i.checked = Number(i.value) === prefs.time; });
      $('#age-select').value = prefs.age || '';
    }
    clearErrors();
    updateSteps();
  }

  /** Mostra/oculta a mensagem de erro de um campo. */
  function setFieldError(field, message) {
    const error = $(`#error-${field}`);
    const container = field === 'age' ? $('#age-select') : $(`#field-${field}`);
    error.textContent = message ? `⚠️ ${message}` : '';
    error.hidden = !message;
    container.classList.toggle('is-invalid', Boolean(message));
    if (field === 'age') container.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function clearErrors() { ['mood', 'genres', 'age'].forEach((f) => setFieldError(f, '')); }

  /** Valida as preferências. Retorna true se estiver tudo certo. */
  function validate(prefs, { requireTaste = true } = {}) {
    clearErrors();
    const errors = [];
    if (requireTaste && !prefs.mood) errors.push(['mood', 'Escolha como você está se sentindo.']);
    if (requireTaste && prefs.genres.length === 0) errors.push(['genres', 'Selecione pelo menos um gênero.']);
    if (!prefs.age) errors.push(['age', 'Informe a faixa etária para respeitarmos a classificação indicativa.']);
    errors.forEach(([field, msg]) => setFieldError(field, msg));

    if (errors.length) {
      const first = errors[0][0];
      const target = first === 'age' ? $('#age-select') : $(`#field-${first} input`);
      target.focus();
      target.closest('.field').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      UI.toast(errors.length > 1 ? `Faltam ${errors.length} informações para recomendar.` : errors[0][1], { type: 'error' });
      return false;
    }
    return true;
  }

  /** Indicador de progresso (1. Humor → 2. Gêneros → 3. Detalhes). */
  function updateSteps() {
    const prefs = readForm();
    const done = { mood: Boolean(prefs.mood), genres: prefs.genres.length > 0, details: Boolean(prefs.age) };
    $$('.steps__item').forEach((el) => el.classList.toggle('is-done', done[el.dataset.step]));
  }

  // ═════════════ 5. RECOMENDAÇÕES ═════════════
  async function handleRecommend(event) {
    event.preventDefault();
    const prefs = readForm();
    if (!validate(prefs)) return;

    StorageService.savePrefs(prefs);
    state.lastPrefs = prefs;
    state.shownIds = [];
    await generate(prefs, 'recomendacao');
  }

  async function handleReroll() {
    if (!state.lastPrefs) return;
    await generate(state.lastPrefs, 'recomendacao', true);
  }

  /** Gera as 3 sugestões, desenha e registra no histórico. */
  async function generate(prefs, kind, isReroll = false) {
    const section = $('#results');
    const grid = $('#results-grid');
    section.hidden = false;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = UI.skeletons(3);
    $('#results-notice').hidden = true;
    if (!isReroll) section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setButtonsBusy(true);

    await sleep(reducedMotion ? 0 : 550); // tempo para o usuário perceber o processamento

    const ctx = buildContext();
    let { results, relaxed } = Recommender.recommend(prefs, ctx, { count: 3, exclude: state.shownIds });
    if (results.length < 3 && state.shownIds.length) {
      // Acabaram as opções inéditas: recomeça o ciclo
      state.shownIds = [];
      ({ results, relaxed } = Recommender.recommend(prefs, ctx, { count: 3 }));
      UI.toast('Você já viu todas as opções para esse filtro. Recomeçando a lista!', { type: 'info' });
    }
    state.shownIds.push(...results.map((r) => r.item.id));
    state.lastResults = results;

    renderResults(results, prefs, relaxed, kind);
    saveHistory(results, prefs, kind);
    setButtonsBusy(false);
  }

  function setButtonsBusy(busy) {
    ['#recommend-btn', '#surprise-btn', '#reroll-btn'].forEach((sel) => {
      $(sel).disabled = busy;
      $(sel).classList.toggle('is-loading', busy);
    });
  }

  /** Resumo legível das preferências: "Animado · Ficção Científica · até 2h". */
  function prefsSummary(prefs) {
    const parts = [];
    const mood = MOODS.find((m) => m.id === prefs.mood);
    if (mood) parts.push(`${mood.icon} ${mood.label}`);
    if (prefs.genres && prefs.genres.length) parts.push(prefs.genres.map(UI.genreLabel).join(', '));
    if (prefs.type && prefs.type !== 'todos') parts.push(labelOf(CONTENT_TYPES, prefs.type));
    parts.push(labelOf(TIME_OPTIONS, prefs.time) || 'Sem pressa');
    const age = labelOf(AGE_GROUPS, prefs.age);
    if (age) parts.push(age);
    return parts.join(' · ');
  }

  function renderResults(results, prefs, relaxed, kind) {
    const grid = $('#results-grid');
    $('#results-title').textContent = kind === 'surpresa' ? '🎲 Sua surpresa' : `Suas ${results.length} sugestões`;
    $('#results-summary').textContent = kind === 'surpresa'
      ? 'Sorteamos um título muito bem avaliado para o seu perfil.'
      : prefsSummary(prefs);
    $('#reroll-btn').hidden = kind === 'surpresa';

    const notice = $('#results-notice');
    const messages = [];
    if (relaxed.includes('tempo')) messages.push('incluímos títulos um pouco mais longos que o seu tempo disponível');
    if (relaxed.includes('tipo')) messages.push(`incluímos também ${prefs.type === 'filme' ? 'séries' : 'filmes'}`);
    notice.hidden = messages.length === 0;
    notice.textContent = messages.length ? `💡 Poucas opções com esses filtros, então ${messages.join(' e ')}.` : '';

    grid.innerHTML = results.length
      ? results.map((r, i) => UI.card(r.item, cardOptions(r.item, { compat: r.compat, reasons: r.reasons, index: i }))).join('')
      : UI.emptyState({ icon: '🔎', title: 'Nada encontrado', text: 'Tente outros gêneros ou outra faixa etária.' });
    grid.classList.toggle('grid--single', results.length === 1);
    grid.setAttribute('aria-busy', 'false');
  }

  /** Redesenha os cards de resultado (ex.: quando os pôsteres chegam). */
  function refreshResultCards() {
    if (!state.lastResults || $('#results').hidden) return;
    $$('#results-grid .card').forEach((cardEl) => {
      const result = state.lastResults.find((r) => r.item.id === cardEl.dataset.id);
      if (!result) return;
      const poster = posterOf(result.item);
      const posterBox = $('.poster', cardEl);
      const img = $('img', posterBox);
      if (poster && (!img || img.getAttribute('src') !== poster)) posterBox.outerHTML = UI.posterHTML(result.item, poster);
    });
  }

  /** Surpreenda-me: animação de roleta + sorteio. */
  async function handleSurprise() {
    const prefs = readForm();
    if (!validate(prefs, { requireTaste: false })) return;
    const pick = Recommender.surprise(prefs, buildContext());
    if (!pick) return;

    setButtonsBusy(true);
    if (!reducedMotion) {
      const overlay = $('#roulette');
      const title = $('#roulette-title');
      overlay.hidden = false;
      for (let i = 0; i < 16; i++) {
        const random = MOVIES[Math.floor(Math.random() * MOVIES.length)];
        title.textContent = `${random.emoji} ${random.title}`;
        await sleep(60 + i * 8);
      }
      title.textContent = `${pick.item.emoji} ${pick.item.title}`;
      title.classList.add('is-final');
      await sleep(700);
      title.classList.remove('is-final');
      overlay.hidden = true;
    }
    setButtonsBusy(false);

    state.lastPrefs = null;
    state.lastResults = [pick];
    $('#results').hidden = false;
    renderResults([pick], prefs, [], 'surpresa');
    $('#results').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    saveHistory([pick], prefs, 'surpresa');
  }

  // ═════════════ 6. FAVORITOS ═════════════
  /** Guarda uma "foto" do título (necessário para itens vindos da API). */
  function snapshot(item) {
    return {
      id: item.id, title: item.title, original: item.original, type: item.type, year: item.year,
      genres: item.genres || [], moods: item.moods || [], duration: item.duration, seasons: item.seasons,
      rating: item.rating, age: item.age, emoji: item.emoji, synopsis: item.synopsis,
      synopsisLang: item.synopsisLang, source: item.source, link: item.link, poster: posterOf(item)
    };
  }

  function toggleFavorite(id) {
    const favorites = StorageService.getFavorites();
    const index = favorites.findIndex((f) => f.id === id);

    if (index >= 0) {
      const [removed] = favorites.splice(index, 1);
      StorageService.saveFavorites(favorites);
      UI.toast(`"${removed.title}" saiu dos favoritos.`, {
        type: 'info',
        action: {
          label: 'Desfazer',
          onClick: () => {
            const list = StorageService.getFavorites();
            list.splice(index, 0, removed);
            StorageService.saveFavorites(list);
            afterFavoritesChange(id);
            UI.toast('Pronto, voltou para os favoritos!');
          }
        }
      });
    } else {
      const item = findItem(id);
      if (!item) return;
      favorites.unshift({ ...snapshot(item), savedAt: Date.now() });
      if (!StorageService.saveFavorites(favorites)) {
        UI.toast('Não foi possível salvar: armazenamento cheio.', { type: 'error' });
        return;
      }
      UI.toast(`"${item.title}" foi salvo nos favoritos! ❤️`);
    }
    afterFavoritesChange(id);
  }

  /** Atualiza contadores e botões de coração sem redesenhar a página toda. */
  function afterFavoritesChange(id) {
    const active = isFavorite(id);
    const item = findItem(id);
    $$(`.fav-btn[data-id="${CSS.escape(id)}"]`).forEach((btn) => {
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
      btn.setAttribute('aria-label', `${active ? 'Remover dos' : 'Adicionar aos'} favoritos: ${item ? item.title : ''}`);
      if (active && !reducedMotion) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    });
    const detailsFav = $('#details-fav');
    if (detailsFav && detailsFav.dataset.id === id) updateDetailsFavButton(id);
    updateFavCount();
    if (state.route === 'favoritos') renderFavorites();
    if (state.route === 'estatisticas') renderStats();
  }

  function updateFavCount() {
    const count = StorageService.getFavorites().length;
    const badge = $('#fav-count');
    badge.textContent = count;
    badge.hidden = count === 0;
    badge.title = `${count} ${count === 1 ? 'favorito' : 'favoritos'}`;
  }

  function renderFavorites() {
    const all = StorageService.getFavorites();
    const filter = $('#fav-filter').value;
    const sort = $('#fav-sort').value;
    const grid = $('#favorites-grid');

    const films = all.filter((f) => f.type === 'filme');
    const minutes = films.reduce((sum, f) => sum + (f.duration || 0), 0);
    $('#favorites-summary').textContent = all.length
      ? `${all.length} ${all.length === 1 ? 'título salvo' : 'títulos salvos'} · ${films.length} filme(s) e ${all.length - films.length} série(s) · ${UI.formatDuration(minutes)} de filmes para maratonar.`
      : 'Os títulos que você salvar ficam aqui, mesmo depois de fechar o navegador.';

    if (all.length === 0) {
      grid.innerHTML = UI.emptyState({
        icon: '💔', title: 'Nenhum favorito ainda',
        text: 'Toque no coração de qualquer sugestão para guardá-la aqui.',
        actionLabel: 'Descobrir títulos', actionHref: '#descobrir'
      });
      return;
    }

    const sorters = {
      recentes: (a, b) => b.savedAt - a.savedAt,
      nota: (a, b) => (b.rating || 0) - (a.rating || 0),
      titulo: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
      duracao: (a, b) => (a.duration || 999) - (b.duration || 999)
    };
    const list = all.filter((f) => filter === 'todos' || f.type === filter).sort(sorters[sort]);
    grid.innerHTML = list.length
      ? list.map((f, i) => UI.card(f, cardOptions(f, { index: i }))).join('')
      : UI.emptyState({ icon: '🔎', title: 'Nada com esse filtro', text: 'Troque o filtro para ver os outros favoritos.' });
  }

  // ═════════════ 7. AVALIAÇÕES E DETALHES ═════════════
  function rate(id, value) {
    const ratings = StorageService.getRatings();
    if (ratings[id] === value) {
      delete ratings[id];
      UI.toast('Avaliação removida.', { type: 'info' });
    } else {
      ratings[id] = value;
      UI.toast(value <= 2
        ? 'Anotado! Não vamos mais recomendar esse título.'
        : 'Avaliação salva! Ela vai melhorar suas próximas recomendações.');
    }
    StorageService.saveRatings(ratings);
    const starsBox = $(`.stars[data-id="${CSS.escape(id)}"]`);
    if (starsBox) {
      starsBox.outerHTML = UI.starRating(id, ratings[id] || 0);
      const focusStar = $(`.stars[data-id="${CSS.escape(id)}"] .star[tabindex="0"]`);
      if (focusStar) focusStar.focus();
    }
    if (state.route === 'favoritos') renderFavorites();
  }

  function updateDetailsFavButton(id) {
    const btn = $('#details-fav');
    const active = isFavorite(id);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.innerHTML = `<svg class="icon"><use href="#i-heart"/></svg> ${active ? 'Nos favoritos' : 'Salvar nos favoritos'}`;
  }

  function openDetails(id) {
    const item = findItem(id);
    if (!item) return;
    const rating = StorageService.getRatings()[id] || 0;
    const moods = (item.moods || []).map((m) => MOODS.find((x) => x.id === m)).filter(Boolean);
    const meta = [
      UI.typeLabel(item.type), item.year,
      item.type === 'serie' && item.seasons ? `${item.seasons} temporada(s)` : null,
      item.duration ? (item.type === 'serie' ? `episódios de ~${item.duration} min` : UI.formatDuration(item.duration)) : null
    ].filter(Boolean).join(' • ');
    const trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.title} ${item.year || ''} trailer oficial`)}`;
    const moreUrl = item.link || `https://pt.wikipedia.org/w/index.php?search=${encodeURIComponent(`${item.title} ${item.type === 'serie' ? 'série' : 'filme'}`)}`;

    $('#details-content').innerHTML = `
      <div class="details">
        <div class="details__poster">${UI.posterHTML(item, posterOf(item), 'large')}</div>
        <div class="details__info">
          <p class="details__eyebrow">${escapeHTML(meta)}</p>
          <h2 id="details-title">${escapeHTML(item.title)}</h2>
          ${item.original && item.original !== item.title ? `<p class="details__original">${escapeHTML(item.original)}</p>` : ''}
          <p class="details__meta">
            ${item.rating ? `<span class="rating rating--big">⭐ ${item.rating.toFixed(1)}<small>/10</small></span>` : ''}
            ${UI.ageBadge(item.age)}
          </p>
          ${item.genres && item.genres.length ? `<ul class="tags">${item.genres.map((g) => `<li>${escapeHTML(UI.genreLabel(g))}</li>`).join('')}</ul>` : ''}
          <p class="details__synopsis">${escapeHTML(item.synopsis || 'Sinopse não disponível.')}</p>
          ${item.synopsisLang === 'en' ? '<p class="details__note">Sinopse original em inglês (fonte: TVMaze).</p>' : ''}
          ${moods.length ? `<p class="details__moods"><strong>Bom para quando você está:</strong> ${moods.map((m) => `${m.icon} ${m.label}`).join(' · ')}</p>` : ''}
          ${UI.starRating(item.id, rating)}
          <div class="button-row">
            <button class="btn btn--primary" type="button" id="details-fav" data-id="${escapeHTML(item.id)}" data-action="toggle-favorite"></button>
            <a class="btn btn--secondary" href="${trailerUrl}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-play"/></svg> Trailer</a>
            <button class="btn btn--ghost" type="button" data-action="share" data-id="${escapeHTML(item.id)}"><svg class="icon"><use href="#i-share"/></svg> Compartilhar</button>
            <a class="btn btn--ghost" href="${escapeHTML(moreUrl)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-external"/></svg> Saiba mais</a>
          </div>
        </div>
      </div>`;
    updateDetailsFavButton(item.id);
    UI.openDialog($('#details-dialog'));
  }

  async function share(id) {
    const item = findItem(id);
    if (!item) return;
    const text = `🎬 O CineMatch me recomendou: ${item.title}${item.year ? ` (${item.year})` : ''}${item.rating ? ` ⭐ ${item.rating.toFixed(1)}` : ''}`;
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CineMatch', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} — ${url}`);
        UI.toast('Texto copiado! É só colar onde quiser.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') UI.toast('Não foi possível compartilhar.', { type: 'error' });
    }
  }

  // ═════════════ 8. EXPLORAR ═════════════
  /** Busca instantânea no catálogo local (ignora acentos e maiúsculas). */
  function renderLocalSearch() {
    const term = normalize($('#search-input').value.trim());
    const type = state.searchType;
    const results = MOVIES
      .filter((m) => type === 'todos' || m.type === type)
      .filter((m) => !term || normalize([m.title, m.original, ...m.genres.map(UI.genreLabel), m.year].join(' ')).includes(term))
      .sort((a, b) => b.rating - a.rating);

    $('#local-count').textContent = `(${results.length})`;
    $('#local-results').innerHTML = results.length
      ? results.map((m, i) => UI.card(m, cardOptions(m, { index: Math.min(i, 8) }))).join('')
      : UI.emptyState({ icon: '🔎', title: 'Nada no catálogo', text: 'Clique em “Buscar na internet” para procurar na Wikipédia e na TVMaze.' });
  }

  async function handleOnlineSearch(event) {
    event.preventDefault();
    const term = $('#search-input').value.trim();
    if (term.length < 2) {
      UI.toast('Digite pelo menos 2 letras para buscar.', { type: 'error' });
      $('#search-input').focus();
      return;
    }
    if (!navigator.onLine) {
      UI.toast('Você está offline. A busca na internet precisa de conexão.', { type: 'error' });
      return;
    }
    const section = $('#online-section');
    const grid = $('#online-results');
    section.hidden = false;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = UI.skeletons(4);
    $('#online-count').textContent = '(buscando…)';

    try {
      state.onlineResults = await ApiService.searchOnline(term, state.searchType);
      state.lastOnlineTerm = term;
      renderOnlineResults();
      section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    } catch (error) {
      $('#online-count').textContent = '';
      grid.innerHTML = `
        <div class="empty">
          <div class="empty__icon" aria-hidden="true">📡</div>
          <h3>Não conseguimos falar com a internet</h3>
          <p>${escapeHTML(error.message || 'Erro desconhecido')}. O catálogo local continua disponível.</p>
          <button class="btn btn--primary" type="submit" form="search-form">Tentar novamente</button>
        </div>`;
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }

  function renderOnlineResults() {
    if (!state.lastOnlineTerm) return;
    const grid = $('#online-results');
    const list = state.onlineResults;
    $('#online-count').textContent = `(${list.length})`;
    grid.innerHTML = list.length
      ? list.map((m, i) => UI.card(m, cardOptions(m, { index: i }))).join('')
      : UI.emptyState({ icon: '🤷', title: `Nada encontrado para “${state.lastOnlineTerm}”`, text: 'Confira a grafia ou tente o título original.' });
  }

  // ═════════════ 9. HISTÓRICO ═════════════
  function saveHistory(results, prefs, kind) {
    StorageService.addHistoryEntry({
      id: Date.now(),
      at: Date.now(),
      kind,
      prefs,
      items: results.map((r) => ({ ...snapshot(r.item), compat: r.compat }))
    });
  }

  function renderHistory() {
    const history = StorageService.getHistory();
    const list = $('#history-list');
    $('#clear-history-btn').hidden = history.length === 0;

    if (history.length === 0) {
      list.innerHTML = `<li>${UI.emptyState({
        icon: '🕰️', title: 'Seu histórico está vazio',
        text: 'Cada recomendação que você gerar aparece aqui, com data e preferências usadas.',
        actionLabel: 'Gerar recomendações', actionHref: '#descobrir'
      })}</li>`;
      return;
    }

    list.innerHTML = history.map((entry) => `
      <li class="timeline__item">
        <div class="timeline__dot" aria-hidden="true">${entry.kind === 'surpresa' ? '🎲' : '✨'}</div>
        <div class="timeline__card panel">
          <div class="timeline__head">
            <div>
              <p class="timeline__date"><time datetime="${new Date(entry.at).toISOString()}">${UI.formatDate(entry.at)}</time></p>
              <h2 class="timeline__title">${entry.kind === 'surpresa' ? 'Surpreenda-me' : 'Recomendação'}</h2>
              <p class="timeline__prefs">${escapeHTML(entry.kind === 'surpresa' ? labelOf(AGE_GROUPS, entry.prefs.age) || '' : prefsSummary(entry.prefs))}</p>
            </div>
            ${entry.kind !== 'surpresa' ? `<button class="btn btn--ghost btn--small" type="button" data-action="reuse-prefs" data-entry="${entry.id}">
              <svg class="icon"><use href="#i-refresh"/></svg> Usar estas preferências</button>` : ''}
          </div>
          <ul class="mini-list">
            ${entry.items.map((item) => `
              <li>
                <button type="button" class="mini" data-action="details" data-id="${escapeHTML(item.id)}">
                  ${UI.posterHTML(item, posterOf(item), 'mini')}
                  <span class="mini__text">
                    <strong>${escapeHTML(item.title)}</strong>
                    <small>${item.compat}% compatível${item.rating ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}</small>
                  </span>
                </button>
              </li>`).join('')}
          </ul>
        </div>
      </li>`).join('');
  }

  function reusePrefs(entryId) {
    const entry = StorageService.getHistory().find((h) => String(h.id) === String(entryId));
    if (!entry) return;
    StorageService.savePrefs(entry.prefs);
    loadPrefsIntoForm();
    location.hash = '#descobrir';
    UI.toast('Preferências carregadas! Clique em “Recomendar”.', { type: 'info' });
  }

  async function clearHistory() {
    const ok = await UI.confirm({
      title: 'Limpar histórico?',
      message: 'Todas as sessões de recomendação deste perfil serão apagadas. Favoritos e avaliações não serão afetados.',
      confirmLabel: 'Limpar histórico'
    });
    if (!ok) return;
    const backup = StorageService.getHistory();
    StorageService.saveHistory([]);
    renderHistory();
    UI.toast('Histórico apagado.', {
      type: 'info',
      action: { label: 'Desfazer', onClick: () => { StorageService.saveHistory(backup); renderHistory(); } }
    });
  }

  // ═════════════ 10. ESTATÍSTICAS ═════════════
  const PERSONAS = {
    ficcao: ['Viajante do Espaço', '🚀'], comedia: ['Mestre da Risada', '😂'], drama: ['Alma Sensível', '🎭'],
    terror: ['Caçador de Sustos', '👻'], acao: ['Adrenalina Pura', '💥'], romance: ['Coração Romântico', '💘'],
    animacao: ['Criança Interior', '🎨'], aventura: ['Explorador Nato', '🧭'], crime: ['Detetive de Sofá', '🕵️'],
    fantasia: ['Mago das Histórias', '🧙'], suspense: ['Mente Inquieta', '🔪'], familia: ['Sessão em Família', '👨‍👩‍👧'],
    documentario: ['Mente Curiosa', '🌎']
  };

  /** Conta ocorrências e devolve [[chave, total], ...] em ordem decrescente. */
  function countBy(values) {
    const counts = values.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  /** Gráfico de barras horizontais em HTML/CSS (acessível: os números ficam visíveis). */
  function barChart(entries, labelFn) {
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return `<ul class="bars">${entries.map(([key, value]) => `
      <li class="bars__row">
        <span class="bars__label">${escapeHTML(labelFn(key))}</span>
        <span class="bars__track"><span class="bars__fill" style="width:${(value / max) * 100}%"></span></span>
        <span class="bars__value">${value}</span>
      </li>`).join('')}</ul>`;
  }

  function renderStats() {
    const favorites = StorageService.getFavorites();
    const ratings = StorageService.getRatings();
    const history = StorageService.getHistory();
    const container = $('#stats-content');

    if (!favorites.length && !Object.keys(ratings).length && !history.length) {
      container.innerHTML = UI.emptyState({
        icon: '📊', title: 'Ainda não há dados suficientes',
        text: 'Gere recomendações, salve favoritos e avalie títulos para ver suas estatísticas.',
        actionLabel: 'Começar agora', actionHref: '#descobrir'
      });
      return;
    }

    const films = favorites.filter((f) => f.type === 'filme');
    const series = favorites.length - films.length;
    const filmMinutes = films.reduce((s, f) => s + (f.duration || 0), 0);
    const rated = favorites.filter((f) => f.rating);
    const avgRating = rated.length ? rated.reduce((s, f) => s + f.rating, 0) / rated.length : 0;
    const starValues = Object.values(ratings);
    const avgStars = starValues.length ? starValues.reduce((a, b) => a + b, 0) / starValues.length : 0;

    const genreCounts = countBy(favorites.flatMap((f) => f.genres || [])).slice(0, 6);
    const moodCounts = countBy(history.map((h) => h.prefs.mood).filter(Boolean)).slice(0, 5);
    const topGenre = genreCounts[0] ? genreCounts[0][0]
      : countBy(history.flatMap((h) => h.prefs.genres || []))[0]?.[0];
    const persona = PERSONAS[topGenre];
    const filmPct = favorites.length ? Math.round((films.length / favorites.length) * 100) : 0;
    const topMood = moodCounts[0] && MOODS.find((m) => m.id === moodCounts[0][0]);

    container.innerHTML = `
      ${persona ? `
      <div class="persona panel">
        <div class="persona__icon" aria-hidden="true">${persona[1]}</div>
        <div>
          <p class="persona__eyebrow">Seu perfil cinéfilo</p>
          <h2 class="persona__title">${persona[0]}</h2>
          <p>Seu gênero mais presente é <strong>${escapeHTML(UI.genreLabel(topGenre))}</strong>${topMood ? ` e você costuma buscar algo quando está <strong>${topMood.icon} ${topMood.label.toLowerCase()}</strong>` : ''}.</p>
        </div>
      </div>` : ''}

      <ul class="kpis">
        <li class="kpi panel"><span class="kpi__value">${favorites.length}</span><span class="kpi__label">Favoritos</span></li>
        <li class="kpi panel"><span class="kpi__value">${filmMinutes ? UI.formatDuration(filmMinutes) : '0h'}</span><span class="kpi__label">De filmes salvos</span></li>
        <li class="kpi panel"><span class="kpi__value">${avgRating ? `⭐ ${avgRating.toFixed(1)}` : '—'}</span><span class="kpi__label">Nota média dos favoritos</span></li>
        <li class="kpi panel"><span class="kpi__value">${starValues.length}</span><span class="kpi__label">Títulos avaliados${avgStars ? ` (média ${avgStars.toFixed(1)}★)` : ''}</span></li>
        <li class="kpi panel"><span class="kpi__value">${history.length}</span><span class="kpi__label">Sessões de recomendação</span></li>
      </ul>

      <div class="stats-grid">
        <section class="panel chart-card" aria-labelledby="chart-genres">
          <h2 id="chart-genres">Gêneros nos favoritos</h2>
          ${genreCounts.length ? barChart(genreCounts, UI.genreLabel) : '<p class="muted">Salve favoritos para ver este gráfico.</p>'}
        </section>

        <section class="panel chart-card" aria-labelledby="chart-types">
          <h2 id="chart-types">Filmes × Séries</h2>
          ${favorites.length ? `
          <div class="donut-wrap">
            <div class="donut" style="--pct:${filmPct}" role="img" aria-label="${films.length} filmes e ${series} séries"><span>${favorites.length}<small>títulos</small></span></div>
            <ul class="legend">
              <li><span class="legend__dot legend__dot--a"></span> Filmes <strong>${films.length}</strong> (${filmPct}%)</li>
              <li><span class="legend__dot legend__dot--b"></span> Séries <strong>${series}</strong> (${100 - filmPct}%)</li>
            </ul>
          </div>` : '<p class="muted">Salve favoritos para ver este gráfico.</p>'}
        </section>

        <section class="panel chart-card" aria-labelledby="chart-moods">
          <h2 id="chart-moods">Humores mais usados</h2>
          ${moodCounts.length ? barChart(moodCounts, (id) => { const m = MOODS.find((x) => x.id === id); return m ? `${m.icon} ${m.label}` : id; }) : '<p class="muted">Gere recomendações para ver este gráfico.</p>'}
        </section>
      </div>`;
  }

  // ═════════════ 11. PERFIS ═════════════
  function refreshProfileUI() {
    const profile = StorageService.getActiveProfile();
    $('#profile-avatar').textContent = profile.avatar;
    $('#profile-name').textContent = profile.name;
    $('#hero-name').textContent = profile.name;
    $('#profile-btn').setAttribute('aria-label', `Perfil atual: ${profile.name}. Trocar ou criar perfil`);
    updateFavCount();
  }

  function renderProfileList() {
    const profiles = StorageService.getProfiles();
    const activeId = StorageService.getActiveProfileId();
    $('#profile-list').innerHTML = profiles.map((p) => `
      <li class="profile-item ${p.id === activeId ? 'is-active' : ''}">
        <span class="avatar avatar--lg" aria-hidden="true">${p.avatar}</span>
        <span class="profile-item__name">${escapeHTML(p.name)}${p.id === activeId ? ' <span class="pill">em uso</span>' : ''}</span>
        <span class="profile-item__actions">
          ${p.id !== activeId ? `<button class="btn btn--secondary btn--small" type="button" data-action="use-profile" data-profile="${p.id}">Usar</button>` : ''}
          <button class="btn btn--ghost btn--small" type="button" data-action="rename-profile" data-profile="${p.id}" aria-label="Renomear ${escapeHTML(p.name)}">Renomear</button>
          ${profiles.length > 1 ? `<button class="icon-btn icon-btn--small" type="button" data-action="delete-profile" data-profile="${p.id}" aria-label="Excluir perfil ${escapeHTML(p.name)}" title="Excluir perfil"><svg class="icon"><use href="#i-trash"/></svg></button>` : ''}
        </span>
      </li>`).join('');
    $('#profile-form').hidden = profiles.length >= MAX_PROFILES;
  }

  function switchProfile(id) {
    StorageService.setActiveProfileId(id);
    state.lastResults = null;
    state.lastPrefs = null;
    state.shownIds = [];
    $('#results').hidden = true;
    refreshProfileUI();
    loadPrefsIntoForm();
    renderProfileList();
    rerenderCurrentView();
    UI.toast(`Perfil "${StorageService.getActiveProfile().name}" ativo.`);
  }

  function handleCreateProfile(event) {
    event.preventDefault();
    const input = $('#profile-input');
    const name = input.value.trim();
    if (!name) { input.focus(); UI.toast('Dê um nome ao perfil.', { type: 'error' }); return; }
    const avatar = new FormData(event.target).get('avatar') || AVATARS[0];
    const profile = StorageService.createProfile(name, avatar);
    input.value = '';
    switchProfile(profile.id);
  }

  function renameProfile(id) {
    const item = $(`[data-action="rename-profile"][data-profile="${id}"]`).closest('.profile-item');
    const nameEl = $('.profile-item__name', item);
    const current = StorageService.getProfiles().find((p) => p.id === id);
    nameEl.innerHTML = `<form class="rename-form"><label class="sr-only" for="rename-${id}">Novo nome</label>
      <input id="rename-${id}" type="text" maxlength="20" value="${escapeHTML(current.name)}" required>
      <button class="btn btn--primary btn--small" type="submit">Salvar</button></form>`;
    const input = $('input', nameEl);
    input.focus();
    input.select();
    $('form', nameEl).addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      StorageService.updateProfile(id, { name });
      renderProfileList();
      refreshProfileUI();
      UI.toast('Perfil renomeado.');
    });
  }

  async function deleteProfile(id) {
    const profile = StorageService.getProfiles().find((p) => p.id === id);
    const ok = await UI.confirm({
      title: `Excluir o perfil "${profile.name}"?`,
      message: 'Favoritos, histórico, avaliações e preferências deste perfil serão apagados permanentemente.',
      confirmLabel: 'Excluir perfil'
    });
    if (!ok) return;
    const wasActive = id === StorageService.getActiveProfileId();
    StorageService.deleteProfile(id);
    if (wasActive) switchProfile(StorageService.getProfiles()[0].id);
    else renderProfileList();
    UI.toast('Perfil excluído.', { type: 'info' });
  }

  // ═════════════ 12. TEMA, AJUSTES, BACKUP E ATALHOS ═════════════
  function applyTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const isDark = theme === 'dark';
    const toggle = $('#theme-toggle');
    toggle.setAttribute('aria-pressed', String(!isDark));
    $('#theme-label').textContent = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
    toggle.title = `${isDark ? 'Tema claro' : 'Tema escuro'} (atalho: T)`;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', isDark ? '#0d0d12' : '#f6f5fa');
    if (save) StorageService.setTheme(theme);
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('theme-transition');
    applyTheme(next);
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400);
    UI.toast(next === 'dark' ? '🌙 Modo escuro ativado' : '☀️ Modo claro ativado', { type: 'info', duration: 1800 });
  }

  function openSettings() {
    const bytes = JSON.stringify(StorageService.exportAll()).length;
    $('#storage-status').textContent = StorageService.isAvailable()
      ? `✅ LocalStorage ativo · cerca de ${(bytes / 1024).toFixed(1)} KB usados.`
      : '⚠️ LocalStorage indisponível neste navegador.';
    UI.openDialog($('#settings-dialog'));
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(StorageService.exportAll(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cinematch-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    UI.toast('Backup baixado!');
  }

  function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        StorageService.importAll(JSON.parse(reader.result));
        refreshProfileUI();
        loadPrefsIntoForm();
        rerenderCurrentView();
        UI.toast('Backup importado com sucesso!');
      } catch (error) {
        UI.toast(`Não foi possível importar: ${error.message}`, { type: 'error' });
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  async function resetAll() {
    const ok = await UI.confirm({
      title: 'Apagar todos os dados?',
      message: 'Perfis, favoritos, histórico e avaliações serão removidos deste navegador. Esta ação não pode ser desfeita.',
      confirmLabel: 'Apagar tudo'
    });
    if (!ok) return;
    StorageService.resetAll();
    location.hash = '';
    location.reload();
  }

  /** Atalhos: 1–5 (abas), / (busca), T (tema), ? (ajuda). */
  function handleShortcuts(event) {
    const tag = event.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;

    if (/^[1-5]$/.test(event.key)) { location.hash = `#${ROUTES[Number(event.key) - 1]}`; }
    else if (event.key === '/') { event.preventDefault(); location.hash = '#explorar'; setTimeout(() => $('#search-input').focus(), 50); }
    else if (event.key.toLowerCase() === 't') { toggleTheme(); }
    else if (event.key === '?') { openSettings(); }
  }

  /** Setas do teclado dentro das estrelas (padrão WAI-ARIA de radiogroup). */
  function handleStarKeys(event) {
    const star = event.target.closest('.star');
    if (!star || !['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1;
    const next = Math.min(5, Math.max(1, Number(star.dataset.value) + delta));
    rate(star.dataset.id, next);
  }

  // ═════════════ EVENTOS ═════════════
  function bindEvents() {
    window.addEventListener('hashchange', handleRoute);

    // Formulário
    const form = $('#prefs-form');
    form.addEventListener('submit', handleRecommend);
    form.addEventListener('change', (e) => {
      updateSteps();
      if (e.target.name === 'mood') setFieldError('mood', '');
      if (e.target.name === 'genres') setFieldError('genres', '');
      if (e.target.name === 'age') setFieldError('age', '');
    });
    form.addEventListener('reset', () => setTimeout(() => { clearErrors(); updateSteps(); }, 0));
    $('#surprise-btn').addEventListener('click', handleSurprise);
    $('#reroll-btn').addEventListener('click', handleReroll);

    // Ações delegadas (cards, detalhes, histórico, perfis)
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const { action, id, profile } = target.dataset;
      switch (action) {
        case 'toggle-favorite': toggleFavorite(id); break;
        case 'details': openDetails(id); break;
        case 'rate': rate(id, Number(target.dataset.value)); break;
        case 'share': share(id); break;
        case 'reuse-prefs': reusePrefs(target.dataset.entry); break;
        case 'use-profile': switchProfile(profile); break;
        case 'rename-profile': renameProfile(profile); break;
        case 'delete-profile': deleteProfile(profile); break;
        default: break;
      }
    });
    document.addEventListener('keydown', handleStarKeys);
    document.addEventListener('keydown', handleShortcuts);

    // Explorar
    $('#search-input').addEventListener('input', debounce(renderLocalSearch, 180));
    $('#search-form').addEventListener('submit', handleOnlineSearch);
    $('#search-type').addEventListener('change', (e) => { state.searchType = e.target.value; renderLocalSearch(); });

    // Favoritos e histórico
    $('#fav-filter').addEventListener('change', renderFavorites);
    $('#fav-sort').addEventListener('change', renderFavorites);
    $('#clear-history-btn').addEventListener('click', clearHistory);

    // Cabeçalho
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#settings-btn').addEventListener('click', openSettings);
    $('#profile-btn').addEventListener('click', () => { renderProfileList(); UI.openDialog($('#profile-dialog')); });
    $('#profile-form').addEventListener('submit', handleCreateProfile);

    // Ajustes
    $('#export-btn').addEventListener('click', exportBackup);
    $('#import-input').addEventListener('change', importBackup);
    $('#reset-btn').addEventListener('click', resetAll);

    // Diálogos: botão fechar, clique fora e liberação da rolagem
    $$('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) { UI.closeDialog(dialog); return; }
        // Clique no fundo escurecido (fora da caixa do diálogo) também fecha
        const box = dialog.getBoundingClientRect();
        const outside = event.clientX < box.left || event.clientX > box.right
          || event.clientY < box.top || event.clientY > box.bottom;
        if (event.target === dialog && outside && event.clientX !== 0) UI.closeDialog(dialog);
      });
      dialog.addEventListener('close', () => {
        if (!document.querySelector('dialog[open]')) document.body.classList.remove('no-scroll');
      });
    });

    // Conexão
    window.addEventListener('offline', () => UI.toast('Você está offline. O catálogo e seus dados continuam funcionando.', { type: 'info' }));
    window.addEventListener('online', () => { UI.toast('Conexão restabelecida!'); loadPosters(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
