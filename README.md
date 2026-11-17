# natureswarm.github.io

The project page of **NatureSwarm: nature-inspired coordination for teams of language-model agents**,
served at <https://natureswarm.github.io>.

- `index.html`: the page (demos played from recorded episodes, interactive result charts, method, video, team).
- `viewer.html`: the episode viewer with the bundled recordings in `traces/`.
- `js/natureswarm-player.js`: the canvas player; `js/charts.js` and `data/results.js`: the result charts.
- `js/evolution.js` and `data/evolution.js`: the evolution demos (stored runs, generation by generation).
- `media/`: animations, the demo video, the slides and the artwork.

The site is static. To look at it locally:

```
python -m http.server 8000        # then open http://localhost:8000
```

Code, experiments and the scripts that record the episodes: <https://github.com/NatureSwarm/NatureSwarm>.
