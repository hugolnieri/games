# TRETA PARTY

Party game 3D que roda direto no navegador. As partidas são curtas e caóticas, dá para jogar sozinho contra bots e o jogo funciona com teclado, controle ou toque.

**Minigame 01: Bolada!** Cada jogador defende um gol na borda de uma arena circular flutuante. O reator do centro dispara bolas que ricocheteiam por tudo. Rebata as bolas para o gol dos adversários e não deixe nenhuma entrar no seu.

A estrutura se inspira nos minigames de party games clássicos, mas tudo aqui é original: personagens, arena, interface, sons e música. Não há nenhum arquivo externo de modelo, textura ou áudio. Os modelos são montados com primitivas, as texturas saem de canvas e o som é sintetizado em tempo real.

---

## Como rodar

Requisito: [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install
npm run dev           # abre em http://localhost:5173
```

Outros comandos:

| Comando                | O que faz                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Servidor de desenvolvimento com recarga automática.                                                |
| `npm run build`        | Build para hospedar em `dist/` (qualquer servidor estático serve).                                 |
| `npm run build:single` | Gera **um único** `dist-single/index.html` com tudo embutido. Dá para abrir com dois cliques, sem servidor. |
| `npm run preview`      | Serve o build de `dist/` localmente.                                                               |
| `npm run test:sim`     | Roda centenas de partidas só de bots, sem gráficos, e confere física, regras e balanceamento.      |

> As fontes (Titan One e Baloo 2) vêm do Google Fonts. Sem internet, o jogo funciona igual e só troca a fonte por uma do sistema.

---

## Jogar online com amigos

1. Os dois abrem o jogo (o mesmo `index.html` do `build:single` ou o mesmo site) e clicam em **JOGAR ONLINE**.
2. Um clica em **CRIAR SALA** e recebe um código de 4 letras (ex.: `JQ9G`).
3. O outro digita o código em **Entrar numa sala** e clica em **ENTRAR**.
4. Na sala, cada um escolhe o personagem. O anfitrião define bots, pontos, tempo e dificuldade, e clica em **COMEÇAR**.

Cabem até 4 pessoas por sala, e as vagas que sobram podem ser completadas com bots. Cada jogador vê a arena girada com o próprio gol embaixo.

Como funciona: a conexão é direta entre os navegadores (WebRTC, via [PeerJS](https://peerjs.com)). O servidor público gratuito do PeerJS só serve para os dois se encontrarem. Quem cria a sala roda a partida e manda o estado ~30 vezes por segundo. O amigo manda só os comandos. Por isso vale deixar quem tem a melhor internet ou o melhor computador como anfitrião.

Limitações:
- Precisa de internet dos dois lados.
- Algumas redes (4G de certas operadoras, redes corporativas) bloqueiam conexão direta. Se não conectar, tente outra rede.
- No online a pausa não para o jogo: o menu só cobre a sua tela.
- Se o anfitrião minimizar a aba, o navegador congela o jogo para todos.
- Se um amigo sair no meio da partida, um bot assume o lugar dele.

Para testar sem internet, suba um servidor de salas local com `npx peerjs --port 9000 --host 127.0.0.1` e abra o jogo com `?peer=127.0.0.1:9000` no endereço.

---

## Controles

| Ação                        | Teclado             | Controle (Xbox / PlayStation) | Toque         |
| --------------------------- | ------------------- | ----------------------------- | ------------- |
| Mover no trilho             | `A` `D` ou `←` `→`  | Analógico ou D-pad            | ◀ ▶           |
| Pulso de rebatida           | `Espaço` (ou `J`)   | A / ✕ (ou X / □)              | Rebater       |
| Dash lateral                | `Shift` (ou `K`)    | B / ◯ (ou LB / RB)            | Dash          |
| Pausar                      | `Esc` (ou `P`)      | Start                         | botão ‖       |
| Acelerar ×3 depois de cair  | `Enter`             | Y / △                         | –             |
| Navegar nos menus           | setas, `Tab`, `Enter` | D-pad / analógico, A confirma, B volta | toque |

Nos controles de toque, os botões aparecem sozinhos em telas com `pointer: coarse` (celular e tablet).

---

## Regras do Bolada!

- Todo mundo começa com 5, 10 ou 15 pontos. Cada bola que entra no seu gol tira 1 ponto, e a **bola-bomba** (vermelha, a partir de 35s) tira 2.
- O **pulso** arremessa a bola na direção que vai do seu pod até ela. A mira sai do seu posicionamento. O anel no chão em volta do seu pod mostra o alcance do pulso e apaga enquanto ele recarrega.
- Um pulso no último instante, com a bola quase encostando, vira **SUPER** rebatida: bem mais rápida e difícil de defender.
- A **seta no chão** avisa, 0,8s antes, para onde o reator vai disparar. O reator mira mais em quem está ganhando, o que mantém a partida disputada.
- Quem zera os pontos é eliminado e o gol dele vira parede.
- **Vitória:** vence quem sobrar. Se o tempo acabar, quem tiver menos pontos sai, e um empate no topo leva à **morte súbita** (todos com 1 ponto).

### Dificuldade dos bots

Todos os bots usam exatamente a mesma física e a mesma velocidade que você. O que muda é o jeito de pensar:

- **Fácil:** persegue a posição atual da bola sem prever o ricochete, reage devagar e se afoba no pulso.
- **Normal:** calcula onde a bola vai cruzar o trilho e defende com calma.
- **Difícil:** prevê um ricochete, espera a bola encostar para dar super, mira no gol do adversário mais fraco, usa dash e lê a seta do reator.

---

## Arquitetura

```
src/
  main.js              liga tudo: engine, UI, HUD, GameManager e loop
  engine/              reutilizável por qualquer minigame
    Engine.js            renderer, cena, câmera e loop
    CameraRig.js         câmera de jogo (enquadra a arena em qualquer tela), órbita, tremor e punch
    Input.js             teclado + gamepad + toque → getPlayer(slot) = { x, y, action, dash }
    Audio.js             efeitos e trilha 100% sintetizados (WebAudio)
    Particles.js         partículas em um único draw call
    Effects.js           anéis de onda de choque
    Backdrop.js          céu, estrelas, nuvens e ilhotas (fundo compartilhado)
    toon.js              material cartoon, contorno "tinta", sombra blob
    math.js              utilitários (PRNG determinístico, ângulos, easing…)
  game/
    Minigame.js          CONTRATO que todo minigame implementa
    GameManager.js       máquina de estados: menu → contagem → partida ⇄ pausa → resultado
    GameState.js         configurações e última partida (localStorage)
  characters/            os 4 personagens (Faísca, Broto, Parafuso, Glub), modelos e animação
  minigames/
    index.js             REGISTRO de minigames
    bolada/              Minigame 01
      config.js            todo o tuning (velocidades, pulso, bolas, lançador)
      BoladaSim.js         regras e física 2D puras, sem Three.js (rodam em Node)
      BoladaBot.js         IA dos bots
      BoladaArena.js       visual da arena
      BoladaView.js        transforma eventos da simulação em 3D, partículas, som e textos
      BoladaMinigame.js    cola: passo fixo, input, bots, câmera lenta
    _modelo/             molde mínimo de minigame (não registrado) para copiar
  net/Net.js           conexão ponto a ponto (PeerJS): criar sala, entrar, mensagens
  game/Online.js       sala online: lobby, início da partida, envio de estado e comandos
  ui/
    UI.js                telas em DOM (menu, setup, online, sala, como jogar, configurações, pausa, resultado)
    HUD.js               painéis, cronômetro, rótulos 3D, textos flutuantes, controles de toque
  styles/main.css        estilo "adesivo": contorno grosso + sombra dura
test/sim.test.mjs      partidas headless com critérios de balanceamento
```

Como os dados fluem no Bolada:

1. O `BoladaMinigame` roda a simulação em passo fixo (1/120s). A cada passo, bots e humano geram `inputs`.
2. A `BoladaSim` avança a física e as regras e **emite eventos** (`pulseHit`, `goal`, `eliminate`, `suddenDeath`, `end`…).
3. A `BoladaView` consome esses eventos e cuida de todo o feedback: partículas, som, tremor de câmera, textos. As posições são interpoladas entre passos, então o movimento fica suave em qualquer taxa de quadros.

A regra de ouro é que regra de jogo nova entra na simulação como evento, e o feedback fica só na view. Por isso o jogo inteiro pode ser testado sem navegador (`npm run test:sim`).

---

## Como adicionar um minigame

O GameManager, o menu, a tela de setup, o "Como jogar", o HUD e a tela de resultado só conversam com o contrato de `src/game/Minigame.js`. Adicionar o Minigame 02 não exige mexer em nenhum deles.

1. Copie o molde `src/minigames/_modelo/` para `src/minigames/<nome>/` e renomeie a classe.
2. Preencha o `static meta`:
   ```js
   static meta = {
     id: 'corrida', number: '02', name: 'Corrida Maluca', tagline: 'Uma frase curta.',
     minPlayers: 2, maxPlayers: 4,
     camera: { fitRadius: 12, fitRadiusPortrait: 11, labelRadius: 9, labelHeight: 2.6 },
     howTo: { objective: '…', controls: [['A D', 'mover']], rules: ['…'], victory: '…',
              gamepad: '(opcional)', diagram: '<svg>(opcional)</svg>' },
   };
   ```
3. Implemente os métodos do contrato:

   | Método                 | Para quê                                                                                                |
   | ---------------------- | ------------------------------------------------------------------------------------------------------- |
   | `setup(config)`        | Monta a cena. `config = { players: [{ characterId, isHuman, difficulty }], points, time, demo }`          |
   | `start()`              | Chamado no "VAI!" da contagem.                                                                          |
   | `update(dt)`           | Um quadro (dt real). Leia o humano com `this.ctx.input.getPlayer(0)`.                                   |
   | `isFinished()`         | `true` quando a partida e a celebração acabaram. Aí aparece a tela de resultado.                        |
   | `getHud()`             | `{ timeLeft, hasLimit, suddenDeath, finished, humanOut, ffwd, players: [{ seat, name, color, characterId, points, max, active, place, isHuman }] }` |
   | `getLabels()`          | Posições 3D dos rótulos acima dos jogadores: `[{ seat, x, y, z, visible, points, active }]`.            |
   | `getCameraFocus()`     | Opcional: pequeno deslocamento do alvo da câmera.                                                       |
   | `getResults()`         | Colocações: `[{ place, name, color, characterId, isHuman, points, eliminatedAt, summary: [{ label, value }] }]` |
   | `dispose()`            | Remove tudo da cena e libera a memória.                                                                 |

   O `this.ctx` entrega o que a engine oferece: `{ scene, camera, rig, particles: { sparks, dust }, fx, audio, hud, input, settings }`.

4. Registre em `src/minigames/index.js`:
   ```js
   import { CorridaMinigame } from './corrida/CorridaMinigame.js';
   export const MINIGAMES = [BoladaMinigame, CorridaMinigame];
   ```

O card aparece sozinho na tela "Nova partida", e o menu, o "Como jogar" e a demo do fundo passam a seguir o minigame escolhido.

Dica: para um minigame de verdade, repita a separação do Bolada. Escreva uma simulação pura, um bot e uma view, e crie um `test/<nome>.test.mjs` que roda partidas só de bots. Assim dá para ajustar o balanceamento em segundos, sem abrir o navegador.

---

## Ajustando o jogo (tuning)

Todo o tuning do Bolada fica em `src/minigames/bolada/config.js`: velocidade e aceleração do pod, raio e força do pulso, velocidade das bolas e o ritmo do lançador (`spawn`). Os perfis dos bots ficam em `BOT_PROFILES`, dentro de `BoladaBot.js`.

Depois de qualquer mudança, rode `npm run test:sim`. Ele confere seis critérios:

- O Difícil vence a maioria das partidas contra três Fáceis.
- O Difícil é o mais forte numa partida mista.
- O Difícil vence o Normal no 1v1.
- O Normal vence o Fácil no 1v1.
- Um jogador parado nunca vence.
- Partidas de 4 jogadores duram entre 40s e 180s (hoje ficam em torno de 78s com 10 pontos).

Para testar a interface automaticamente, o jogo expõe `window.__treta = { gm, engine }`.
