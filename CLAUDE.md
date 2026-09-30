# TRETA PARTY — contexto do projeto

Party game web 3D, jogável no navegador, inspirado na **estrutura** dos minigames de Crash Bash (Ballistix), com identidade 100% original. Nada de personagens, nomes, logos, sons ou texturas de Crash, Naughty Dog ou Activision. Tudo (modelos, texturas, áudio) é procedural: não há assets externos.

- **Minigame 01: Bolada!** 4 jogadores (1 humano + até 3 bots), cada um defende um gol na borda de uma arena circular.
- UI e textos em **português do Brasil**.
- Stack: **Vite 5 + Three.js 0.170**, JS puro (ES modules), sem framework de UI.
- Prioridade do dono do projeto: gameplay > controles > física > bots > câmera > feedback > UI > polimento > áudio.

## Comandos

```
npm install
npm run dev            # desenvolvimento
npm run test:sim       # partidas headless só de bots (valida física, regras, balanceamento)
npm run build          # build normal (dist/)
npm run build:single   # HTML único com tudo inline (dist-single/) — requer vite.config.js, ver pendências
```

## Status

**Pronto e testado (headless):** simulação + bots. `npm run test:sim` passa os 6 critérios:
- Difícil vence 30/30 contra três Fáceis.
- Difícil vence ~2/3 no 1v1 contra Normal; Normal vence 30/30 no 1v1 contra Fácil.
- Jogador parado nunca vence.
- Partida de 4 com 10 pontos dura ~95s.

**Escrito, mas NUNCA rodado no navegador:** engine, personagens, arena, view, minigame, GameManager, UI, HUD. Espere bugs de integração, erros de digitação e iluminação/cores precisando de ajuste.

**Falta escrever:** `src/main.js`, `src/styles/main.css`, `index.html`, `vite.config.js`, `README.md` (specs abaixo).

## Arquitetura

```
src/
  engine/            reutilizável por qualquer minigame
    Engine.js          renderer (NoToneMapping, sRGB), cena, câmera, loop, onResize(w, h, bufferHeight)
    CameraRig.js       modos 'game' (fit automático da arena a qualquer aspecto) e 'orbit'; trauma shake, punch de FOV, viewShift
    Input.js           teclado + gamepad (layout W3C, Xbox/PS) + toque → getPlayer(slot) = { x, y, action, dash }
    Audio.js           WebAudio procedural: play(nome, opts), trilha em loop com scheduler, duck(), unlock()
    Particles.js       Points + ShaderMaterial, pool; emit({...}); cores sRGB cruas (hexToRgb)
    Effects.js         anéis de onda de choque
    Backdrop.js        céu crepúsculo (shader), estrelas, nuvens, ilhotas, planeta
    toon.js            toon(color), withOutline(mesh) (casco invertido), blobShadow(), disposeTree()
    math.js            clamp, lerp, damp, wrapAngle, mulberry32, rayCircleExit, hexToCss...
  game/
    Minigame.js        CONTRATO de todo minigame (setup/start/update/isFinished/getHud/getLabels/getCameraFocus/getResults/dispose + static meta)
    GameManager.js     máquina de estados: menu (demo ao vivo no fundo) → countdown → playing ⇄ paused → result
    GameState.js       settings + lastConfig em localStorage ('treta-party:v1')
  characters/
    characters.js      4 personagens originais (Faísca, Broto, Parafuso, Glub)
    CharacterModel.js  modelo por primitivas dentro de um pod voador + CharacterAnimator (idle, lean, olhar, ataque, dano, vitória)
    portraits.js       renderiza retratos em canvas offscreen → dataURL (usados na UI)
  minigames/
    index.js           REGISTRO: MINIGAMES = [BoladaMinigame]; COMING_SOON
    bolada/
      config.js        todo o tuning (velocidades, pulso, bolas, spawn)
      BoladaSim.js     simulação 2D pura, SEM Three.js; roda em Node
      BoladaBot.js     IA dos bots (perfis easy/normal/hard)
      BoladaArena.js   visual estático/animado da arena
      BoladaView.js    liga sim → 3D; converte eventos em partículas, som, câmera, textos
      BoladaMinigame.js  cola: passo fixo, input humano, bots, hitstop/câmera lenta/acelerar
  ui/
    UI.js              telas DOM: main, setup, howto, settings, pause, result
    HUD.js             painéis por jogador, cronômetro, rótulos 3D, floatText, banner, countdown, toque
test/sim.test.mjs
```

### Fluxo de dados (Bolada)

1. `BoladaMinigame.update(dt)` acumula tempo e roda `_fixed(1/120)`. A simulação usa 4 subpassos por passo.
2. Em cada passo: bots e humano produzem `inputs[seat] = { move, pulse, dash }`, depois `view.capturePrev()`, depois `sim.step()`, e os eventos vão para `sim.drainEvents()` → `view.handleEvents(events, minigame)`.
3. Eventos da sim:
   - `dash`, `pulse`, `pulseHit{super}`
   - `bounce{kind: reactor|pillar|post|pod|wall|ball}`
   - `launchWarn`, `launch`
   - `goal{seat, value, scorer}`, `eliminate{place}`
   - `timeUp`, `suddenDeath`, `ballPop`, `end{winner}`
4. A view interpola posições (prev → atual) com `alpha = acc / FIXED_STEP`.
5. Juice: `minigame.hitstop(t)` e `minigame.slowmo(scale, t)`. Enter acelera ×3 quando o humano já foi eliminado.

### Convenções importantes

- **Coordenadas:** o plano de jogo é XZ; posição = `(cos a, sin a) * raio`. **+z aponta para a câmera.**
- **Assentos:**
  - 0 = sul (π/2, humano), 1 = leste (0), 2 = norte (−π/2), 3 = oeste (π).
  - Por número de jogadores: 2 → [0, 2]; 3 → [0, 1, 3]; 4 → [0, 1, 2, 3].
  - Assento vazio ou eliminado = gol selado por parede.
- **Pod:** anda no trilho (`railRadius` 8.85) via `off` (rad, relativo ao centro do gol).
  - `move > 0` aumenta `off`.
  - O input de tela vira tangencial em `BoladaMinigame._fixed`: `move = x*tx + (-y)*tz`. Isso serve para qualquer assento (multiplayer local).
- **Modelos:** olham para **+z local**. Para ficarem de frente para o centro, `rotation.y = atan2(-x, -z)`.
- **`rotation.y = ψ` leva o ângulo de mundo α para α − ψ.** Por isso seta e canhão usam `rotation.y = -aim`.
- **Setores e cortinas:** geometria construída direto em XZ (`sectorGeometry`, `curtainGeometry`) para evitar confusão de rotação. Paredes: `ExtrudeGeometry` + `rotateX(+π/2)` + `translate(0, altura, 0)`.
- **GLSL:** nunca usar `smoothstep` com edge0 > edge1; usar `1.0 - smoothstep(a, b, x)`.
- **ShaderMaterial:** recebe cores sRGB cruas (sem conversão de color space).
- **Nova regra de jogo:** entra em `BoladaSim` e emite evento; o feedback vai só em `BoladaView`.

## Mecânica (resumo)

- Movimento só lateral no trilho, com aceleração e frenagem rápidas.
- **Espaço** = pulso de curto alcance (2.35).
  - Arremessa a bola na direção pod → bola, sempre para dentro da arena. A mira vem do posicionamento.
  - Pulso com a bola quase encostando (gap < 0.45) = **SUPER** (23 u/s, hitstop, "SUPER!").
- **Shift** = dash. O corpo do pod também rebate passivamente, adicionando efeito com a velocidade do pod.
- **Lançador central:** mostra uma seta de aviso por 0.8s antes de cada disparo.
  - Mira mais em quem tem mais pontos (catch-up).
  - O número de bolas cresce com o tempo.
  - Bolas-bomba (valem 2) a partir de 35s.
- Pilares-bumper nas divisórias e reator central dão boost.
- **Pontos e fim de partida:**
  - Pontos iniciais 5/10/15. Zerou → eliminado, gol vira parede, pod voa para o abismo.
  - Tempo 2:00, 3:00 ou sem limite. No fim do tempo, quem tem menos pontos sai; empate no topo → **morte súbita** (todos com 1 ponto).

## Bots (dificuldade por comportamento, mesma física/velocidade)

- **Fácil:** persegue a posição atual da bola (não prevê), reação 0.42s, erro grande, pulso afobado/ausente, distrai.
- **Normal:** prevê o ponto onde a bola cruza o trilho, reação 0.22s.
- **Difícil:**
  - Prevê 1 ricochete, reação 0.09s.
  - Espera a bola encostar para dar super.
  - Posiciona-se para mirar no gol do adversário com menos pontos.
  - Usa dash e lê a seta do lançador para se antecipar.

## Direção visual

- 3D cartoon: MeshToonMaterial com rampa de 4 tons + contorno "tinta" (INK `#1a1033`) por casco invertido e sombras blob, sem shadow maps.
- Arena flutuante no céu de crepúsculo:
  - Chão azul-violeta com textura canvas; gols com cortina de energia na cor do jogador.
  - Atrás do gol é o vazio: a bola cai no abismo.
  - Paredes creme com topo rosa, pilares amarelos, reator com canhão rosa.
  - Arquibancadas flutuantes com torcida instanciada, 2 torres de luz no fundo.
- Cores dos personagens:
  - Faísca `#ff6b3d`
  - Broto `#49d35e`
  - Parafuso `#2fb0ff`
  - Glub `#b46bff`
- UI estilo **"adesivo"**: contorno ink grosso + sombra dura deslocada (combina com o contorno toon do 3D).
- Tokens da UI:
  - plum `#1d0f4a` (fundo)
  - ink `#1a1033`
  - coral `#ff8a6b`
  - sun `#ffd23f` (botão primário)
  - candy `#ff4f8b`
  - lilac `#efe8ff` (painéis — NÃO usar creme tipo `#F4F1EA`)
  - mint `#7fe0d0` (foco)
- Fontes (Google Fonts), com fallback `'Trebuchet MS', system-ui, sans-serif`:
  - **Titan One** (display)
  - **Baloo 2** 500/700/800 (UI)
- Contorno de texto grande via `text-shadow` em 8 direções (não depender de `paint-order`).
- **Menu principal:** alinhado à esquerda, com a demo ao vivo à direita. `rig.viewShiftTarget = 0.17` em telas largas empurra a arena para a direita.
- Um único momento de animação marcante: o logo "TRETA PARTY" com pop. Nada de fade-slide em tudo.
- Respeitar `prefers-reduced-motion`, ter foco visível e ser responsivo. Controles de toque aparecem em `pointer: coarse`.

## PENDÊNCIAS (fazer nesta ordem)

### 1. `index.html`
- `lang="pt-BR"`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`.
- Link do Google Fonts: Titan One + Baloo 2 (500, 700, 800).
- `<div id="app"></div><div id="ui"></div>` e `<script type="module" src="/src/main.js">`.

### 2. `vite.config.js`
- `base: './'`.
- Com `mode === 'single'`: usar `viteSingleFile()` (já está em devDependencies) e `outDir: 'dist-single'`.
- `build.target: 'es2022'`: há `static` class fields.

### 3. `src/main.js` (wiring)
1. `import './styles/main.css'`.
2. `state = new GameState()`. Se não havia save e o usuário prefere reduced motion, fazer `settings.shake = false`.
3. Criar os módulos:
   - `engine = new Engine(#app, { quality })`
   - `audio = new AudioManager()`
   - `input = new Input()`
   - `backdrop = new Backdrop(engine.scene)`
   - `particles = { sparks: new ParticleSystem(scene, { max: 1600, additive: true }), dust: new ParticleSystem(scene, { max: 1200 }) }`
   - `fx = new Effects(scene)`
   - `rig = new CameraRig(engine.camera)`
4. `portraits = renderPortraits(CHARACTERS)`.
5. UI e HUD:
   - `ui = new UI(#ui, { state, portraits, audio })`
   - `hud = new HUD(#ui, { camera: engine.camera, portraits, audio, input })`
6. `engine.onResize.push((w, h, bufH) => { rig.fit(w / h); particles.*.setViewport(bufH, rig.baseFov); gm.onResize(); })`.
7. Criar `gm = new GameManager({ engine, rig, ui, hud, audio, input, state, particles, fx, backdrop })`.
8. Ligar callbacks: `ui.onAction = gm.onAction.bind(gm)` e `hud.onPause = () => gm.pause()`.
9. Chamar `engine._resize()` **depois** de registrar o onResize, e então `gm.boot()`.
10. Destravar o áudio: `audio.unlock()` no primeiro `pointerdown`/`keydown` (é idempotente, pode deixar o listener).
11. `visibilitychange` → `gm.pause()` se a aba ficar oculta durante a partida.
12. Loop: `engine.start(dt => { input.poll(); gm.update(dt); input.endFrame(); })`.
13. Expor `window.__treta = { gm, engine }` para testes.

### 4. `src/styles/main.css` — classes que UI.js e HUD.js já usam

- **Base:**
  - `html, body` com altura 100%, sem scroll, fundo plum.
  - `#app` fixo cobrindo a tela.
  - `#ui` fixo, `pointer-events: none` e fonte UI.
  - `.screens.on` e `.tbtn`/botões recebem `pointer-events: auto`.
  - Safe areas via `env(safe-area-inset-*)`.
- **Telas:**
  - Estrutura: `.screen`, `.screen--main` (gradiente escuro da esquerda para ler o menu), `.screen--panel`, `.screen--center`, `.screen--result`.
  - Menu: `.menu-col`, `.logo`, `.logo-1` (coral), `.logo-2` (sun), `.badge`, `.menu-buttons`, `.menu-foot`.
  - Botões: `.btn`, `.btn--primary`, `.btn--xl`, `.btn--ghost`, com sombra dura, `:hover` subindo, `:active` afundando e `:focus-visible` mint.
  - Painéis: `.panel`, `.panel--setup`, `.panel--howto`, `.panel--settings`, `.panel--pause`, `.panel--result`, `.panel-head`, `.panel-foot`, `.stack`.
  - Setup: `.field`, `.field-grid`, `.field--wide`, `.hint`, `.mg-row`, `.mg-card` (`.is-on`, `.is-soon`), `.mg-num`.
  - Personagens: `.char-grid`, `.char` (`[aria-pressed=true]`, usa `--c`), `.char-name`, `.char-sp`.
  - Opções: `.seg`, `.opt` (`[aria-pressed=true]` = sun).
  - Como jogar: `.howto` (grid SVG + texto), `.diagram`, `.howto-text`, `.lead`, `.keys`, `kbd`, `.small`, `.rules`.
  - Configurações: `.set-row`.
  - Resultado: `.result-kicker`, `.winner` (usa `--c`), `.ranking`, `.rank`, `.rank-place`, `.rank-who`, `.rank-stats`, `.result-buttons`, `em` (etiqueta "você").
- **HUD:**
  - Estrutura: `.hud` (`[hidden]` some) e `.hud--touch` (painéis de baixo sobem para o topo).
  - Cronômetro: `.hud-timer` (`.danger` pulsa, `.sudden` vermelho) e `.hud-pause` (visível só no toque).
  - Cantos: `.hud-corner--tl/tr/bl/br`.
  - Painel por jogador:
    - `.pl`: grid rosto/info/pontos, usa `--c`; estados `.hit` (tremida), `.danger`, `.is-out` (cinza + carimbo `.pl-out`), `.is-winner`.
    - Partes: `.pl-face`, `.pl-info`, `.pl-name`, `.pl-pts`.
    - `.pl-pips i` e `i.lost` (bolinhas de pontos).
  - Rótulos 3D: `.hud-tags`, `.tag` (absolute left/top 0; o JS define `transform`), `.tag b`, `.tag--you span`, `.tag.danger`.
  - Textos flutuantes: `.hud-floats`, `.float`, `.float--md/lg/xl` (span com animação de subir e sumir).
  - Banner e contagem:
    - `.hud-banner` (`.on` = pop; `b` na cor `--bc`; `span` em pílula).
    - `.hud-count` (`.pop`; `.go` em mint).
  - Dicas: `.hud-keys` (tira de teclas no início) e `.hud-hint`.
  - Toque: `.touch`, `.touch-move`, `.touch-act`, `.tbtn` (`.on`), `.tbtn--hit`, `.tbtn--dash`.
- **Responsivo:** abaixo de ~760px, `.pl` fica compacto (esconde pips) e painéis de UI usam largura total.

### 5. Rodar e testar no navegador
- Corrigir erros de console.
- Ajustar intensidades de luz: são chutes para o modo de luz física do r170 (hemi 1.55, dir 2.3, point lights com decay 1.4).
- Checar legibilidade das bolas contra o chão, o enquadramento em 16:9 e em retrato, e o tremor.
- Jogar de verdade e ajustar `config.js`, principalmente:
  - raio do pulso
  - velocidades
  - `spawn.addEvery`
- Rodar `npm run test:sim` após cada mudança de tuning.

### 6. `npm run build:single` e verificar que o HTML único funciona aberto direto.

### 7. `README.md` em PT-BR: como rodar, controles, arquitetura, como adicionar minigame.

## Pontos de atenção conhecidos

- `renderPortraits` cria um segundo contexto WebGL temporário. Se falhar, a UI mostra imagem vazia: tratar com fallback de cor.
- `CameraRig.update` chama `updateProjectionMatrix` todo quadro (necessário por FOV punch + viewOffset). OK, mas não duplicar.
- `Input` só dá `preventDefault` no Espaço quando `captureGame` é true, para não quebrar botões nos menus.
- A demo do menu usa bots e `demo: true` (sem som, sem HUD, sem mexer na câmera). Quando acaba, `GameManager` reinicia outra.
- `BoladaView` pede `mg.hitstop`/`mg.slowmo`: qualquer minigame novo que reutilize a ideia deve expor o mesmo.

## Como adicionar o Minigame 02

1. Criar `src/minigames/<nome>/` com uma classe que estende `game/Minigame.js`, incluindo `static meta` (id, number, name, tagline, howTo).
2. Reaproveitar `engine/*`, `characters/*` e o contrato de HUD (`getHud`, `getLabels`).
3. Registrar em `src/minigames/index.js`.
4. Ideal: separar sim pura + bot + view como no Bolada, e escrever um `test/<nome>.test.mjs` headless.
5. Pendente de UI: hoje a tela de setup mostra só o primeiro minigame como selecionado. Quando houver 2+, transformar `.mg-card` em botões com `data-action="set" data-key="minigameId"`.
