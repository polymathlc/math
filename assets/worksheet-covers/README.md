# Worksheet cover artwork (v1.106.0)

`math-pixel-icons.png` is the symbol sheet the Big M cover (`worksheet-cover.js`)
sprinkles over every cover the Maths portal prints: a 672 × 672 RGBA PNG holding
a 4 × 4 grid of 168px cells, read left to right, top to bottom:

| row | cells |
| --- | --- |
| 1 | plus · minus · times · divide |
| 2 | equals · percent · pi · square root |
| 3 | fraction pie · protractor · infinity · not-equal |
| 4 | less-than · greater-than · set square · cube |

The cells are pixel art in the Polymath pastels (teal, pink, lilac, butter) on a
transparent background, cropped by `atlasCells.math` and drawn with
`image-rendering: pixelated`, so they stay crisp at any size and print without
the browser's "Background graphics" setting. `M_CELLS` in the script says which
symbol sits in each of the 31 places; the places themselves (`M_ICONS`) are the
same as the Science cover's in `polymathlc/cer`.

`../branding/polymath-learning-centre.png` is the full-colour logo at the top
left of the cover (2681 × 1957; the cover reserves that box before it loads).

Replacing either file: keep the sizes, the grid and the transparency, then run
`node tools/worksheet-cover-tests.mjs` (it checks all three) and the browser
test, which looks at every cover on screen and on paper.
