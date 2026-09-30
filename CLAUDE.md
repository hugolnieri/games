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
npm run build:single   # HTML único com tudo inline (dist-single/), abre direto do disco (file://)
```

## Status

**Tudo roda no navegador** (Chromium testado em 1280x720, 390x844 retrato com toque e 844x390 paisagem com toque), sem erros de console. O fluxo completo funciona: menu com demo ao vivo → setup → contagem → partida → pausa (Esc/Start/aba oculta) → resultado → jogar novamente / menu. O `build:single` também abre e roda via `file://`.

`npm run test:sim` passa os 6 critérios (N=80):
- Difícil vence 78/80 contra três Fáceis.
- No 1v1, Difícil vence ~74% contra Normal, e Normal vence 80/80 contra Fácil.
- Jogador parado nunca vence.
- Partida de 4 com 10 pontos dura ~78s.

**Tuning feito no navegador** (ver histórico do git):
- Lançador com `minGap` 0.8 e `startBalls` 3: no início há ~2.4 bolas em quadra (antes eram ~1.8).
- Fácil ligeiramente menos atrapalhado.
- Correção no Difícil: em empate de pontos, todos miravam no assento 0 (o do humano). Agora o bot sorteia o alvo e o mantém.

## Arquitetura

```
index.html, vite.config.js   (modo `single` = vite-plugin-singlefile → dist-single/)
src/
  main.js            wiring (ver abaixo) + window.__treta = { gm, engine } para testes
  styles/main.css    estilo "adesivo", HUD, toque, responsivo, movimento reduzido
  engine/            reutilizável por qualquer minigame
    Engine.js          renderer (NoToneMapping, sRGB), cena, câmera, loop, onResize(w, h, bufferHeight)
    CameraRig.js       modos 'game' (fit(aspect, pxH, reservePx): arena inteira na tela e rótulos fora da faixa do cronômetro) e 'orbit'; trauma shake, punch de FOV, viewShift
    Input.js           teclado + gamepad (layout W3C, Xbox/PS) + toque → getPlayer(slot) = { x, y, action, dash }; navPressed()/gpAcceptPressed()/gpBackPressed() para menus
    Audio.js           WebAudio procedural: play(nome, opts), trilha em loop com scheduler, duck(), unlock()
    Particles.js       Points + ShaderMaterial, pool; emit({...}); cores sRGB cruas (hexToRgb)
    Effects.js         anéis de onda de choque
    Backdrop.js        céu crepúsculo (shader), estrelas, nuvens, ilhotas, planeta
    toon.js            toon(color), withOutline(mesh) (casco invertido), blobShadow(), disposeTree()
    math.js            clamp, lerp, damp, wrapAngle, mulberry32, rayCircleExit, hexToCss...
  game/
    Minigame.js        CONTRATO de todo minigame (setup/start/update/isFinished/getHud/getLabels/getCameraFocus/getResults/dispose + static meta com camera e howTo)
    GameManager.js     máquina de estados: menu (demo ao vivo no fundo) → countdown → playing ⇄ paused → result; refit() aplica meta.camera; navegação de menu por controle
    GameState.js       settings + lastConfig em localStorage ('treta-party:v1')
  characters/
    characters.js      4 personagens originais (Faísca, Broto, Parafuso, Glub)
    CharacterModel.js  modelo por primitivas dentro de um pod voador + CharacterAnimator (idle, lean, olhar, ataque, dano, vitória)
    portraits.js       renderiza retratos em canvas offscreen → dataURL (usados na UI); fallback SVG se o WebGL falhar
  minigames/
    index.js           REGISTRO: MINIGAMES = [BoladaMinigame]; COMING_SOON
    bolada/
      config.js        todo o tuning (velocidades, pulso, bolas, spawn)
      BoladaSim.js     simulação 2D pura, SEM Three.js; roda em Node
      BoladaBot.js     IA dos bots (perfis easy/normal/hard)
      BoladaArena.js   visual estático/animado da arena
      BoladaView.js    liga sim → 3D; converte eventos em partículas, som, câmera, textos
      BoladaMinigame.js  cola: passo fixo, input humano, bots, hitstop/câmera lenta/acelerar
    _modelo/           molde mínimo e funcional de minigame (NÃO registrado): copiar para criar o 02
  ui/
    UI.js              telas DOM: main, setup, howto, settings, pause, result; moveFocus()/activate() (navegação espacial por setas/controle)
    HUD.js             painéis por jogador, cronômetro, rótulos 3D, floatText, banner, countdown, toque; topReserve(w, h) espelha os breakpoints do CSS
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
- **Enquadramento:** cada minigame declara `static meta.camera = { fitRadius, fitRadiusPortrait, labelRadius, labelHeight }`; `GameManager.refit()` aplica no `CameraRig` (em resize e ao trocar de minigame). A faixa do topo reservada ao HUD vem de `HUD.topReserve(w, h)`: se mudar o tamanho do cronômetro/rótulos no CSS, atualize lá.
- **Resultado:** `getResults()` devolve `summary: [{ label, value }]`, que vira as colunas da tela de resultado (a UI não conhece estatísticas de nenhum minigame).
- **Visual das bolas:** `BALL_VIS` (BoladaView) desenha as bolas 12% maiores que o raio de colisão; rastro na cor de quem rebateu por último; anel de alcance do pulso só para humanos.

## Online (PeerJS / WebRTC)

- `net/Net.js` cria e entra em salas (id do peer = `treta-party-v1-<CÓDIGO>`, código de 4 caracteres) usando o servidor público do PeerJS e STUN do Google/Twilio (não há TURN). Com `?peer=host:porta` usa um PeerServer local (`npx peerjs --port 9000 --host 127.0.0.1`).
- `game/Online.js` (OnlineSession) cuida da sala. O **host é autoritativo**: roda a sim, manda `{t:'s', s: mg.netSnapshot()}` a 30 Hz (estado compacto + eventos desde o último envio) e recebe `{t:'in', x, y, p, d}` dos clientes (eixos + contadores de toques).
- O cliente roda o minigame com `net.role = 'client'`: não simula nada, só aplica `applySnapshot` (que chama `view.capturePrev()`, sobrescreve a sim e toca os eventos na view) e interpola.
- Jogadores: `isHuman` = quem está nesta máquina ("você"); `isRemote` = humano em outra máquina; nenhum dos dois = bot. Se um cliente sair, `dropRemote()` põe um bot no lugar.
- Cada máquina gira a câmera (`rig.yaw = mg.getViewYaw()`) para o próprio gol ficar embaixo. O input de tela é projetado com esse giro em `_controllerInput`, e o HUD põe os painéis por assento relativo (`viewSeat`).
- Pausa online = sobreposição (`gm.overlay`): o jogo não para e o seu pod fica parado enquanto o menu está aberto.
- Teste com dois navegadores (Playwright, dois contextos) + PeerServer local.

## Mecânica (resumo)

- Movimento só lateral no trilho, com aceleração e frenagem rápidas.
- **Espaço** = pulso de curto alcance (2.35).
  - Arremessa a bola na direção pod → bola, sempre para dentro da arena. A mira vem do posicionamento.
  - Pulso com a bola quase encostando (gap < 0.45) = **SUPER** (23 u/s, hitstop, "SUPER!").
- **Shift** = dash. O corpo do pod também rebate passivamente, adicionando efeito com a velocidade do pod.
- **Lançador central:** mostra uma seta de aviso por 0.8s antes de cada disparo.
  - Mira mais em quem tem mais pontos (catch-up).
  - O número de bolas cresce com o tempo: 3 no início, +1 a cada 18s (máx. 6 e jogadores vivos + 2).
  - Bolas-bomba (valem 2) a partir de 35s.
- Pilares-bumper nas divisórias e reator central dão boost.
- **Pontos e fim de partida:**
  - Pontos iniciais 5/10/15. Zerou → eliminado, gol vira parede, pod voa para o abismo.
  - Tempo 2:00, 3:00 ou sem limite. No fim do tempo, quem tem menos pontos sai; empate no topo → **morte súbita** (todos com 1 ponto).

## Bots (dificuldade por comportamento, mesma física/velocidade)

- **Fácil:** persegue a posição atual da bola (não prevê), reação 0.36s, erro grande, pulso afobado ou ausente (50%), se distrai.
- **Normal:** prevê o ponto onde a bola cruza o trilho, reação 0.22s.
- **Difícil:**
  - Prevê 1 ricochete, reação 0.09s.
  - Espera a bola encostar para dar super.
  - Posiciona-se para mirar no gol do adversário com menos pontos (em empate, sorteia um alvo e o mantém).
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

## Testes no navegador (headless)

- O Chromium headless renderiza por software (SwiftShader, ~2,5 fps). Por isso o tempo real anda devagar lá. Para testar a jogabilidade, avance o tempo chamando `gm.update(1/60)` em loop via `window.__treta`, com `input.poll()` e `input.endFrame()` em volta.
- Para deixar um bot jogando no lugar do humano: `mg.bots.push(new (mg.bots[0].constructor)(mg.sim, mg.human.seat, 'hard', Math.random)); mg.human = null`.
- Um gamepad pode ser simulado sobrescrevendo `navigator.getGamepads`.

## Próximos passos sugeridos

- Jogar de verdade com teclado e controle em várias máquinas e revisar a sensação: velocidade do pod, janela da super (`superGap` 0.45 ≈ ±45ms a 10 u/s) e volume da trilha.
- Desempenho em celulares fracos: hoje são ~460 draw calls, a maior parte vinda dos personagens (malhas + contornos). Mesclar as geometrias estáticas por material se for preciso.
- Multiplayer local: `Input.getPlayer(slot)` já existe. Falta mapear um dispositivo por slot e permitir mais de um humano no setup (os controladores por humano de `BoladaMinigame` já suportam vários).
- Online: adicionar um servidor TURN para redes que bloqueiam conexão direta; predição local do próprio pod no cliente se a latência incomodar.
- Minigame 02 a partir de `src/minigames/_modelo/`.

## Pontos de atenção conhecidos

- `renderPortraits` cria um segundo contexto WebGL temporário. Se falhar, cada personagem ganha um retrato SVG de reserva.
- `CameraRig.update` chama `updateProjectionMatrix` todo quadro (necessário por FOV punch + viewOffset). OK, mas não duplicar.
- `Input` só dá `preventDefault` no Espaço quando `captureGame` é true, para não quebrar botões nos menus.
- A demo do menu usa bots e `demo: true` (sem som, sem HUD, sem mexer na câmera). Quando acaba, `GameManager` reinicia outra.
- `BoladaView` pede `mg.hitstop`/`mg.slowmo`: qualquer minigame novo que reutilize a ideia deve expor o mesmo.

## Como adicionar o Minigame 02

1. Copiar `src/minigames/_modelo/` para `src/minigames/<nome>/`. A classe estende `game/Minigame.js` e traz `static meta` (id, number, name, tagline, min/maxPlayers, camera, howTo com diagram/gamepad opcionais).
2. Reaproveitar `engine/*`, `characters/*` e o contrato de HUD (`getHud`, `getLabels`) e de resultado (`getResults` com `summary`).
3. Registrar em `src/minigames/index.js`. O setup já lista os minigames como botões (`data-key="minigameId"`), e o menu, o "Como jogar" e a demo seguem o minigame escolhido.
4. Ideal: separar sim pura + bot + view como no Bolada, e escrever um `test/<nome>.test.mjs` headless.
