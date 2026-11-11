# Direção visual com Higgsfield

Regra de ouro: os personagens **jogáveis** são sempre os modelos 3D em tempo real
(`src/characters/CharacterModel.js`). As imagens geradas servem de arte de menu e de cartão dos
minigames, e de referência de estilo.

Modelo usado: `gpt_image_2_6` (1k, 16:9). Custo: 0,25 crédito em qualidade `low`, 0,5 em `medium`.

## Bloco de estilo (vai em todo prompt)

> 3D cartoon render, toon shading, thick dark purple ink outlines, saturated candy colors, floating
> arena in a twilight purple-pink sky with fluffy pink clouds, strong readable silhouettes.
> No text, no logos, no watermark.

## Elenco (descrição fixa, reaproveitar em skins e poses)

Para manter consistência, envie junto uma imagem de referência (`role: image_references`): a ficha
3D do jogo (`docs/elenco-referencia.png`, gerada pelo estúdio de retratos) ou as fichas já aprovadas
em `art-src/chars/`. Cada ficha foi gerada em 1:1, fundo transparente, qualidade `medium`, com:

> Character splash art, single character, full body, centered, transparent background. Redesign of
> the <personagem> from the reference sheet with much more personality: <nome>, <temperamento>.
> Keep <formas base>. Add: <marcas>. + bloco de estilo.

| Personagem | Temperamento | Formas base | Marcas de personalidade | Cor |
| --- | --- | --- | --- | --- |
| Faísca | hot-headed electric speedster cat and shameless show-off | round orange body, cream belly, pointy ears | cocky lopsided smirk with one tiny fang, thick angry eyebrows, yellow racing goggles pushed up on the forehead, spiky yellow lightning-bolt hair tuft, tail shaped like a zigzag lightning bolt, sparks around the paws | `#ff6b3d` |
| Broto | the laziest, most laid-back swamp frog who wins without trying | round green body, lime belly, big eyes on top of the head, orange crest spikes | heavy half-closed sleepy eyelids, wide relaxed grin, reed straw hanging from the mouth, plant sprout with two leaves on the head, lazy thumbs up | `#49d35e` |
| Parafuso | anxious, clumsy junkyard robot built from a microwave oven who overthinks everything | blue boxy head with dark visor, cyan LED eyes, cylinder body, pink heart light | mismatched LED eyes, worried eyebrow plates, wobbly zigzag LED mouth, giant loose screw on top of the head, bent antenna with a red bulb, riveted orange rust patch, a spring and bolt popping off | `#2fb0ff` |
| Glub | grumpy, impatient, sarcastic jelly alien annoyed by everything | round purple gelatinous body, three eyes (one big on top), two antennae with lime-green tips | each eye looking a different way, heavy unimpressed eyelids, one raised eyebrow, small frown, arms crossed, slime drips, drooping antennae, bubbles | `#b46bff` |
| Jujuba | gummy bear who looks adorable but is the toughest brawler | round pink gummy body, cream snout, rosy cheeks | one ear with a bite taken out, yellow ribbon bow on the other ear, white cross bandage on the cheek, confident wink, boxing tape on both paws, raised fist | `#ff5fa2` |
| Pipoca | hyperactive, explosive little chick, pure chaotic energy | round yellow body, big orange beak | huge manic eyes with different pupil sizes, beak wide open shouting, head tuft of white popped popcorn with one red feather, lower body inside a cracked eggshell with red and white popcorn-box stripes, wings flapping | `#ffc21a` |

Todos são baixinhos, de braços curtos, e andam em um veículo da cor deles. O modelo 3D jogável
carrega as mesmas marcas (ver "Elenco: personalidade" no `CLAUDE.md`).

### Skins (trocar só a paleta do corpo, manter silhueta)

`<descrição do personagem>, same character and silhouette, recolored body: <paleta>` com as paletas
de `src/characters/cosmetics.js` (ex.: Faísca "Curto-circuito": teal `#19e3c2` body, pale mint belly).

### Poses de vitória

`<descrição>, victory pose: <pose>, confetti, low camera angle` com: jumping with both arms up
(Pulinho) · swaying with alternating arms (Ola) · spinning with arms wide open (Pirueta) ·
stiff robot dance (Robozinho) · flexing both arms (Exibido).

## Arte do menu (key art)

> Key art for an original arcade party video game. Six small round cartoon creatures celebrate
> together on a floating circular arena […elenco…]. Each rides a small flying-saucer bumper pod in
> its own color. Confetti, dynamic low camera angle. + bloco de estilo.

## Arenas (cartões dos minigames, vista 3/4 de cima)

| Minigame | Prompt (antes do bloco de estilo) |
| --- | --- |
| Bolada! | circular floating arena with four glowing energy goals on its rim (orange, green, blue, purple), a central reactor cannon shooting glowing white balls that ricochet, flying-saucer bumper pods defending the goals |
| Trombada | round slippery light-blue ice platform, four cartoon bumper cars with fat black rubber tires ramming each other, one being knocked off the edge, sparks |
| Pula-Pinta | floating 7×7 grid of square tiles painted in patches of orange, green, pink and purple, creatures bouncing on pogo springs leaving paint splashes, a golden treasure chest glowing on one tile |
| Caixote! | square floating warehouse floor of orange wooden planks with a low cream wall, creatures in boots lifting wooden crates over their heads and throwing them, one red dynamite crate with a lit fuse |
| Lata-Velha | square green checkered battlefield with cream cover blocks topped in hot pink, chunky scrap-metal toy tanks firing cork projectiles, spiky land mines with blinking red lights, a puffy explosion |
| Pé na Tábua | compact floating go-kart circuit ribbon with pink and cream striped curbs, yellow boost arrow pads on purple asphalt, a narrow wooden shortcut bridge with a swinging red spiked pendulum, tiny soapbox karts with turbo flames |
| Mira Certa | carnival shooting gallery, three conveyor belts in pink, coral and yellow carrying round bullseye targets plus a golden star target and a black bomb target, creatures on hover boards firing suction-cup plunger darts (view from behind the players) |
| Pega-Ficha | round carousel platform with orange and coral pie-slice stripes, two low striped sweeper bars rotating around a purple hub, gold coin tokens on the floor, a giant cartoon mallet about to slam on a red warning circle |

## Como integrar

1. Baixe as imagens escolhidas para `art-src/` (fora do build); fichas de personagem em `art-src/chars/<id>.png`.
2. `node tools/art.mjs art-src` recorta/reduz para WebP em `src/assets/art/` e reescreve
   `src/assets/art.js` (`ART.minigames[id]`, `ART.chars[id]`, `ART.key`).
3. Os cartões de minigame (setup e sala) e o "Como jogar" passam a usar a arte automaticamente.
