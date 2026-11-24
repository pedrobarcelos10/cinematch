/**
 * storage.js — Camada de persistência do CineMatch
 * ------------------------------------------------------------
 * Centraliza TODO acesso ao LocalStorage. Nenhum outro arquivo
 * chama localStorage diretamente: isso facilita manutenção,
 * tratamento de erros e o suporte a múltiplos perfis.
 *
 * Organização das chaves (prefixo "cinematch:v1:"):
 *   theme              → 'light' | 'dark'
 *   profiles           → [{ id, name, avatar, createdAt }]
 *   activeProfile      → id do perfil em uso
 *   cache:posters      → { [id]: { url, at } }  (cache da API)
 *   p:<perfil>:prefs      → preferências do formulário
 *   p:<perfil>:favorites  → lista de favoritos
 *   p:<perfil>:history    → sessões de recomendação
 *   p:<perfil>:ratings    → { [idTitulo]: estrelas (1–5) }
 *
 * Se o LocalStorage estiver indisponível (ex.: modo privado
 * bloqueado), os dados ficam em memória e o app continua
 * funcionando — o usuário apenas é avisado.
 */
const StorageService = (() => {
  const PREFIX = 'cinematch:v1:';
  const HISTORY_LIMIT = 20;
  const memoryFallback = {};
  const available = checkAvailability();

  /** Testa se o LocalStorage pode ser usado neste navegador. */
  function checkAvailability() {
    try {
      const testKey = PREFIX + '__test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /** Lê e converte um valor JSON. Retorna `fallback` em caso de erro. */
  function read(key, fallback) {
    const fullKey = PREFIX + key;
    try {
      const raw = available ? localStorage.getItem(fullKey) : memoryFallback[fullKey];
      return raw == null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn('[CineMatch] Dado corrompido em', fullKey, error);
      return fallback;
    }
  }

  /** Grava um valor como JSON. Retorna false se não for possível. */
  function write(key, value) {
    const fullKey = PREFIX + key;
    const raw = JSON.stringify(value);
    try {
      if (available) localStorage.setItem(fullKey, raw);
      else memoryFallback[fullKey] = raw;
      return true;
    } catch (error) {
      // QuotaExceededError: tenta liberar espaço limpando o cache da API.
      console.warn('[CineMatch] Falha ao salvar', fullKey, error);
      if (key !== 'cache:posters') {
        remove('cache:posters');
        try { localStorage.setItem(fullKey, raw); return true; } catch (e) { /* desiste */ }
      }
      return false;
    }
  }

  function remove(key) {
    const fullKey = PREFIX + key;
    if (available) localStorage.removeItem(fullKey);
    else delete memoryFallback[fullKey];
  }

  /** Lista todas as chaves do CineMatch (para exportar/limpar). */
  function allKeys() {
    const source = available ? Object.keys(localStorage) : Object.keys(memoryFallback);
    return source.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  }

  // ─────────────── Tema ───────────────
  const getTheme = () => read('theme', null);
  const setTheme = (theme) => write('theme', theme);

  // ─────────────── Perfis ───────────────
  function getProfiles() {
    let profiles = read('profiles', null);
    if (!Array.isArray(profiles) || profiles.length === 0) {
      profiles = [{ id: 'principal', name: 'Você', avatar: '🍿', createdAt: Date.now() }];
      write('profiles', profiles);
    }
    return profiles;
  }

  function getActiveProfileId() {
    const profiles = getProfiles();
    const active = read('activeProfile', null);
    return profiles.some((p) => p.id === active) ? active : profiles[0].id;
  }

  const getActiveProfile = () => getProfiles().find((p) => p.id === getActiveProfileId());
  const setActiveProfileId = (id) => write('activeProfile', id);

  function createProfile(name, avatar) {
    const profiles = getProfiles();
    const profile = { id: 'p' + Date.now().toString(36), name, avatar, createdAt: Date.now() };
    profiles.push(profile);
    write('profiles', profiles);
    return profile;
  }

  function updateProfile(id, changes) {
    const profiles = getProfiles().map((p) => (p.id === id ? { ...p, ...changes } : p));
    write('profiles', profiles);
  }

  /** Remove o perfil e todos os dados associados a ele. */
  function deleteProfile(id) {
    const profiles = getProfiles().filter((p) => p.id !== id);
    write('profiles', profiles);
    allKeys().filter((k) => k.startsWith(`p:${id}:`)).forEach(remove);
    if (read('activeProfile', null) === id) setActiveProfileId(profiles[0] ? profiles[0].id : null);
  }

  // ─────────────── Dados por perfil ───────────────
  const profileKey = (name) => `p:${getActiveProfileId()}:${name}`;

  const getPrefs = () => read(profileKey('prefs'), null);
  const savePrefs = (prefs) => write(profileKey('prefs'), prefs);

  const getFavorites = () => read(profileKey('favorites'), []);
  const saveFavorites = (list) => write(profileKey('favorites'), list);

  const getRatings = () => read(profileKey('ratings'), {});
  const saveRatings = (map) => write(profileKey('ratings'), map);

  const getHistory = () => read(profileKey('history'), []);
  const saveHistory = (list) => write(profileKey('history'), list);

  /** Adiciona uma sessão ao início do histórico, mantendo o limite. */
  function addHistoryEntry(entry) {
    const history = [entry, ...getHistory()].slice(0, HISTORY_LIMIT);
    saveHistory(history);
    return history;
  }

  // ─────────────── Cache da API ───────────────
  const getPosterCache = () => read('cache:posters', {});
  const savePosterCache = (cache) => write('cache:posters', cache);

  // ─────────────── Backup ───────────────
  /** Exporta todos os dados do CineMatch como objeto simples. */
  function exportAll() {
    const data = {};
    allKeys().filter((k) => !k.startsWith('cache:')).forEach((k) => { data[k] = read(k, null); });
    return { app: 'CineMatch', version: 1, exportedAt: new Date().toISOString(), data };
  }

  /** Importa um backup gerado por exportAll(). Lança erro se inválido. */
  function importAll(backup) {
    if (!backup || backup.app !== 'CineMatch' || typeof backup.data !== 'object') {
      throw new Error('Arquivo de backup inválido.');
    }
    Object.entries(backup.data).forEach(([key, value]) => write(key, value));
  }

  function resetAll() {
    allKeys().forEach(remove);
  }

  return {
    isAvailable: () => available,
    getTheme, setTheme,
    getProfiles, getActiveProfile, getActiveProfileId, setActiveProfileId,
    createProfile, updateProfile, deleteProfile,
    getPrefs, savePrefs,
    getFavorites, saveFavorites,
    getRatings, saveRatings,
    getHistory, saveHistory, addHistoryEntry,
    getPosterCache, savePosterCache,
    exportAll, importAll, resetAll
  };
})();
