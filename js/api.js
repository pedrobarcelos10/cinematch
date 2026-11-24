/**
 * api.js — Integração com APIs externas
 * ------------------------------------------------------------
 * O CineMatch consome duas APIs públicas, gratuitas e que não
 * exigem chave (funcionam direto no GitHub Pages, via CORS):
 *
 *  • Wikipédia (MediaWiki Action API)
 *      - pôsteres do catálogo local, buscados EM LOTE (até 50
 *        títulos por requisição) para economizar chamadas;
 *      - busca de filmes na aba "Explorar" (resumo em português).
 *  • TVMaze API
 *      - busca de séries na aba "Explorar";
 *      - pôsteres verticais das séries do catálogo.
 *
 * Boas práticas aplicadas:
 *  - timeout com AbortController (a interface nunca "trava");
 *  - cache dos pôsteres no LocalStorage (validade de 7 dias);
 *  - conversão dos dados externos para o MESMO formato dos
 *    objetos de movies.js, assim o restante do app não precisa
 *    saber de onde o título veio.
 */
const ApiService = (() => {
  const WIKI_EN = 'https://en.wikipedia.org/w/api.php';
  const WIKI_PT = 'https://pt.wikipedia.org/w/api.php';
  const TVMAZE = 'https://api.tvmaze.com';
  const TIMEOUT_MS = 8000;
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 dias
  const MISS_TTL = 24 * 60 * 60 * 1000;         // tenta de novo após 1 dia

  /** Mapeia gêneros da TVMaze (inglês) para os ids do CineMatch. */
  const TVMAZE_GENRES = {
    Action: 'acao', Adventure: 'aventura', Anime: 'animacao', Comedy: 'comedia',
    Crime: 'crime', Drama: 'drama', Family: 'familia', Children: 'familia',
    Fantasy: 'fantasia', 'Science-Fiction': 'ficcao', Romance: 'romance',
    Thriller: 'suspense', Mystery: 'suspense', Horror: 'terror',
    Supernatural: 'fantasia', Nature: 'documentario', History: 'documentario'
  };

  /** Palavras-chave para inferir gêneros a partir do resumo da Wikipédia. */
  const KEYWORD_GENRES = [
    [/ficção científica/i, 'ficcao'], [/animaç/i, 'animacao'], [/comédia/i, 'comedia'],
    [/terror/i, 'terror'], [/suspense|thriller/i, 'suspense'], [/romance|romântic/i, 'romance'],
    [/drama/i, 'drama'], [/aventura/i, 'aventura'], [/fantasia/i, 'fantasia'],
    [/ação/i, 'acao'], [/documentário/i, 'documentario'], [/policial|crime|máfia/i, 'crime'],
    [/familiar|infantil/i, 'familia']
  ];

  /** fetch + JSON com tempo limite. */
  async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('A consulta demorou demais. Verifique sua conexão.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stripHTML = (html) => (html || '').replace(/<[^>]*>/g, '').trim();
  const httpsUrl = (url) => (url ? url.replace(/^http:/, 'https:') : null);

  /** Monta uma URL da MediaWiki API com CORS anônimo (origin=*). */
  function wikiUrl(base, params) {
    const query = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
    return `${base}?${query}`;
  }

  /**
   * Consulta pôsteres de vários títulos da Wikipédia em lotes de 50.
   * Retorna { tituloDaPagina: urlDaImagem }.
   */
  async function wikiThumbnails(base, titles) {
    const result = {};
    for (let i = 0; i < titles.length; i += 50) {
      const chunk = titles.slice(i, i + 50);
      const data = await fetchJSON(wikiUrl(base, {
        action: 'query', redirects: '1', prop: 'pageimages', piprop: 'thumbnail',
        pithumbsize: '500', pilimit: '50', pilicense: 'any', titles: chunk.join('|')
      }));
      const query = data.query || {};
      // A API pode "normalizar" ou redirecionar títulos: seguimos o caminho.
      const normalized = Object.fromEntries((query.normalized || []).map((n) => [n.from, n.to]));
      const redirects = Object.fromEntries((query.redirects || []).map((r) => [r.from, r.to]));
      const pages = Object.fromEntries((query.pages || []).map((p) => [p.title, p]));
      chunk.forEach((title) => {
        let key = normalized[title] || title;
        key = redirects[key] || key;
        const page = pages[key];
        if (page && page.thumbnail) result[title] = page.thumbnail.source;
      });
    }
    return result;
  }

  /**
   * Retorna { idDoTitulo: urlDoPoster } para os títulos do catálogo.
   * Usa o cache sempre que possível e só consulta o que falta.
   * @param {Function} [onProgress] chamado com resultados parciais, para a
   *                                interface já exibir os pôsteres que chegaram.
   */
  async function getPosters(items, onProgress = () => {}) {
    const cache = StorageService.getPosterCache();
    const now = Date.now();
    const isFresh = (entry) => entry && now - entry.at < (entry.url ? CACHE_TTL : MISS_TTL);
    const toMap = () => Object.fromEntries(Object.entries(cache).filter(([, v]) => v.url).map(([id, v]) => [id, v.url]));
    const missing = items.filter((item) => item.wiki && !isFresh(cache[item.id]));

    if (missing.length > 0) {
      // 1) Wikipédia em lote (filmes; para séries serve de reserva)
      const thumbs = await wikiThumbnails(WIKI_EN, missing.map((m) => m.wiki));
      missing.forEach((item) => { cache[item.id] = { url: thumbs[item.wiki] || null, at: now }; });
      StorageService.savePosterCache(cache);
      onProgress(toMap());

      // 2) Séries → TVMaze, que tem pôsteres verticais. O resultado certo é
      //    escolhido pelo ano de estreia (evita confundir remakes/homônimos).
      //    Pequena pausa entre chamadas para respeitar o limite da API.
      const series = missing.filter((m) => m.type === 'serie');
      for (const serie of series) {
        try {
          const results = await fetchJSON(`${TVMAZE}/search/shows?q=${encodeURIComponent(serie.original)}`);
          const shows = results.map((r) => r.show);
          const show = shows.find((s) => s.premiered && Math.abs(Number(s.premiered.slice(0, 4)) - serie.year) <= 1) || shows[0];
          const url = show && show.image ? httpsUrl(show.image.medium) : null;
          if (url) cache[serie.id] = { url, at: now };
        } catch (error) { /* mantém o pôster da Wikipédia ou a capa alternativa */ }
        await wait(120);
      }
      StorageService.savePosterCache(cache);
    }

    return toMap();
  }

  /** Busca séries na TVMaze e converte para o formato do CineMatch. */
  async function searchSeries(term) {
    const results = await fetchJSON(`${TVMAZE}/search/shows?q=${encodeURIComponent(term)}`);
    return results.slice(0, 8).map(({ show }) => ({
      id: `tvmaze-${show.id}`,
      title: show.name,
      original: show.name,
      type: 'serie',
      year: show.premiered ? Number(show.premiered.slice(0, 4)) : null,
      genres: [...new Set((show.genres || []).map((g) => TVMAZE_GENRES[g]).filter(Boolean))],
      moods: [],
      duration: show.averageRuntime || show.runtime || null,
      rating: show.rating && show.rating.average ? show.rating.average : null,
      age: null,
      poster: httpsUrl(show.image && show.image.medium),
      synopsis: stripHTML(show.summary) || 'Sinopse não disponível.',
      synopsisLang: 'en',
      emoji: '📺',
      source: 'TVMaze',
      link: show.url
    }));
  }

  /** Busca filmes na Wikipédia em português (com pôster da versão em inglês, se faltar). */
  async function searchMovies(term) {
    const data = await fetchJSON(wikiUrl(WIKI_PT, {
      action: 'query', generator: 'search', gsrsearch: `${term} filme`, gsrlimit: '10',
      prop: 'pageimages|extracts|description|langlinks', piprop: 'thumbnail', pithumbsize: '400',
      pilicense: 'any', exintro: '1', explaintext: '1', exsentences: '3', exlimit: '10',
      lllang: 'en', lllimit: '10'
    }));
    const pages = ((data.query && data.query.pages) || [])
      .filter((p) => /filme/i.test(`${p.description || ''} ${p.extract || ''}`.slice(0, 300)))
      .sort((a, b) => a.index - b.index)
      .slice(0, 8);

    // Pôster: se a página em português não tiver, tenta a página equivalente em inglês.
    const enTitles = pages.filter((p) => !p.thumbnail && p.langlinks).map((p) => p.langlinks[0].title);
    const enThumbs = enTitles.length ? await wikiThumbnails(WIKI_EN, enTitles).catch(() => ({})) : {};

    return pages.map((page) => {
      const text = `${page.description || ''} ${page.extract || ''}`;
      const yearMatch = text.match(/\b(19[2-9]\d|20[0-4]\d)\b/);
      const enTitle = page.langlinks && page.langlinks[0] ? page.langlinks[0].title : null;
      return {
        id: `wiki-${page.pageid}`,
        title: page.title.replace(/\s*\((filme|.*filme.*)\)$/i, ''),
        original: enTitle || page.title,
        type: 'filme',
        year: yearMatch ? Number(yearMatch[1]) : null,
        genres: KEYWORD_GENRES.filter(([regex]) => regex.test(text.slice(0, 400))).map(([, g]) => g).slice(0, 3),
        moods: [],
        duration: null,
        rating: null,
        age: null,
        poster: page.thumbnail ? page.thumbnail.source : (enThumbs[enTitle] || null),
        synopsis: page.extract || 'Resumo não disponível.',
        synopsisLang: 'pt',
        emoji: '🎬',
        source: 'Wikipédia',
        link: `https://pt.wikipedia.org/?curid=${page.pageid}`
      };
    });
  }

  /**
   * Busca online combinando as duas fontes em paralelo.
   * Uma fonte falhar não impede a outra de exibir resultados.
   */
  async function searchOnline(term, type = 'todos') {
    const tasks = [];
    if (type !== 'serie') tasks.push(searchMovies(term));
    if (type !== 'filme') tasks.push(searchSeries(term));
    const settled = await Promise.allSettled(tasks);
    const items = settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value);
    const failed = settled.filter((s) => s.status === 'rejected');
    if (items.length === 0 && failed.length > 0) throw failed[0].reason;
    return items;
  }

  return { getPosters, searchOnline };
})();
