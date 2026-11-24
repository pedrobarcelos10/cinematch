/**
 * recommender.js — Motor de recomendação do CineMatch
 * ------------------------------------------------------------
 * Algoritmo baseado em PONTUAÇÃO PONDERADA e EXPLICÁVEL:
 * cada título recebe uma nota de 0 a 1 (exibida como "% de
 * compatibilidade") e uma lista de motivos legíveis.
 *
 *   critério                     peso
 *   ─────────────────────────────────
 *   gêneros favoritos            40%
 *   humor do momento             30%
 *   nota do título               15%
 *   aprendizado (suas avaliações) 10%
 *   encaixe no tempo disponível   5%
 *
 * Filtros obrigatórios: classificação indicativa (nunca é
 * relaxada) e títulos que o usuário avaliou com 1–2 estrelas.
 * Se houver poucos resultados, o motor relaxa primeiro o tempo
 * e depois o tipo (filme/série) — e AVISA o usuário disso.
 */
const Recommender = (() => {
  const WEIGHTS = { genre: 0.40, mood: 0.30, rating: 0.15, learning: 0.10, time: 0.05 };

  const genreLabel = (id) => (GENRES.find((g) => g.id === id) || {}).label || id;
  const moodInfo = (id) => MOODS.find((m) => m.id === id);
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  /** O título é permitido para a faixa etária escolhida? */
  function ageAllowed(itemAge, ageGroupId) {
    const group = AGE_GROUPS.find((g) => g.id === ageGroupId);
    if (!group) return true;
    return AGE_ORDER.indexOf(itemAge) <= AGE_ORDER.indexOf(group.max);
  }

  /** Cabe no tempo? (para séries, considera a duração do episódio) */
  const fitsTime = (item, minutes) => !minutes || item.duration <= minutes;

  /**
   * "Aprendizado": calcula a afinidade do usuário com cada gênero
   * a partir das estrelas que ele deu e dos favoritos salvos.
   * Resultado: { genero: valor entre -1 (não gosta) e 1 (adora) }.
   */
  function buildAffinity(ratings, favorites) {
    const sums = {};
    const push = (genre, value) => {
      sums[genre] = sums[genre] || { total: 0, count: 0 };
      sums[genre].total += value;
      sums[genre].count += 1;
    };
    Object.entries(ratings).forEach(([id, stars]) => {
      const item = MOVIES.find((m) => m.id === id) || favorites.find((f) => f.id === id);
      if (item) item.genres.forEach((g) => push(g, (stars - 3) / 2));
    });
    favorites.forEach((fav) => (fav.genres || []).forEach((g) => push(g, 0.5)));
    return Object.fromEntries(Object.entries(sums).map(([g, s]) => [g, s.total / s.count]));
  }

  /** Monta o contexto do perfil usado em todas as pontuações. */
  function buildContext({ ratings = {}, favorites = [], history = [] }) {
    const recentIds = new Set(history.slice(0, 3).flatMap((h) => h.items.map((i) => i.id)));
    return {
      ratings,
      affinity: buildAffinity(ratings, favorites),
      favoriteIds: new Set(favorites.map((f) => f.id)),
      recentIds
    };
  }

  /** Calcula pontuação, % de compatibilidade e motivos de um título. */
  function scoreItem(item, prefs, ctx) {
    const reasons = [];

    // 1) Gêneros
    const hits = item.genres.filter((g) => prefs.genres.includes(g));
    let genreScore = 0.5;
    if (prefs.genres.length) genreScore = hits.length === 0 ? 0 : hits.length === 1 ? 0.8 : 1;
    if (hits.length) reasons.push({ icon: '🎯', text: `Gênero que você curte: ${hits.map(genreLabel).join(', ')}` });

    // 2) Humor
    const mood = moodInfo(prefs.mood);
    const moodScore = !prefs.mood ? 0.5 : item.moods.includes(prefs.mood) ? 1 : 0;
    if (mood && moodScore === 1) reasons.push({ icon: mood.icon, text: `Combina com seu humor: ${mood.label}` });

    // 3) Nota (6.0 → 0 | 10 → 1)
    const ratingScore = clamp((item.rating - 6) / 4);
    if (item.rating >= 8.5) reasons.push({ icon: '⭐', text: `Aclamado por público e crítica (nota ${item.rating.toFixed(1)})` });

    // 4) Aprendizado com as avaliações do usuário
    const affinities = item.genres.map((g) => ctx.affinity[g]).filter((v) => v !== undefined);
    const affinity = affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;
    const learningScore = (affinity + 1) / 2;
    if (affinity >= 0.3) reasons.push({ icon: '🧠', text: 'Parecido com títulos que você avaliou bem' });

    // 5) Tempo
    const timeScore = fitsTime(item, prefs.time) ? 1 : 0;
    if (prefs.time && timeScore) {
      reasons.push(item.type === 'serie'
        ? { icon: '⏱️', text: `Episódios de ${item.duration} min — dá para ver ${Math.max(1, Math.floor(prefs.time / item.duration))} no seu tempo` }
        : { icon: '⏱️', text: `Cabe no seu tempo (${UI.formatDuration(item.duration)})` });
    } else if (prefs.time && !timeScore) {
      reasons.push({ icon: '⚠️', text: `Passa um pouco do seu tempo (${UI.formatDuration(item.duration)})` });
    }

    let score = WEIGHTS.genre * genreScore + WEIGHTS.mood * moodScore + WEIGHTS.rating * ratingScore
      + WEIGHTS.learning * learningScore + WEIGHTS.time * timeScore;

    // Penalidades leves para variar as sugestões
    if (ctx.recentIds.has(item.id)) score -= 0.12;
    if (ctx.favoriteIds.has(item.id)) {
      score -= 0.08;
      reasons.push({ icon: '❤️', text: 'Já está nos seus favoritos' });
    }

    return { item, score, compat: Math.round(clamp(score) * 100), reasons };
  }

  /** Remove títulos inadequados para a idade e os que o usuário não gostou. */
  function basePool(prefs, ctx, exclude = []) {
    return MOVIES.filter((m) => ageAllowed(m.age, prefs.age)
      && !(ctx.ratings[m.id] && ctx.ratings[m.id] <= 2)
      && !exclude.includes(m.id));
  }

  /**
   * Gera as recomendações.
   * @returns {{ results: Array, relaxed: string[] }}
   */
  function recommend(prefs, ctx, { count = 3, exclude = [] } = {}) {
    const relaxed = [];
    const base = basePool(prefs, ctx, exclude);
    const matchesType = (m) => prefs.type === 'todos' || m.type === prefs.type;
    const relevant = (m) => m.genres.some((g) => prefs.genres.includes(g)) || m.moods.includes(prefs.mood);

    let pool = base.filter((m) => matchesType(m) && fitsTime(m, prefs.time) && relevant(m));
    if (pool.length < count) {
      relaxed.push('tempo');
      pool = base.filter((m) => matchesType(m) && relevant(m));
    }
    if (pool.length < count) {
      relaxed.push('tipo');
      pool = base.filter(relevant);
    }
    if (pool.length < count) pool = base;

    const results = pool
      .map((item) => scoreItem(item, prefs, ctx))
      .map((r) => ({ ...r, rank: r.score + Math.random() * 0.04 })) // pequena variação
      .sort((a, b) => b.rank - a.rank)
      .slice(0, count);

    return { results, relaxed };
  }

  /** "Surpreenda-me": sorteia entre os 12 melhores títulos para o perfil. */
  function surprise(prefs, ctx) {
    const neutralPrefs = { ...prefs, genres: [], mood: null, time: 0 };
    const ranked = basePool(prefs, ctx)
      .map((item) => scoreItem(item, neutralPrefs, ctx))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    const pick = ranked[Math.floor(Math.random() * ranked.length)];
    return pick ? scoreItem(pick.item, prefs, ctx) : null;
  }

  return { recommend, surprise, buildContext, ageAllowed };
})();
