# Sensor Experiments

Mobile-first browser lab for motion-game sensor feasibility.

**Live:** https://tslackey.github.io/sensor-experiments/

## Views

- **Lab** — DeviceMotion peak detection, tuning, swing log
- **Play** — swipeable low-poly Three.js scenes (throw / bowl / bat / golf) driven by the same swing events

## Local

```bash
python3 -m http.server 4173 --directory site
```

Open `http://localhost:4173` on a phone (HTTPS/ngrok for real sensors) or use **Simulate**.

## GitHub Pages

Workflow: `.github/workflows/deploy-pages.yml` publishes `site/` on push to `main`.
