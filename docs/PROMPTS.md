# 🤖 Registro dos Prompts — Vibe Coding

Este documento registra os principais prompts utilizados no desenvolvimento do **CineMatch** com apoio de Inteligência Artificial (Claude, da Anthropic, via Claude Code).
Para cada prompt: **objetivo**, **prompt utilizado**, **resposta resumida da IA**, **como foi aplicado** e **adaptações realizadas**.

| # | Etapa | Prompt |
|---|---|---|
| 1 | Planejamento | [Planejamento e arquitetura do projeto](#prompt-1) |
| 2 | Dados | [Base de dados de filmes e séries (movies.js)](#prompt-2) |
| 3 | Interface | [Estrutura HTML semântica e acessível](#prompt-3) |
| 4 | Interface | [Design system e tema claro/escuro](#prompt-4) |
| 5 | Interface | [Layout responsivo (mobile-first)](#prompt-5) |
| 6 | Lógica | [Algoritmo de recomendação explicável](#prompt-6) |
| 7 | Persistência | [Camada de LocalStorage com perfis](#prompt-7) |
| 8 | Lógica | [Favoritos, histórico e feedback ao usuário](#prompt-8) |
| 9 | API | [Integração com APIs externas](#prompt-9) |
| 10 | Diferenciais | [Avaliação por estrelas e estatísticas](#prompt-10) |
| 11 | UX | [UX: heurísticas de Nielsen e acessibilidade](#prompt-11) |
| 12 | Entrega | [PWA, deploy no GitHub Pages e README](#prompt-12) |

---

## Prompt 1 — Planejamento e arquitetura do projeto <a id="prompt-1"></a>

**🎯 Objetivo:** Definir a arquitetura de pastas, a responsabilidade de cada arquivo e as funcionalidades extras antes de escrever código.

**💬 Prompt utilizado:**

> Atue como um desenvolvedor front-end sênior e professor. Vou criar o CineMatch, um recomendador de filmes e séries em HTML5, CSS3 e JavaScript puro (sem frameworks), com LocalStorage e hospedagem no GitHub Pages. Requisitos: RF01 selecionar preferências (gênero, faixa etária, tempo disponível e humor), RF02 gerar 3 recomendações, RF03/RF04 adicionar e remover favoritos, RF05 visualizar histórico, RF06 salvar dados localmente, além de tema claro/escuro. Proponha a arquitetura seguindo a estrutura index.html, css/style.css, js/app.js, js/movies.js, js/storage.js e assets/images, explicando a responsabilidade de cada arquivo e como os módulos se comunicam sem usar import/export (o app precisa abrir também com duplo clique no index.html). Por fim, liste funcionalidades extras que agreguem valor ao usuário.

**🧠 Resposta resumida da IA:** A IA propôs uma arquitetura em camadas — dados (movies.js), persistência (storage.js), regras de negócio, interface e controlador (app.js) — usando o padrão de módulo revelador (IIFE) que expõe um único objeto global por arquivo, carregados com o atributo defer na ordem de dependência. Sugeriu como extras: busca, integração com API de filmes, avaliações por estrelas, estatísticas, perfis de usuário e PWA.

**🛠️ Como foi aplicado:** Serviu de mapa para todo o projeto. Mantivemos os arquivos pedidos no roteiro e acrescentamos três módulos para deixar o código mais organizado: api.js (APIs externas), recommender.js (algoritmo) e ui.js (componentes visuais).

**✏️ Adaptações realizadas:** A IA havia sugerido chamar o módulo de persistência de "Storage", mas esse nome já existe no navegador (interface nativa Storage); renomeamos para StorageService. Também decidimos não usar ES Modules, pois eles não funcionam ao abrir o arquivo localmente (file://).

---

## Prompt 2 — Base de dados de filmes e séries (movies.js) <a id="prompt-2"></a>

**🎯 Objetivo:** Criar o catálogo local como array de objetos, com os campos necessários para recomendar por gênero, humor, idade e tempo.

**💬 Prompt utilizado:**

> Crie o arquivo movies.js do CineMatch com as constantes GENRES (com ícone), MOODS (8 humores com emoji, como "Animado", "Quero rir", "Pra baixo"), AGE_GROUPS baseados na Classificação Indicativa brasileira (L, 10, 12, 14, 16 e 18 anos) e TIME_OPTIONS (de 30 min a "sem pressa"). Depois crie o array MOVIES, em que cada objeto tem: id, title (nome no Brasil), original, type ("filme" ou "serie"), year, genres, moods, duration (para séries, a duração média do episódio), seasons, rating (0–10), age, emoji e uma sinopse curta e original em português. Misture clássicos, lançamentos recentes e produções brasileiras, equilibrando gêneros e faixas etárias.

**🧠 Resposta resumida da IA:** A IA gerou as constantes de domínio e um array inicial com cerca de 40 títulos no formato solicitado, comentando o significado de cada campo.

**🛠️ Como foi aplicado:** O arquivo virou a base do sistema de recomendação e da busca local. As constantes também passaram a gerar automaticamente os chips e selects do formulário, evitando repetir dados no HTML.

**✏️ Adaptações realizadas:** Ampliamos o catálogo para 75 títulos (50 filmes e 25 séries), conferimos manualmente notas, durações e classificações, reescrevemos sinopses e adicionamos o campo "wiki" (título da página na Wikipédia) para buscar pôsteres. Criamos um pequeno script de verificação que acusa ids repetidos e gêneros/humores inexistentes.

---

## Prompt 3 — Estrutura HTML semântica e acessível <a id="prompt-3"></a>

**🎯 Objetivo:** Montar o esqueleto da aplicação com HTML5 semântico, formulário acessível e todas as telas.

**💬 Prompt utilizado:**

> Crie o index.html do CineMatch com HTML5 semântico e acessível: header com logo, nav com as seções Descobrir, Explorar, Favoritos, Histórico e Estatísticas (navegação por hash, como uma SPA), main com uma section por tela e footer. Na tela Descobrir, crie um formulário com fieldset/legend para humor (radio), gêneros (checkbox), tipo de conteúdo, um select de faixa etária e o tempo disponível, além dos botões Recomendar, Surpreenda-me e Limpar, e uma área de resultados com aria-live. Use o elemento <dialog> para os detalhes do título, perfis, ajustes e confirmações. Inclua skip link, labels associados aos campos, atributos ARIA apenas onde forem necessários e lang="pt-BR".

**🧠 Resposta resumida da IA:** A IA entregou a página completa com header, nav, main e footer, seções com aria-labelledby, formulário com fieldsets e mensagens de erro por campo, área de resultados com aria-live e quatro diálogos nativos.

**🛠️ Como foi aplicado:** Estrutura usada integralmente como index.html.

**✏️ Adaptações realizadas:** Adicionamos um sprite SVG com os ícones (reutilizados via <use>) e um pequeno script no <head> que aplica o tema salvo antes da página ser desenhada, evitando o "piscar" entre claro e escuro. Validamos o HTML com o html-validate e corrigimos os 3 problemas apontados (aria-label em <span> e botões sem o atributo type).

---

## Prompt 4 — Design system e tema claro/escuro <a id="prompt-4"></a>

**🎯 Objetivo:** Criar uma identidade visual moderna, consistente e com dois temas, usando apenas CSS.

**💬 Prompt utilizado:**

> Crie o style.css do CineMatch com um visual moderno inspirado em plataformas de streaming. Use variáveis CSS (design tokens) para cores, raios, sombras e fontes; um tema escuro padrão e um tema claro ativado por [data-theme="light"] no elemento <html>; paleta com vermelho/coral em gradiente e fundo quase preto, respeitando contraste mínimo WCAG AA. Estilize chips de seleção (radio/checkbox escondidos visualmente, mas acessíveis por teclado), botões primário, secundário e "fantasma", cards de filme com pôster na proporção 2:3 e foco visível em todos os elementos interativos.

**🧠 Resposta resumida da IA:** A IA produziu os tokens de cor e tipografia para os dois temas, os componentes de botão, chip, card e painel, e o estado de foco com :focus-visible.

**🛠️ Como foi aplicado:** Seções 1 a 4 do style.css. O botão de tema apenas troca o atributo data-theme e salva a escolha no LocalStorage.

**✏️ Adaptações realizadas:** Trocamos o vermelho puro por um gradiente próprio (#ff2e55 → #ff7a3d), escurecemos a cor primária do tema claro (#d4113f) para atingir o contraste AA e criamos selos de classificação indicativa nas cores oficiais do Ministério da Justiça. A fonte Outfit foi usada nos títulos e Inter no texto.

---

## Prompt 5 — Layout responsivo (mobile-first) <a id="prompt-5"></a>

**🎯 Objetivo:** Garantir que o sistema funcione bem em celular, tablet e desktop.

**💬 Prompt utilizado:**

> Torne o layout do CineMatch responsivo com abordagem mobile-first e sem frameworks. No celular, a navegação deve virar uma barra fixa inferior com ícones, como nos aplicativos de streaming, e os cards de recomendação devem ficar na horizontal (pôster à esquerda, informações à direita). Defina breakpoints para tablet e desktop, use CSS Grid com auto-fill/minmax, garanta áreas de toque de no mínimo 44px e nenhuma rolagem horizontal.

**🧠 Resposta resumida da IA:** A IA reorganizou o CSS com estilos base para celular e media queries para ≥600px e ≥900px, grid automático para os cards e a barra de navegação inferior com position: fixed.

**🛠️ Como foi aplicado:** Seção 8 do style.css. Testamos em 375px (celular), 768px (tablet), 1024px e 1366px.

**✏️ Adaptações realizadas:** Nos testes, a barra inferior aparecia no topo da tela: o backdrop-filter do cabeçalho cria um novo bloco de contenção para elementos fixed. Resolvemos movendo o desfoque para um pseudo-elemento ::before. Também mudamos o breakpoint do desktop de 900px para 1024px, pois o menu sobrepunha o logo em notebooks pequenos.

---

## Prompt 6 — Algoritmo de recomendação explicável <a id="prompt-6"></a>

**🎯 Objetivo:** Implementar a lógica principal que escolhe as 3 sugestões e explica o porquê de cada uma.

**💬 Prompt utilizado:**

> Crie em JavaScript um arquivo recommender.js com um motor de recomendação que receba as preferências do usuário {humor, gêneros, tipo, faixa etária, tempo} e o array MOVIES e retorne as 3 melhores sugestões. Use pontuação ponderada (gênero 40%, humor 30%, nota 15%, tempo disponível 5%) convertida em "% de compatibilidade" e gere, para cada título, uma lista de motivos em português, como "Combina com seu humor: Animado". A classificação indicativa deve ser um filtro obrigatório. Se houver menos de 3 resultados, relaxe os outros filtros de forma progressiva e informe ao usuário quais foram relaxados.

**🧠 Resposta resumida da IA:** A IA criou as funções scoreItem (nota + motivos), basePool (filtros obrigatórios) e recommend (ordenação e relaxamento progressivo de tempo e tipo), retornando também a lista de filtros relaxados.

**🛠️ Como foi aplicado:** Núcleo do RF02. Os motivos aparecem no bloco "Por que indicamos?" de cada card e o aviso de filtros relaxados aparece acima dos resultados.

**✏️ Adaptações realizadas:** Incluímos um quinto critério, "aprendizado" (10%), calculado a partir das estrelas e dos favoritos do usuário; penalidades leves para títulos sugeridos recentemente; uma pequena variação aleatória e uma lista de exclusão para o botão "Gerar outras"; e a regra de que títulos avaliados com 1 ou 2 estrelas nunca mais são sugeridos.

---

## Prompt 7 — Camada de LocalStorage com perfis <a id="prompt-7"></a>

**🎯 Objetivo:** Centralizar a persistência e permitir vários perfis no mesmo navegador.

**💬 Prompt utilizado:**

> Crie um módulo storage.js que centralize todo o acesso ao LocalStorage do CineMatch: funções para ler e gravar JSON com try/catch, prefixo e versão nas chaves ("cinematch:v1:"), suporte a múltiplos perfis de usuário (cada perfil com suas preferências, favoritos, histórico e avaliações), limite de 20 sessões no histórico, exportação e importação de backup em JSON e um fallback em memória quando o LocalStorage estiver bloqueado pelo navegador.

**🧠 Resposta resumida da IA:** A IA entregou o StorageService com funções read/write genéricas, chaves por perfil no formato p:<perfil>:<dado>, CRUD de perfis e as funções exportAll, importAll e resetAll.

**🛠️ Como foi aplicado:** Atende ao RF06 e ao critério de LocalStorage: preferências, favoritos, histórico, avaliações, tema e perfis sobrevivem ao fechamento do navegador.

**✏️ Adaptações realizadas:** Tratamos o erro de cota cheia (QuotaExceededError) limpando o cache de pôsteres e tentando novamente; a exclusão de um perfil apaga todas as chaves com o prefixo dele; e definimos a regra de que nenhum outro arquivo acessa o localStorage diretamente.

---

## Prompt 8 — Favoritos, histórico e feedback ao usuário <a id="prompt-8"></a>

**🎯 Objetivo:** Implementar RF03, RF04 e RF05 com boa experiência de uso.

**💬 Prompt utilizado:**

> Implemente no app.js do CineMatch a lista de favoritos (adicionar e remover clicando no coração do card, contador no menu, ordenação e filtro por tipo) e o histórico de recomendações (cada sessão com data, preferências usadas e os títulos sugeridos). Toda ação deve gerar uma notificação "toast" acessível, remoções devem oferecer a opção "Desfazer" e limpar o histórico deve pedir confirmação.

**🧠 Resposta resumida da IA:** A IA criou as funções toggleFavorite, renderFavorites, saveHistory e renderHistory, além de um componente de toast com botão de ação e região aria-live.

**🛠️ Como foi aplicado:** Telas Favoritos e Histórico (linha do tempo) e componente UI.toast.

**✏️ Adaptações realizadas:** Os favoritos passaram a guardar uma "foto" do título, necessária para itens vindos da API; substituímos window.confirm por um <dialog> acessível; os corações são atualizados sem redesenhar a página; e cada sessão do histórico ganhou o botão "Usar estas preferências".

---

## Prompt 9 — Integração com APIs externas <a id="prompt-9"></a>

**🎯 Objetivo:** Consumir uma API de filmes (bonificação) sem expor chaves em um site público.

**💬 Prompt utilizado:**

> Quero consumir uma API de filmes no CineMatch sem expor chave de API, já que o site ficará público no GitHub Pages. Compare TMDb, OMDb, TVMaze e a API da Wikipédia quanto à necessidade de chave, suporte a CORS e qualidade dos dados. Depois crie um api.js com fetch e async/await que: (1) busque pôsteres para os títulos do catálogo em lote, com cache de 7 dias no LocalStorage; (2) pesquise filmes e séries pelo nome e converta os resultados para o mesmo formato dos objetos de movies.js; (3) use timeout com AbortController e trate erros sem travar a interface.

**🧠 Resposta resumida da IA:** A IA explicou que TMDb e OMDb exigem chave (que ficaria visível no código público) e recomendou a TVMaze para séries e a API MediaWiki (Wikipédia) para filmes, ambas gratuitas, sem chave e com CORS liberado. Entregou o código com fetchJSON (timeout), busca em lote de até 50 títulos por requisição e funções de conversão.

**🛠️ Como foi aplicado:** Pôsteres reais em todos os cards e a aba Explorar, que busca no catálogo e na internet ao mesmo tempo.

**✏️ Adaptações realizadas:** Ao testar, a Wikipédia em português não tinha pôster de 20 títulos; passamos a usar a versão em inglês com o parâmetro pilicense=any (100% dos filmes) e a TVMaze para as séries, escolhendo o resultado pelo ano de estreia. Os pôsteres agora aparecem de forma progressiva e usamos Promise.allSettled para que a falha de uma fonte não derrube a outra.

---

## Prompt 10 — Avaliação por estrelas e estatísticas <a id="prompt-10"></a>

**🎯 Objetivo:** Adicionar diferenciais sugeridos no roteiro: avaliações e estatísticas dos favoritos.

**💬 Prompt utilizado:**

> Adicione ao CineMatch: (a) avaliação de 1 a 5 estrelas no modal de detalhes, acessível por teclado (padrão radiogroup do WAI-ARIA, com setas esquerda/direita) e salva por perfil; (b) uma tela de Estatísticas com cartões de indicadores (total de favoritos, horas de filmes salvos, nota média, títulos avaliados e sessões), gráfico de barras dos gêneros favoritos, gráfico de rosca filmes × séries e humores mais usados — tudo apenas com HTML e CSS, sem bibliotecas de gráficos.

**🧠 Resposta resumida da IA:** A IA criou o componente starRating com role="radio" e tabindex itinerante, e a função renderStats, com barras feitas por largura percentual e a rosca com conic-gradient.

**🛠️ Como foi aplicado:** Modal de detalhes e aba Estatísticas.

**✏️ Adaptações realizadas:** Ligamos as avaliações ao algoritmo do prompt 6 (critério de aprendizado), criamos o "perfil cinéfilo" (ex.: "Viajante do Espaço") a partir do gênero mais frequente e deixamos os números visíveis ao lado das barras, para que o gráfico também seja compreensível por leitores de tela.

---

## Prompt 11 — UX: heurísticas de Nielsen e acessibilidade <a id="prompt-11"></a>

**🎯 Objetivo:** Revisar a usabilidade do sistema com base nas heurísticas de Nielsen, como pede o roteiro.

**💬 Prompt utilizado:**

> Analise a interface do CineMatch segundo as 10 heurísticas de usabilidade de Nielsen e as diretrizes WCAG 2.1 nível AA. Para cada heurística, aponte o que já está atendido e sugira melhorias concretas (mensagens de feedback, prevenção de erros, ajuda, atalhos, estados vazios). Sugira também animações e microinterações que melhorem a experiência sem prejudicar pessoas sensíveis a movimento.

**🧠 Resposta resumida da IA:** A IA devolveu uma tabela heurística por heurística com sugestões: validação por campo com foco no primeiro erro, indicador de etapas, skeleton durante o carregamento, estados vazios com ação, opção de desfazer, atalhos de teclado, uma tela de ajuda e respeito a prefers-reduced-motion.

**🛠️ Como foi aplicado:** Implementamos as sugestões: mensagens de erro por campo, etapas "1. Humor → 2. Gêneros → 3. Detalhes", skeletons, estados vazios ilustrados, atalhos (1–5, /, T, ?), diálogo "Como funciona", roleta animada do Surpreenda-me e animações desativadas para quem prefere menos movimento.

**✏️ Adaptações realizadas:** Descartamos a sugestão de um tutorial (onboarding) em várias telas, por ser excessivo para uma aplicação de uso rápido; no lugar, usamos textos de apoio curtos e a ajuda acessível pelo botão de ajustes.

---

## Prompt 12 — PWA, deploy no GitHub Pages e README <a id="prompt-12"></a>

**🎯 Objetivo:** Publicar o projeto no Git/GitHub Pages e documentá-lo.

**💬 Prompt utilizado:**

> Transforme o CineMatch em um PWA instalável com um manifest.webmanifest e um service worker com estratégia network-first, permitindo usar o catálogo offline. Depois me passe o passo a passo para versionar o projeto com Git, publicar no GitHub e hospedar no GitHub Pages, e escreva um README.md com descrição, link ativo da aplicação online, funcionalidades, tecnologias, estrutura de pastas, como executar localmente e créditos das APIs.

**🧠 Resposta resumida da IA:** A IA gerou o manifest, o sw.js (pré-cache dos arquivos e fallback para o cache quando offline), os comandos git init/add/commit/push, a configuração do GitHub Pages pela branch main e o README.

**🛠️ Como foi aplicado:** Aplicação instalável e publicada no GitHub Pages, com o link ativo no topo do README.

**✏️ Adaptações realizadas:** Limitamos o service worker às requisições do próprio site (as APIs externas seguem direto para a rede), registramos o SW apenas em http/https para não gerar erro ao abrir o arquivo localmente, geramos os ícones PNG a partir do SVG do logo e adicionamos capturas de tela ao README.

---

## 💭 Reflexão sobre o uso da IA

A IA acelerou muito a criação da estrutura e dos componentes, mas **nenhuma resposta foi usada sem revisão**. Os testes no navegador revelaram problemas que a IA não previu — a barra de navegação presa no topo por causa do `backdrop-filter`, a falta de pôsteres na Wikipédia em português e o conflito do nome `Storage` com a API nativa do navegador. Corrigi-los exigiu entender o código gerado. O resultado é um uso crítico e produtivo da IA: ela propõe, nós validamos, testamos e adaptamos.
