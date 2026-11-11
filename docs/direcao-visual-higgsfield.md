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

Para manter consistência, envie junto a ficha do elenco renderizada pelo próprio jogo como imagem
de referência (`role: image_references`). Ela é gerada pelo estúdio de retratos
(`Portraits.of(id)` em `src/characters/portraits.js`): 6 retratos numa grade 3×2 com os nomes.

| Personagem | Descrição para o prompt | Cor |
| --- | --- | --- |
| Faísca | small round orange electric cat, pointy ears with pink inside, whiskers, yellow zigzag hair tuft, long curled tail with a yellow ball tip | `#ff6b3d` |
| Broto | small round green frog-lizard, big eyes on top of its head, wide smile, orange crest spikes down its back, short tail | `#49d35e` |
| Parafuso | small blue boxy junkyard robot, dark visor with two cyan LED eyes, round ear bolts, antenna with a blinking red bulb, pink heart light on the chest | `#2fb0ff` |
| Glub | small purple gelatinous alien, three eyes (one big on top), two antennae with lime-green tips, tiny round "o" mouth | `#b46bff` |
| Jujuba | small pink gummy bear, round ears, cream snout, rosy cheeks, slightly translucent jelly look | `#ff5fa2` |
| Pipoca | small yellow chick, big orange beak, red three-feather tuft, stubby wings | `#ffc21a` |

Todos são baixinhos, sem pernas, de braços curtos, e andam em um veículo da cor deles.

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

1. Baixe as imagens escolhidas para `art-src/` (fora do build).
2. `node tools/art.mjs art-src` recorta/reduz para WebP em `src/assets/art/` e reescreve
   `src/assets/art.js` (`ART.minigames[id]`, `ART.key`).
3. Os cartões de minigame (setup e sala) e o "Como jogar" passam a usar a arte automaticamente.
