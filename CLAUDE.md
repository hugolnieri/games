# TRETA PARTY — contexto do projeto

Party game web 3D, jogável no navegador, para até 4 jogadores (solo com bots ou sala online). As **famílias de mecânica** vêm dos party games de arena clássicos; a identidade é 100% original. Nada de personagens, nomes, logos, sons ou texturas de Crash, Naughty Dog ou Activision. Modelos, texturas de jogo e áudio são procedurais. A única arte externa é a de apoio dos menus (cartões dos minigames e arte-chave), gerada no Higgsfield e guardada em `src/assets/art/*.webp` (ver `docs/direcao-visual-higgsfield.md`).

- **8 minigames** (`src/minigames/index.js`): 01 Bolada! (rebater bolas), 02 Trombada (empurrar para fora), 03 Pula-Pinta (pogo que pinta o piso + cofre), 04 Caixote! (pegar e arremessar), 05 Lata-Velha (tanques, cobertura, minas), 06 Pé na Tábua (corrida de 5 voltas com atalho), 07 Mira Certa (alvos móveis), 08 Pega-Ficha (coletar desviando).
- **Circuito:** sequência de minigames (escolhida ou sorteada) valendo 5/3/2/1 pontos por rodada; anuncia o campeão. Funciona solo e na sala online (todos seguem na mesma sala entre as rodadas).
- **Elenco fixo de 6** (Faísca, Broto, Parafuso, Glub, Jujuba, Pipoca) usado em todos os modos, na sala, na loja e nos resultados. **Loja** de cosméticos (skins, acessórios, poses de vitória) com moedas ganhas ao concluir partidas; tudo salvo em localStorage.
- UI e textos em **português do Brasil**.
- Stack: **Vite 5 + Three.js 0.170**, JS puro (ES modules), sem framework de UI.
- Prioridade do dono do projeto: gameplay > controles > física > bots > câmera > feedback > UI > polimento > áudio.

## Comandos

```
npm install
npm run dev            # desenvolvimento
npm run test:sim       # partidas headless só de bots: Bolada (test/sim.test.mjs) + os 7 de arena (test/minigames.test.mjs)
node tools/art.mjs art-src   # otimiza arte gerada (PNG → WebP) e reescreve src/assets/art.js
node tools/models.mjs art-src/models   # otimiza malhas de personagem (GLB) e reescreve src/assets/models.js
npm run build          # build normal (dist/)
npm run build:single   # HTML único com tudo inline (dist-single/), abre direto do disco (file://)
```

## Status

**Tudo roda no navegador** (Chromium testado em 1280x720, 390x844 retrato com toque e 844x390 paisagem com toque), sem erros de console. O fluxo completo funciona: menu com demo ao vivo → setup → contagem → partida → pausa (Esc/Start/aba oculta) → resultado → jogar novamente / menu. O `build:single` também abre e roda via `file://`.

`test/minigames.test.mjs` (N=40 por cenário, `ONLY=trombada,caixote` filtra) verifica para cada minigame de arena: toda partida termina, colocações 1..n sem repetição, difícil vence a maioria contra 3 fáceis, normal vence fácil no 1v1, jogador parado (quase) nunca vence, duração entre 20s e 150s.

O Bolada (`test/sim.test.mjs`) passa os 6 critérios (N=80):
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
    characters.js      ELENCO: 6 personagens originais + lookDef(p) (personagem + skin + acessório + pose) e lookOf(p)
    cosmetics.js       CATÁLOGO da loja: SKINS por personagem, ACCESSORIES, POSES, preços, matchReward()
    CharacterModel.js  modelo por primitivas (pod opcional) + acessórios na cabeça + CharacterAnimator (idle, lean, olhar, ataque, dano, 5 poses de vitória)
    rigs.js            veículo por minigame (bumper, pogo, feet, tank, kart, board, blaster) + createAvatar(player, rig)
    meshes.js          malhas esculpidas (GLB do Higgsfield): preloadMeshes, getMesh, meshTexture (skins), hullMaterial, MESH_FIT
    portraits.js       Portraits: estúdio offscreen com cache; of(look) e poseFrames(look) (prévia animada da loja); fallback SVG
  assets/
    art.js             GERADO por tools/art.mjs: ART.minigames[id], ART.chars[id], ART.key (WebP em assets/art/)
  minigames/
    index.js           REGISTRO: MINIGAMES (8), getMinigame, hasMinigame, CIRCUIT_POINTS
    meta.js            peças comuns de metadados (teclas, howTo)
    shared/
      SimBase.js         base das sims de arena (estado em `this.s`, JSON puro) + BotBase + separate/pushOutBox; roda em Node
      ArenaView.js       base das views: avatares, objetos por id, interpolação, fim de partida, helpers (tmesh, flat, platform)
      ArenaMinigame.js   cola genérica: passo fixo 1/60, input local/remoto, bots, snapshot de rede, HUD e resultados
    trombada/ pulapinta/ caixote/ latavelha/ penatabua/ miracerta/ pegaficha/
                       cada um: sim.js (Sim + Bot + constantes, sem Three.js) e game.js (View + classe com static meta)
    bolada/
      config.js        todo o tuning (velocidades, pulso, bolas, spawn)
      BoladaSim.js     simulação 2D pura, SEM Three.js; roda em Node
      BoladaBot.js     IA dos bots (perfis easy/normal/hard)
      BoladaArena.js   visual estático/animado da arena
      BoladaView.js    liga sim → 3D; converte eventos em partículas, som, câmera, textos
      BoladaMinigame.js  cola: passo fixo, input humano, bots, hitstop/câmera lenta/acelerar
    _modelo/           molde mínimo e funcional de minigame (NÃO registrado): copiar para criar o 02
  ui/
    UI.js              telas DOM: main, setup (modo + grade de minigames + elenco), shop, howto, settings, pause, online, lobby, result (rodada, circuito, campeão); moveFocus()/activate()
    HUD.js             painéis por jogador, cronômetro, rótulos 3D, floatText, banner, countdown, regras rápidas, toque (◀ ▶ ou direcional analógico por meta.touch); topReserve(w, h) espelha os breakpoints do CSS
test/sim.test.mjs, test/minigames.test.mjs
tools/art.mjs         PNG gerado → WebP otimizado + src/assets/art.js
tools/models.mjs      GLB gerado → malha otimizada em src/assets/models/ + src/assets/models.js
docs/direcao-visual-higgsfield.md   prompts por personagem e arena, e como integrar
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

## Minigames de arena (02 a 08)

Todos seguem o mesmo molde (`shared/`), o que deixa cada modo em ~2 arquivos:

- **Sim** (`extends SimBase`): todo o estado mutável fica em `this.s` (JSON puro): `s.p[i]` jogadores `{ x, z, d, on, sc, pl, ab/bb (toques em buffer), inv, stun, ... }`, `s.o` objetos `{ id, k, x, z, ... }`. `tick(h, inputs)` recebe `inputs[i] = { x, z, a, b }` (vetor no mundo + toques). `eliminate(p)`, `finish()` e `rankKey(p)` cuidam de colocação e desempate; `summary(p)`, `detail(p)`, `hudPoints(p)`, `hudText(p)` alimentam HUD e resultado.
- **Bot** (`extends BotBase`): `think(h, fresh)` preenche `this.out`; `lv(fácil, normal, difícil)` escolhe parâmetros. Mesma física do humano.
- **View** (`extends ArenaView`): `static rig`, `build()`, `makeObj(o)`, `syncObj(...)`, `syncPlayer(av, p, x, z, dt)`, `onEvent(e)`, `frame(dt)`.
- **Classe** (`extends ArenaMinigame`): `static Sim/Bot/View` e `static meta` com `keys`, `touch: { a, b }`, `quick` (3 regras mostradas na contagem), `hud: { pips }`, `camera`, `howTo`.
- **Rede sem código extra:** host manda `{ st: sim.snapshot(), e: eventos }`; cliente faz `sim.apply(st)`. Regra nova = campo novo em `s` + evento; nada a serializar à mão.
- **Controles iguais em todos:** direcional (teclado WASD/setas, analógico, direcional de toque), A = Espaço, B = Shift. Câmera sem giro por jogador; o anel branco no chão marca "você" e muda de cor quando a habilidade está pronta.

Pistas de leitura obrigatórias: Caixote! mostra a faixa de mira piscando durante a preparação do arremesso (0,5s) e o anel onde o caixote cai; Lata-Velha mostra a recarga num disco sob o tanque e as minas piscam (lento = armando, rápido + círculo = vai explodir); Pega-Ficha avisa a marreta com círculo que enche; Pé na Tábua marca o trilho do pêndulo na ponte.

## Elenco: personalidade

Cada personagem tem um temperamento que precisa aparecer em **três lugares**: no modelo 3D (expressão, postura, trejeito), nas falas e na ficha de arte. Ao mexer em um, mantenha os outros coerentes.

| Personagem | Temperamento | Marcas no modelo (`CharacterModel.js`) | Trejeito (`extras.tick` / `extras.armRest`) |
| --- | --- | --- | --- |
| Faísca | esquentada, exibida | sobrancelha brava, presinha, óculos de corrida na testa, topete e rabo de raio | rabo inquieto, não para quieta, topete faiscando |
| Broto | preguiçoso, tranquilo | pálpebras pesadas, sorrisão, junco na boca, brotinho de duas folhas | balança devagar, braços largados, mastiga o junco |
| Parafuso | ansioso, atrapalhado | olhos de LED desparelhados, boca em zigue-zague, parafusão solto, antena torta, remendo de ferrugem | tique nervoso, mãos tremendo na frente, parafuso desrosqueando |
| Glub | rabugento, impaciente | três olhos com pálpebra pesada, bico, antenas caídas, gosma escorrendo, bolhas | braços cruzados, cada olho para um lado; só sorri quando ganha |
| Jujuba | fofa e casca-grossa | orelha mordida, laço, curativo em X, patas enfaixadas | guarda de boxe com jab alternado, piscadela |
| Pipoca | hiperativa, caótica | olhos esbugalhados de tamanhos diferentes, bico aberto, topete de pipoca, casca de ovo listrada | cabeça aos trancos, asas batendo sem parar, bico piando |

- **Malha esculpida** (`characters/meshes.js`, `src/assets/models/<id>.glb`): quando o personagem tem uma, `createCharacterModel` usa a malha (material toon com a textura, contorno por casco empurrado pela normal) no lugar do corpo de primitivas; sem malha, cai nas primitivas. Hoje só a **Faísca** tem. A malha é rígida (sem esqueleto): o `CharacterAnimator` anima o corpo inteiro (olhar, bote, tremor no dano, poses de vitória) e `quirk` dá o trejeito. Skins repintam o tom principal da textura (`meshTexture`); acessórios usam `MESH_FIT`. `main.js` espera `preloadMeshes()` antes de montar a primeira cena. Como gerar mais: `docs/direcao-visual-higgsfield.md` e `node tools/models.mjs art-src/models`.
- Sobrancelhas (`addBrow`) reagem ao humor no `CharacterAnimator`: bravas no ataque, caídas no dano, erguidas na vitória. `extras.mouthRest` define a boca em repouso (Glub faz bico).
- Com chapéu equipado (`hat`), o enfeite do topo da cabeça (topete, broto, parafusão, laço, pipoca) sai para dar lugar ao acessório.
- Falas em `characters.js`: `bio`, `quote` (bordão), `win` e `lose`. Aparecem na ficha (setup e loja), no banner de vitória e na tela de resultado.
- Ficha de arte: `ART.chars[id]` (Higgsfield, fundo transparente, `art-src/chars/<id>.png`). Os retratos pequenos continuam sendo o modelo 3D (mostram skin e acessório).

## Sessão, Circuito, loja

- `GameManager.session = { ids, idx, players, circuit, totals, wins, last, points, time, net, matchId, scored }`. `startMatch()` (solo) e `OnlineSession._begin()` (online) chamam `startSession()`; `_playRound()` monta a rodada; `nextRound()` avança. Os `players` (com aparência) são os mesmos em todas as rodadas.
- Resultado: `_showResult()` paga a recompensa (`state.reward(chave, moedas)`, idempotente por `matchId:rodada`), soma `CIRCUIT_POINTS` e monta a classificação (pontos → vitórias de rodada → colocação na última).
- `GameState.profile = { coins, owned, skins: { personagem: skin }, acc, pose, rewarded }`. `buy(id)` nunca cobra item já possuído; `equip(id)`; `look(characterId)` devolve `{ characterId, skin, acc, pose }` só com itens possuídos.
- Aparência nas partidas: `player = { characterId, skin, acc, pose, isHuman, isRemote, difficulty }`. `p.def` (personagem base) dá nome e **cor do jogador** (HUD, veículo, território); `lookDef(p)` dá as cores do corpo com a skin.
- No Circuito o Bolada roda com 5 pontos e 2:00 para ter duração parecida com os outros.

## Online (PeerJS / WebRTC)

- `net/Net.js` cria e entra em salas (id do peer = `treta-party-v1-<CÓDIGO>`, código de 4 caracteres) usando o servidor público do PeerJS e STUN do Google/Twilio (não há TURN). Com `?peer=host:porta` usa um PeerServer local (`npx peerjs --port 9000 --host 127.0.0.1`).
- `game/Online.js` (OnlineSession) cuida da sala. O **host é autoritativo**: roda a sim, manda `{t:'s', s: mg.netSnapshot()}` a 30 Hz (estado compacto + eventos desde o último envio) e recebe `{t:'in', x, y, p, d}` dos clientes (eixos + contadores de toques).
- O cliente roda o minigame com `net.role = 'client'`: não simula nada, só aplica `applySnapshot` (que chama `view.capturePrev()`, sobrescreve a sim e toca os eventos na view) e interpola.
- Jogadores: `isHuman` = quem está nesta máquina ("você"); `isRemote` = humano em outra máquina; nenhum dos dois = bot. Se um cliente sair, `dropRemote()` põe um bot no lugar.
- Cada máquina gira a câmera (`rig.yaw = mg.getViewYaw()`) para o próprio gol ficar embaixo. O input de tela é projetado com esse giro em `_controllerInput`, e o HUD põe os painéis por assento relativo (`viewSeat`).
- Pausa online = sobreposição (`gm.overlay`): o jogo não para e o seu pod fica parado enquanto o menu está aberto.
- Lobby: `members[i].look`; o host escolhe modo, minigame ou sequência do circuito (`setOptions`), bots e dificuldade. Personagem não se repete na sala (`_freeLook`). Aparência que chega pela rede passa por `cleanLook`.
- `start{ plan, you, ids, idx, circuit, id, totals, wins, last }`: mesma mensagem para partida única, revanche e próxima rodada (`startGame`, `nextRound`, `restartRound` → `_launch`). Quem sai no meio do circuito vira bot nas rodadas seguintes.
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

- Jogar de verdade em aparelhos e redes reais: iPhone/Safari (direcional de toque, volta à sala após compartilhar convite), latência entre redes diferentes, celulares fracos.
- Balanceamento fino com humanos: letalidade de Caixote! e Lata-Velha, vantagem de largada em Pé na Tábua, preço dos itens.
- Online: servidor TURN para redes que bloqueiam conexão direta; predição local do próprio jogador no cliente se a latência incomodar; o estado dos modos de arena vai como JSON a 30 Hz (enxuto, mas dá para compactar).
- Multiplayer local: `Input.getPlayer(slot)` já existe; falta mapear um dispositivo por slot.
- Mais conteúdo: novas pistas/arenas por modo, mais skins; clipes curtos de apresentação (Higgsfield vídeo) se couber no carregamento.

## Pontos de atenção conhecidos

- `renderPortraits` cria um segundo contexto WebGL temporário. Se falhar, cada personagem ganha um retrato SVG de reserva.
- `CameraRig.update` chama `updateProjectionMatrix` todo quadro (necessário por FOV punch + viewOffset). OK, mas não duplicar.
- `Input` só dá `preventDefault` no Espaço quando `captureGame` é true, para não quebrar botões nos menus.
- A demo do menu usa bots e `demo: true` (sem som, sem HUD, sem mexer na câmera). Quando acaba, `GameManager` reinicia outra.
- `BoladaView` pede `mg.hitstop`/`mg.slowmo`: qualquer minigame novo que reutilize a ideia deve expor o mesmo.

## Como adicionar um minigame

1. Copiar uma pasta de arena (ex.: `src/minigames/pegaficha/`): `sim.js` (Sim + Bot) e `game.js` (View + classe com `static meta`). Para algo fora do molde, estender `game/Minigame.js` direto (ver `_modelo/` e `bolada/`).
2. Registrar em `src/minigames/index.js` e acrescentar em `test/minigames.test.mjs`.
3. Menu, "Como jogar", HUD, toque, sala online, Circuito e resultados se adaptam sozinhos.
4. Opcional: arte do cartão em `art-src/<id>.png` + `node tools/art.mjs art-src`.
